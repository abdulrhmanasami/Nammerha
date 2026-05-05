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
        const data = await res.json() as { csrfToken?: string };
        if (!data.csrfToken) {
            throw new Error('CSRF Token missing from response payload');
        }
        return data.csrfToken;
    } catch (err) {
        // CSRF failure MUST be fatal for HttpOnly cookie sessions
        reportError(new Error('CSRF Token Handshake Failed'), { error: err instanceof Error ? err.message : String(err) });
        throw new Error(t('error_csrf_missing', 'Security connection failed. Please refresh the page to continue.'));
    }
}

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export async function request<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> ?? {}),
    };
    // V1-AUDIT FIX: JWT is now in an httpOnly cookie — no localStorage access.
    // The browser sends the cookie automatically with credentials: 'same-origin'.
    // CSRF protection is required for all state-changing (non-GET) requests.
    const method = options.method ?? 'GET';
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
    
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const startTime = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);

        try {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                ...options,
                headers,
                signal: controller.signal,
                credentials: 'same-origin', // V1-AUDIT: Send httpOnly cookie
            });

            clearTimeout(timeoutId);

            // Resilient Idempotency failover (502/503/504)
            if (!res.ok && attempt < maxRetries && [502, 503, 504].includes(res.status)) {
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt))); // Exponential backoff
                continue;
            }

            const body = await res.json() as ApiResponse<T>;

            if (!res.ok) {
                throw new Error(body.error ?? `Request failed: ${res.status}`);
            }

            // PLAT-PERF-001 FIX: Skeleton Anti-Flicker Guard (Minimum 300ms transition)
            const elapsed = Date.now() - startTime;
            if (elapsed < 300) {
                await new Promise(r => setTimeout(r, 300 - elapsed));
            }

            return body;
        } catch (err) {
            clearTimeout(timeoutId);
            
            // Retry on Network failure or Timeout if idempotent
            if (attempt < maxRetries && (err instanceof TypeError || (err instanceof DOMException && err.name === 'AbortError'))) {
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
                lastErr = err;
                continue;
            }

            // PLT-FE-002 FIX: Route ALL API failures through centralized error reporter.
            const reportedError = err instanceof DOMException && err.name === 'AbortError'
                ? new Error(`API Timeout: ${endpoint}`)
                : err instanceof Error ? err : new Error('Network error');

            reportError(reportedError, { endpoint, method: options?.method ?? 'GET' });

            if (err instanceof DOMException && err.name === 'AbortError') {
                throw new Error(t('error_timeout', 'Request timed out — please check your network connection and try again.'));
            }
            if (err instanceof Error) { throw err; }
            throw new Error(t('error_network', 'Network error'));
        }
    }
    
    // Fallback if loop ends (should never hit normally due to throw inside catch)
    if (lastErr instanceof Error) { throw lastErr; }
    throw new Error('Network error');
}
