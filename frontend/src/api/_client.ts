// ============================================================================
// Nammerha Frontend — API Client Infrastructure (GAP-P3 PLATINUM)
// ============================================================================
// Shared request() function, CSRF token management, and types used by all
// domain-specific API modules. This is the ONLY file that touches the network.
//
// Architecture: Each domain module (projects.ts, donations.ts, etc.) imports
// `request` from this file and exposes typed endpoint wrappers.
// ============================================================================

import { reportError } from '../error-reporter';
import { t } from '../utils/i18n';

// ─── P0-UXA-002 FIX: Session Expiry Mutex ───────────────────────────────────
// When JWT expires, multiple concurrent API calls all receive 401.
// Without this mutex, EACH call independently triggers:
//   clearAuth() + showToast('expired') + window.location.href redirect
// Result: 3-5 stacking toasts, multiple redirect race.
// This flag ensures only the FIRST 401 response handles the session cleanup.
// Standard: Single Responsibility, Race Condition Prevention.
let sessionExpiring = false;

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

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
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

export async function request<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { skipAntiFlicker, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((fetchOptions.headers as Record<string, string>) ?? {}),
  };
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

  const isIdempotent = !!headers['Idempotency-Key'] || method === 'GET';
  const maxRetries = isIdempotent ? 2 : 0;

  // P0-UXA-002 FIX: If session is already expiring, short-circuit immediately.
  // Don't fire another clearAuth/redirect/toast — the first 401 handler owns it.
  if (sessionExpiring) {
    return { success: false, error: 'Session expired' } as ApiResponse<T>;
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
        credentials: 'same-origin', // V1-AUDIT: Send httpOnly cookie
      });

      clearTimeout(timeoutId);

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
        if (isAuthenticated()) {
          // P0-UXA-002: Acquire mutex BEFORE any async work
          sessionExpiring = true;

          clearAuth();
          // Show session expired notification (dynamic import to avoid circular deps)
          try {
            const { showToast } = await import('../utils/toast');
            showToast(t('session_expired', 'انتهت جلستك. يرجى تسجيل الدخول مجدداً.'), 'warning');
          } catch {
            /* Toast module may not be available — non-critical */
          }
          // Redirect to login with return URL after brief delay (let toast show)
          // PLT-UX-AUD P0-SESSION-003 FIX: Added &reason=session_expired as URL fallback.
          // On Syria 2G, the dynamic toast import above may fail silently. The auth page
          // reads this parameter to display a persistent banner — independent of any import.
          const returnPath = encodeURIComponent(window.location.pathname + window.location.search);
          setTimeout(() => {
            window.location.href = `/auth.html?redirect=${returnPath}&reason=session_expired`;
          }, 1500);
          // Return a typed error response instead of throwing
          return { success: false, error: 'Session expired' } as ApiResponse<T>;
        }
      }

      const body = (await res.json()) as ApiResponse<T>;

      if (!res.ok) {
        throw new Error(body.error ?? `Request failed: ${res.status}`);
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

      return body;
    } catch (err) {
      clearTimeout(timeoutId);

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
