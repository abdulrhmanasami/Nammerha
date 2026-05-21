// ─── Auth ───────────────────────────────────────────────────────────────────
import { request } from './_client';

export const auth = {
  // UNIFIED CITIZEN: No role field — backend auto-assigns all roles.
  // W3-P2-001 FIX: Added optional phone — cross-platform registration parity.
  register: (data: { email: string; password: string; full_name: string; phone?: string }) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),

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
  verifyEmail: (token: string) => request(`/auth/verify-email/${encodeURIComponent(token)}`),

  // PLT-MAR11-006 FIX: Centralized resetPassword — replaces raw fetch in reset-password.ts
  resetPassword: (data: { token: string; new_password: string }) =>
    request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  // GAP-002 FIX: Stubbed updatePassword endpoint for authenticated profile settings
  // P1-REM-002 FIX: Added optional `remember` — backend change-password endpoint
  // uses this to set JWT expiry (30d vs 24h). Without it, post-password-change
  // sessions always expire in 24h even if user had "Remember Me" active.
  // Standard: Session Persistence Parity, FinTech UX.
  updatePassword: (data: { current_password: string; new_password: string; remember?: boolean }) =>
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
    request<{ user: { full_name?: string; email?: string; role?: string; roles?: string[] } }>(
      '/auth/me',
    ),

  // SEC-001/LOGOUT-001 FIX: Server-side logout — invalidates JWT + clears httpOnly cookie
  logout: () => request('/auth/logout', { method: 'POST' }),

  // OAuth-001: Social login — calls POST /api/auth/social
  // Same response shape as login (JWT in httpOnly cookie + user data)
  // P1-001 FIX (Wave 2): Added `remember` field — social login users now
  // benefit from the 30-day session when the Remember Me checkbox is checked.
  // Previous: `remember` was missing from type AND never sent.
  // Backend social-auth.routes.ts L429 uses this for JWT expiry calculation.
  socialLogin: (data: {
    provider: 'google' | 'apple' | 'facebook';
    id_token: string;
    full_name?: string;
    remember?: boolean;
    // SEC-2 FIX: Facebook returns an access_token (NOT a JWT id_token).
    // This metadata helps the backend distinguish token types for validation.
    token_type?: 'id_token' | 'access_token';
  }) =>
    request<{ user: unknown }>('/auth/social', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // V-005 FIX: Active Sessions Management
  // Lists all active sessions (devices) for the authenticated user.
  getSessions: () =>
    request<{
      sessions: Array<{
        device_id: string | null;
        platform: string | null;
        created_at: string;
        expires_at: string;
        is_current: boolean;
      }>;
      total: number;
    }>('/auth/sessions', { skipAntiFlicker: true }),

  // V-005 FIX: Revoke a specific device session
  revokeDevice: (deviceId: string) =>
    request<{ revoked_count: number }>(`/auth/sessions/${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
    }),

  // V-005 FIX: Revoke ALL sessions (nuclear logout)
  revokeAllSessions: () =>
    request<{ revoked_count: number }>('/auth/sessions', {
      method: 'DELETE',
    }),

  // ── MFA/2FA (Migration 046) ─────────────────────────────────────────────
  // TOTP-based two-factor authentication endpoints.

  /** Begin MFA enrollment — returns QR code + manual secret key */
  mfaSetup: () =>
    request<{ secret: string; otpauth_uri: string; qr_data_url: string }>(
      '/auth/mfa/setup',
      { method: 'POST' },
    ),

  /** Confirm enrollment with first TOTP code → returns recovery codes */
  mfaConfirm: (data: { token: string }) =>
    request<{ recovery_codes: string[]; message: string }>('/auth/mfa/confirm', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Login MFA challenge — verify TOTP code */
  mfaVerify: (data: { mfa_token: string; code: string }) =>
    request<{ user: unknown }>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Login MFA challenge — verify recovery code */
  mfaRecovery: (data: { mfa_token: string; recovery_code: string }) =>
    request<{ user: unknown }>('/auth/mfa/recovery', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Disable MFA (requires password confirmation) */
  mfaDisable: (data: { password: string }) =>
    request('/auth/mfa/disable', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Get MFA status for profile page */
  mfaStatus: () =>
    request<{
      enabled: boolean;
      enforced_at: string | null;
      recovery_codes_remaining: number;
    }>('/auth/mfa/status', { skipAntiFlicker: true }),

  /** Regenerate recovery codes (old codes invalidated) */
  mfaRegenerateCodes: () =>
    request<{ recovery_codes: string[]; message: string }>('/auth/mfa/recovery-codes', {
      method: 'POST',
    }),

  // ── Account Deletion (GDPR Art. 17) ─────────────────────────────────────

  /** Request account deletion — requires password + confirmation text */
  deleteAccount: (data: { password: string; confirmation: string; reason?: string }) =>
    request<{
      request_id: string;
      grace_period_ends: string;
      grace_period_days: number;
      message: string;
      message_ar: string;
    }>('/auth/account/delete', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Cancel pending account deletion */
  cancelDeletion: () =>
    request<{ message: string; message_ar: string }>('/auth/account/cancel-deletion', {
      method: 'POST',
    }),

  /** Get account deletion status */
  deletionStatus: () =>
    request<{
      deletion_pending: boolean;
      deleted_at: string | null;
      grace_period_ends: string | null;
      days_remaining: number | null;
    }>('/auth/account/deletion-status'),
};

// ─── SEC-001 FIX: Role Management (centralized) ────────────────────────────
// UNIFIED CITIZEN: roles.switch() removed — backend returns 410 Gone.
// Only getMyRoles, getAvailable, and activate remain functional.
export const roles = {
  /** GET /api/roles/my-roles — Current user's active roles */
  getMyRoles: () =>
    request<{ roles: { role_name: string; status: string; is_primary: boolean }[] }>(
      '/roles/my-roles',
    ),

  /** GET /api/roles/available — Roles the user can still activate */
  getAvailable: () =>
    request<{ role_name: string; display_name_en: string; display_name_ar: string }[]>(
      '/roles/available',
    ),

  /** POST /api/roles/activate — Activate a new role */
  activate: (role: string) =>
    request('/roles/activate', {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),
};
