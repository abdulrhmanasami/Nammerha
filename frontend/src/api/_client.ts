// ============================================================================
// Nammerha Frontend — API Client Infrastructure (GAP-P3 PLATINUM)
// ============================================================================
// Shared request() function, CSRF token management, and types used by all
// domain-specific API modules. This is the ONLY file that touches the network.
//
// Architecture: Each domain module (projects.ts, payments.ts, etc.) imports
// `request` from this file and exposes typed endpoint wrappers.
// ============================================================================

import { reportError } from '../error-reporter';
import { t } from '../utils/i18n';
// P0-PLT-002 FIX: Track session freshness for timeout warning.
import { markSessionActivity } from '../utils/session-timeout';

// ─── P0-UXA-002 FIX: Session Expiry Mutex ───────────────────────────────────
// When JWT expires, multiple concurrent API calls all receive 401.
// Without this mutex, EACH call independently triggers:
//   clearAuth() + showToast('expired') + window.location.href redirect
// Result: 3-5 stacking toasts, multiple redirect race.
// This flag ensures only the FIRST 401 response handles the session cleanup.
// Standard: Single Responsibility, Race Condition Prevention.
let sessionExpiring = false;
let activeReauthPromise: Promise<boolean> | null = null;

// ─── PLATINUM FIX: Async DOM Disassociation Guard ─────────────────────────
let globalRouteAbortController = new AbortController();

export function abortPendingRouteRequests() {
  globalRouteAbortController.abort();
  globalRouteAbortController = new AbortController();
}

// ─── PLATINUM FIX: Pessimistic Epoch Locking ──────────────────────────────
let lastMutationEpoch = 0;

export class StaleEpochError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaleEpochError';
  }
}

export const API_BASE = '/api';

// ─── P1-NEW-002 FIX: CSRF Token Management ─────────────────────────────────
// SEC-001 FATAL FLAW FIX: The platform relies on HttpOnly cookies for JWTs (V1-AUDIT).
// Therefore, Bearer fallback is a hallucination. Without CSRF, state-changing requests
// are exposed to Cross-Site Request Forgery. Failure to acquire CSRF MUST block the request.
async function ensureCsrfToken(): Promise<string> {
  // Check if a CSRF token cookie already exists
  const existing = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/)?.[1];
  if (existing) {
    return existing;
  }

  // Fetch a new CSRF token from the backend
  try {
    const res = await fetch(`${API_BASE}/csrf-token`, { credentials: 'same-origin' });
    if (!res.ok) {
      throw new Error(`Failed to fetch CSRF: ${res.status}`);
    }
    const data = (await res.json()) as { csrfToken?: string };
    if (!data.csrfToken) {
      throw new Error('CSRF Token missing from response payload');
    }
    return data.csrfToken;
  } catch (err) {
    // CSRF failure MUST be fatal for HttpOnly cookie sessions
    reportError(new Error('CSRF Token Handshake Failed'), {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error(t('error_csrf_missing', 'فشل الاتصال الآمن. يرجى تحديث الصفحة للمتابعة.'));
  }
}

// ─── W3-P2-002 FIX: CSRF Pre-Warm ──────────────────────────────────────────
// Auth page calls this on load (before user interaction) to pre-fetch the CSRF
// token. On Syria 2G, the first POST without this adds 2-5s invisible delay
// between clicking "Sign In" and the actual API call.
// Fire-and-forget — failures are non-fatal (CSRF is retried on actual request).
// Standard: Web Vitals (TBT), PRPL Pattern, Proactive Resource Loading.
// ────────────────────────────────────────────────────────────────────────────
export function warmCsrf(): void {
  ensureCsrfToken().catch(() => {
    /* Non-fatal: CSRF will be retried on first POST request */
  });
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ─── P0-002 FIX (Wave 2): Structured API Error ──────────────────────────────
// ROOT CAUSE: The previous `throw new Error(body.error)` at L190 discarded the
// entire response body — including the `code` field that the backend sends for
// recoverable error states (EMAIL_NOT_VERIFIED, SOCIAL_ONLY_ACCOUNT, ACCOUNT_LOCKED).
// Frontend catch blocks received only a string message and could never detect
// the specific error condition. This rendered ALL error-code-specific UX
// (e.g., showInlineResendVerification) as unreachable dead code.
//
// FIX: ApiError extends Error and preserves `status`, `code`, and the full
// `ApiResponse` body. Frontend catch blocks can now `instanceof ApiError`
// and inspect `error.code` for conditional UX rendering.
// Standard: Structured Error Handling, Zero Information Loss.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly response: ApiResponse;

  constructor(message: string, status: number, response: ApiResponse) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = (response as unknown as Record<string, unknown>).code as string | undefined;
    this.response = response;
  }
}

interface RequestOptions extends RequestInit {
  /**
   * P2-UXA-005 FIX: Skip the 300ms anti-flicker delay for this request.
   * Set to true for requests that don't trigger skeleton loaders
   * (e.g., KPI refreshes, background syncs, toast-only responses).
   * Default: false (delay IS applied — safe default for skeleton-bearing pages).
   */
  skipAntiFlicker?: boolean;
}

// ─── PLATINUM FIX: In-Flight Mutation Multiplexer (Double-Tap Annihilation) ──
const inFlightMutations = new Map<string, Promise<ApiResponse<any>>>();

export function request<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const method = options.method ?? 'GET';
  
  // Intercept identical concurrent POST/PUT/DELETE requests
  if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
    // PLATINUM FIX: Binary Data Cross-Pollination (Zero-Day P0-DATA)
    // Using a static string for FormData causes concurrent uploads to collide and drop data.
    const idempotencyKey = (options.headers as Record<string, string>)?.['Idempotency-Key'];
    let bodyStr = typeof options.body === 'string' ? options.body : null;
    
    // PLATINUM FIX: Deterministic Binary Hashing (Prevent Double-Submission)
    // Generating a unique UUID bypassed the multiplexer. We now hash FormData content
    // to correctly intercept double-taps on upload buttons.
    if (!bodyStr && !idempotencyKey) {
      if (typeof FormData !== 'undefined' && options.body instanceof FormData) {
        let hashStr = 'formdata_';
        options.body.forEach((value, key) => {
          if (value instanceof File) {
            hashStr += `${key}:${value.name}:${value.size}|`;
          } else {
            hashStr += `${key}:${String(value)}|`;
          }
        });
        bodyStr = hashStr;
      } else {
        bodyStr = `binary_${crypto.randomUUID()}`;
      }
    }
    
    const mutationKey = idempotencyKey 
      ? `${method}:${endpoint}:idemp_${idempotencyKey}` 
      : `${method}:${endpoint}:${bodyStr}`;
    
    if (inFlightMutations.has(mutationKey)) {
      console.warn(`[State Guard] Intercepted and multiplexed duplicate concurrent mutation to ${endpoint}.`);
      return inFlightMutations.get(mutationKey) as Promise<ApiResponse<T>>;
    }
    
    const promise = _requestInternal<T>(endpoint, options).finally(() => {
      if (inFlightMutations.get(mutationKey) === promise) {
        inFlightMutations.delete(mutationKey);
      }
    });
    
    inFlightMutations.set(mutationKey, promise);
    return promise;
  }
  
  return _requestInternal<T>(endpoint, options);
}

async function _requestInternal<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  // P1-UX FIX: Offline Form Submission Blackhole Prevention
  // Intercept offline state before attempting fetch, avoiding generic
  // "network error" states that don't explain to users their connection dropped.
  if (!navigator.onLine) {
    import('../utils/toast')
      .then(({ showToast }) => {
        showToast(t('error_offline', 'لا يوجد اتصال بالإنترنت. يرجى التحقق من الشبكة.'), 'error');
      })
      .catch(() => {});
    throw new Error(t('error_offline', 'لا يوجد اتصال بالإنترنت. يرجى التحقق من الشبكة.'));
  }

  const { skipAntiFlicker, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((fetchOptions.headers as Record<string, string>) ?? {}),
  };

  // PLATINUM FIX: X-Guest-Mode Enforcement
  // Explicitly tell the backend to ignore any zombie HttpOnly cookies if the user
  // is locally unauthenticated (localStorage session is absent).
  // This perfectly neutralizes the Resurrection Vector without blocking public endpoints.
  try {
    if (!localStorage.getItem('nammerha_auth')) {
      headers['X-Guest-Mode'] = 'true';
    }
  } catch {
    // Silent fallback if storage is restricted
  }
  // V1-AUDIT FIX: JWT is now in an httpOnly cookie — no localStorage access.
  // The browser sends the cookie automatically with credentials: 'same-origin'.
  // CSRF protection is required for all state-changing (non-GET) requests.
  const method = fetchOptions.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const csrfToken = await ensureCsrfToken();
    headers['X-CSRF-Token'] = csrfToken;
  }

  // P3-NEW-001 FIX: Guard dev header with Vite env check.
  // import.meta.env.DEV is tree-shaken in production builds,
  // eliminating unnecessary localStorage probing and header pollution.
  if (import.meta.env.DEV) {
    const devUserId = localStorage.getItem('nammerha_dev_user_id');
    if (devUserId) {
      headers['X-User-Id'] = devUserId;
    }
  }

  // P2-AUTH-004 FIX: Send user's chosen Nammerha locale for email language.
  // PREVIOUS: Backend used Accept-Language header (browser language setting).
  // If a Syrian user's browser was set to English but they use the Arabic UI,
  // they'd receive English verification/reset emails.
  // NOW: X-Locale header takes precedence over Accept-Language in backend.
  // Standard: i18n Best Practices, User Language Preference.
  try {
    const userLocale = localStorage.getItem('nm-locale');
    if (userLocale) {
      headers['X-Locale'] = userLocale;
    }
  } catch {
    /* localStorage may be unavailable */
  }

  const isIdempotent = !!headers['Idempotency-Key'] || method === 'GET';
  let maxRetries = isIdempotent ? 2 : 0;

  // P0-UXA-002 FIX: If session is already expiring, short-circuit immediately.
  // Don't fire another clearAuth/redirect/toast — the first 401 handler owns it.
  if (sessionExpiring) {
    return { success: false, error: 'Session expired' } as ApiResponse<T>;
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();
    const controller = new AbortController();

    // Wire the global route abort controller to this specific request's controller
    const abortOnNav = () => controller.abort();
    globalRouteAbortController.signal.addEventListener('abort', abortOnNav);

    // P1-UXA-007 FIX: Lie-Fi Syndrome - Reduce timeout to 8s instead of 30s
    const timeoutId = setTimeout(() => controller.abort(), 8_000);

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
        credentials: 'same-origin', // V1-AUDIT: Send httpOnly cookie
      });

      clearTimeout(timeoutId);
      globalRouteAbortController.signal.removeEventListener('abort', abortOnNav);

      // Resilient Idempotency failover (502/503/504)
      if (!res.ok && attempt < maxRetries && [502, 503, 504].includes(res.status)) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt))); // Exponential backoff
        continue;
      }

      // ─── FORENSIC-C5.1 FIX: JWT Session Expiry Interceptor ──────────
      // Professional SPA pattern: detect httpOnly JWT expiry by observing
      // 401 responses. When the frontend thinks the user is logged in
      // (localStorage session exists) but the JWT cookie has expired,
      // clear the stale session and redirect to login.
      //
      // Without this: user sees repeated cryptic API errors on every page
      // because localStorage says "logged in" but every request fails.
      if (res.status === 401) {
        // P0-UXA-002 FIX: Mutex — only the first 401 handles cleanup.
        // Subsequent concurrent 401s short-circuit silently.
        if (sessionExpiring) {
          return { success: false, error: 'Session expired' } as ApiResponse<T>;
        }

        const { isAuthenticated, clearAuth } = await import('../auth');

        // PLATINUM FIX: Zombie Tab API Dead End Prevention
        // If the user's session was killed in another tab, this tab becomes a zombie
        // with no local session. isAuthenticated() returns false.
        // We MUST force the In-Place Re-auth modal to appear anyway to save their
        // unsaved form data. We identify zombie tabs via the orphaned UID.
        const isZombieTab = !!sessionStorage.getItem('nammerha_orphaned_uid');
        if (isAuthenticated() || isZombieTab) {
          // P4-UXA-006 FIX: In-Place Re-auth (Global 401 Interceptor)
          // Don't nuke the session and redirect immediately. Pause and prompt!
          if (!activeReauthPromise) {
            // DEMONIC UX FIX: The Offline Re-Auth Blackhole
            // If offline when 401 hits, the iframe will show Chrome's Dinosaur.
            // Freeze the promise until online, then let it retry (which will open the modal).
            if (!navigator.onLine) {
              import('../utils/toast')
                .then(({ showToast }) => {
                  showToast(
                    t(
                      'offline_reauth_wait',
                      'انتهت الجلسة والشبكة مقطوعة. يرجى الانتظار لحين عودة الاتصال.',
                    ),
                    'warning',
                  );
                })
                .catch(() => {});

              activeReauthPromise = new Promise<boolean>((resolve) => {
                const onOnline = () => {
                  window.removeEventListener('online', onOnline);
                  activeReauthPromise = null;
                  resolve(true); // Retry!
                };
                window.addEventListener('online', onOnline);
              });
            } else {
              activeReauthPromise = new Promise<boolean>((resolve) => {
                import('../utils/toast')
                  .then(({ showToast }) => {
                    showToast(
                      t(
                        'session_expired_reauth',
                        'انتهت الجلسة. يرجى تسجيل الدخول مجدداً للمتابعة.',
                      ),
                      'warning',
                    );
                  })
                  .catch(() => {});

                // PLATINUM FIX: Viewport Overflow Paradox & Body Scroll Lock
                const modal = document.createElement('div');
                modal.id = 'nm-reauth-modal';
                modal.innerHTML = `
                  <div class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in-up">
                    <div class="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md h-[min(550px,calc(100dvh-2rem))] overflow-hidden relative mx-4">
                      <button id="close-reauth" class="absolute top-4 end-4 z-10 text-slate-400 hover:text-slate-600 bg-white/80 dark:bg-slate-800/80 rounded-full w-8 h-8 flex items-center justify-center">
                        <i class="ph ph-x"></i>
                      </button>
                      <iframe src="/auth.html?mode=modal" class="w-full h-full border-none"></iframe>
                    </div>
                  </div>
                `;
                document.body.appendChild(modal);
                document.body.classList.add('overflow-hidden');

                const cleanup = () => {
                  window.removeEventListener('message', onMessage);
                  window.removeEventListener('keydown', onKeyDown, true);
                  window.removeEventListener('popstate', onPopState);
                  document.body.classList.remove('overflow-hidden');
                  modal.remove();
                  activeReauthPromise = null;
                };

                const closeAction = () => {
                  cleanup();
                  sessionExpiring = true;
                  clearAuth();
                  window.location.href = '/auth.html?reason=session_expired';
                  resolve(false);
                };

                // PLATINUM FIX: The Re-Auth Modal "Keyboard Trap" (Esc Key Blackhole)
                const onKeyDown = (e: KeyboardEvent) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    closeAction();
                  }
                };

                // PLATINUM FIX: History State Leak on physical Back Button
                const onPopState = () => {
                  closeAction();
                };

                const onMessage = (e: MessageEvent) => {
                  // PLATINUM FIX: Zero-Trust Origin Verification
                  // Never trust window messages without validating the cryptographic boundary
                  if (e.origin !== window.location.origin) {
                    console.warn(
                      '[Security Guard] Blocked cross-origin auth message from:',
                      e.origin,
                    );
                    return;
                  }

                  if (e.data === 'nm_auth_success') {
                    cleanup();
                    resolve(true); // Retry!
                  }
                };

                window.addEventListener('message', onMessage);
                window.addEventListener('keydown', onKeyDown, true);
                window.addEventListener('popstate', onPopState);

                modal.querySelector('#close-reauth')?.addEventListener('click', closeAction);
              });
            }
          }

          const success = await activeReauthPromise;
          if (success) {
            // Replay the request!
            maxRetries++;
            continue;
          }
          return { success: false, error: 'Session expired' } as ApiResponse<T>;
        }
      }

      const body = (await res.json()) as ApiResponse<T>;

      if (method === 'GET' && startTime < lastMutationEpoch) {
        console.warn(
          `[State Guard] Discarding stale GET response from ${endpoint} due to concurrent mutation.`,
        );
        // PLATINUM FIX: Throw explicit StaleEpochError instead of generic AbortError
        throw new StaleEpochError('Stale GET response due to concurrent mutation');
      }

      // P0-002 FIX (Wave 2): Throw ApiError instead of Error.
      // Previous: throw new Error(body.error) — discarded status, code, and full body.
      // Now: ApiError preserves everything for structured catch-block handling.
      if (!res.ok) {
        throw new ApiError(body.error ?? `Request failed: ${res.status}`, res.status, body);
      }

      // PLATINUM FIX: Guard form commit to fire ONLY on successful mutation.
      // Previous: Fired before checking !res.ok, causing 400/500 errors to permanently wipe user drafts.
      if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
        lastMutationEpoch = Date.now();
        // PLATINUM FIX: Removed orphaned nm_form_committed broadcast to prevent cross-pollination.
        // Specific forms must explicitly broadcast nm_clear_specific_draft instead.
      }

      // PLAT-PERF-001 FIX: Skeleton Anti-Flicker Guard (Minimum 300ms transition)
      // P2-UXA-005 FIX: Now opt-out via skipAntiFlicker option.
      // Previous: Applied to ALL requests — fast KPI refreshes, background syncs,
      // and cached responses were artificially delayed by 300ms.
      // Now: Only skeleton-bearing page loads pay this cost.
      if (!skipAntiFlicker) {
        const elapsed = Date.now() - startTime;
        if (elapsed < 300) {
          await new Promise((r) => setTimeout(r, 300 - elapsed));
        }
      }

      // P0-PLT-002 FIX: Mark session activity on every successful API response.
      // This resets the session timeout warning countdown.
      markSessionActivity();

      return body;
    } catch (err) {
      clearTimeout(timeoutId);
      globalRouteAbortController.signal.removeEventListener('abort', abortOnNav);

      // PLATINUM FIX: Silently swallow StaleEpochError to prevent false Network Timeout toasts.
      // This mathematically guarantees "Zero-Jank" during rapid state mutations.
      if (err instanceof StaleEpochError) {
        return { success: false, error: 'Stale Epoch Skipped' } as unknown as ApiResponse<T>;
      }

      // PLATINUM FIX: Stream Consumption Guard for In-Place Re-auth
      if (err instanceof TypeError && fetchOptions.body instanceof ReadableStream && attempt > 0) {
        throw new Error(
          t(
            'error_stream_consumed',
            'تم استهلاك البيانات. يرجى إعادة إرفاق الملفات والمحاولة مجدداً.',
          ),
        );
      }

      // Retry on Network failure or Timeout if idempotent
      if (
        attempt < maxRetries &&
        (err instanceof TypeError || (err instanceof DOMException && err.name === 'AbortError'))
      ) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        lastErr = err;
        continue;
      }

      // PLT-FE-002 FIX: Route ALL API failures through centralized error reporter.
      const reportedError =
        err instanceof DOMException && err.name === 'AbortError'
          ? new Error(`API Timeout: ${endpoint}`)
          : err instanceof Error
            ? err
            : new Error('Network error');

      reportError(reportedError, { endpoint, method: fetchOptions?.method ?? 'GET' });

      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(
          t('error_timeout', 'انتهت مهلة الطلب — تحقق من اتصالك بالشبكة وحاول مجدداً.'),
        );
      }
      if (err instanceof Error) {
        throw err;
      }
      throw new Error(t('error_network', 'خطأ بالشبكة'));
    }
  }

  // Fallback if loop ends (should never hit normally due to throw inside catch)
  if (lastErr instanceof Error) {
    throw lastErr;
  }
  throw new Error('Network error');
}
