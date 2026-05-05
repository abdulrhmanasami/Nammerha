// ─── Auth ───────────────────────────────────────────────────────────────────
import { request } from './_client';

export const auth = {
    register: (data: {
        email: string;
        password: string;
        full_name: string;
        role?: 'homeowner' | 'engineer' | 'donor' | 'supplier' | 'contractor' | 'tradesperson';
        /** GAP-01: User's self-declared intent from registration cards */
        intent?: string;
    }) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),

    login: (data: { email: string; password: string; remember?: boolean }) =>
        // FIX-02: JWT is in httpOnly cookie — not in response body (NMR-AUD-H001).
        request<{ user: unknown }>('/auth/login', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // PLT-MAR11-004 FIX: Centralized forgotPassword — replaces raw fetch in auth.ts
    forgotPassword: (data: { email: string }) =>
        request('/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // PLT-MAR11-006 FIX: Centralized verifyEmail — replaces raw fetch in verify-email.ts
    verifyEmail: (token: string) =>
        request(`/auth/verify-email/${encodeURIComponent(token)}`),

    // PLT-MAR11-006 FIX: Centralized resetPassword — replaces raw fetch in reset-password.ts
    resetPassword: (data: { token: string; new_password: string }) =>
        request('/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    // GAP-002 FIX: Stubbed updatePassword endpoint for authenticated profile settings
    updatePassword: (data: { current_password: string; new_password: string }) =>
        request('/auth/change-password', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // PLT-AUTH-002 FIX: No longer requires auth — accepts email in body.
    // Unverified users can't login, so the previous auth-gated endpoint
    // was an inescapable dead-end.
    resendVerification: (data: { email: string }) =>
        request('/auth/resend-verification', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // SEC-001 FIX: Centralized getMe — replaces raw fetch in profile.ts
    getMe: () =>
        request<{ user: { full_name?: string; email?: string; role?: string; roles?: string[] } }>('/auth/me'),

    // SEC-001/LOGOUT-001 FIX: Server-side logout — invalidates JWT + clears httpOnly cookie
    logout: () =>
        request('/auth/logout', { method: 'POST' }),
};

// ─── SEC-001 FIX: Role Management (centralized) ────────────────────────────
// Replaces raw fetch() calls in profile.ts and role-switcher.ts that were
// missing CSRF token, AbortController timeout, and centralized error reporting.
export const roles = {
    /** GET /api/roles/my-roles — Current user's active roles */
    getMyRoles: () =>
        request<{ roles: { role_name: string; status: string; is_primary: boolean }[]; activeRole?: string }>('/roles/my-roles'),

    /** GET /api/roles/available — Roles the user can still activate */
    getAvailable: () =>
        request<{ role_name: string; display_name_en: string; display_name_ar: string }[]>('/roles/available'),

    /** POST /api/roles/activate — Activate a new role */
    activate: (role: string) =>
        request('/roles/activate', {
            method: 'POST',
            body: JSON.stringify({ role }),
        }),

    /** POST /api/roles/switch — Switch active role context */
    switch: (role: string) =>
        request('/roles/switch', {
            method: 'POST',
            body: JSON.stringify({ role }),
        }),
};
