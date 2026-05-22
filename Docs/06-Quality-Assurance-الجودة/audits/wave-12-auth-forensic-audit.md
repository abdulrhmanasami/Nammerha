# Wave 12 — تدقيق شيطاني عميق: نظام المصادقة الكامل

# Deep Forensic Audit: Full Authentication System

> **Date**: 2026-05-22
> **Session**: Wave 12 (Session 12 of Auth UX Sprint)
> **Scope**: Login + Registration + Forgot/Reset Password + Email Verification + MFA + Social Login
> **Platforms**: Web Frontend + Backend + Mobile (Flutter/Dart)
> **Files Modified**: 12
> **Methodology**: 5,200+ lines of code audited line-by-line

---

## Previous Sessions Summary (Waves 1-11)

| Wave   | Focus                                     | Fixes Applied |
| ------ | ----------------------------------------- | ------------- |
| 1-2    | Initial auth UX + ApiError codes          | ~18 fixes     |
| 3-4    | Social login + Registration wizard        | ~20 fixes     |
| 5-6    | Password security + Timer hygiene         | ~16 fixes     |
| 7-8    | Password strength DRY + MFA panel         | ~9 fixes      |
| 9-10   | Validation + Verify/Reset hardening       | ~18 fixes     |
| 11     | Deep forensic: social-only guard, cleanup | ~7 fixes      |
| **12** | **Deep forensic audit — this session**    | **13 fixes**  |

---

## Fixes Applied in Wave 12

### P0-W12-001: Registration Rate Limiter (Critical Security)

**File**: `backend/src/routes/auth.routes.ts`

**Problem**: `/register` endpoint had NO rate limiter middleware. An attacker could:

1. Email-bomb by registering unlimited new emails (each sends a verification email)
2. Bloat the database (user row + 5 profile tables + role assignments per request)
3. Exhaust CPU via bcrypt (12 rounds = ~250ms per request)

**Fix**: Added `sensitiveActionLimiter` middleware (15 requests per 15 minutes per IP).

---

### P0-W12-002: Reset Password Untracked Timer (Critical Timer Leak)

**File**: `frontend/src/pages/reset-password.ts`

**Problem**: Cooldown timer used raw `setInterval()` instead of tracked interval pattern. Same bug fixed in auth.ts during Wave 6 (P1-W6-001) but reset-password.ts was missed.

**Fix**:

1. Added module-scoped timer registry (`_activeTimers`, `createTrackedInterval`, `clearTrackedInterval`, `clearAllTrackedTimers`)
2. Migrated cooldown timer to use tracked interval
3. Added `pagehide` cleanup handler (P1-W12-001)

---

### P0-W12-003: Login Rate Limiter (Critical Security)

**File**: `backend/src/routes/auth.routes.ts`

**Problem**: `/login` endpoint relied solely on audit_trail-based lockout (5 failed attempts per email/IP). No Express-level rate limiting. Credential stuffing across many emails was unlimited.

**Fix**: Added dedicated `loginLimiter` (30 requests per 15 minutes per IP).

---

### P1-W12-001: Reset Password Missing pagehide Cleanup

**File**: `frontend/src/pages/reset-password.ts`

**Problem**: No `pagehide` handler — orphaned timers survived page navigation.

**Fix**: Added `pagehide` event listener calling `clearAllTrackedTimers()`.

---

### P1-W12-002: Anti-Enumeration Wording Leak

**File**: `frontend/src/pages/reset-password.ts`

**Problem**: "Request New Link" success fallback text was affirmative ("تم إرسال رابط إعادة التعيين" — "Reset link sent") instead of anti-enumeration wording.

**Fix**: Changed to "إذا كان بريدك مسجّلاً لدينا، ستصلك رسالة لإعادة تعيين كلمة المرور." (matches auth.ts handleForgotPassword pattern).

---

### P2-W12-003: MFA Recovery Panel Tabindex

**File**: `frontend/src/pages/auth.ts`

**Problem**: When toggling between TOTP and recovery code sections, hidden inputs remained tab-accessible to screen readers.

**Fix**: Added `tabindex="-1"` to hidden section inputs and restored on toggle.

---

### P2-W12-004: Dynamic Import Error Boundary

**File**: `frontend/src/pages/auth.ts`

**Problem**: `handleLoginRedirect()` had unprotected `await import('../auth')`. On Syria 2G, this could fail silently — user saw success banner but login redirect died.

**Fix**: Wrapped in try-catch. Fallback: redirect proceeds without setting user context in localStorage. JWT cookie is already set by backend — auth module hydrates on next page load.

---

### P2-W12-005: Cross-Tab Resend Cooldown Persistence

**File**: `frontend/src/pages/auth.ts`

**Problem**: Resend verification cooldowns were purely DOM-based — opening a second tab bypassed them.

**Fix**:

1. Added sessionStorage-based cooldown helpers (`RESEND_COOLDOWN_KEY`)
2. `isResendOnCooldown()` check at start of both resend handlers
3. `setResendCooldown(60)` when cooldown starts
4. `clearResendCooldown()` when cooldown expires

---

### P0-W12-004: Verify-Email GET→POST (Critical CSRF/Prefetch)

**Files**: `backend/src/routes/auth.routes.ts`, `backend/src/middleware/csrf.middleware.ts`, `backend/src/validation/schemas.ts`, `frontend/src/api/auth.ts`, `nammerha_mobile/lib/features/auth/repositories/auth_repository.dart`, `nammerha_mobile/lib/features/auth/bloc/verify_email_bloc.dart`

**Problem**: `GET /api/auth/verify-email/:token` was vulnerable to:

1. Email client prefetching (Gmail, Outlook pre-fetch GET URLs — verification fires before user reads email)
2. CSRF via `<img src=".../verify-email/TOKEN">` — no user consent needed
3. Token exposure in server/CDN/proxy access logs (CWE-598)
4. Token leakage via Referer header to external resources

**Fix** (cross-platform, 6 files):

1. Backend: `router.get('/verify-email/:token')` → `router.post('/verify-email')` with token in `req.body`
2. Backend: Added `verifyEmailSchema` Zod validation for POST body
3. Backend: Added `/auth/verify-email` to CSRF exempt paths
4. Frontend: `auth.verifyEmail()` changed from GET (URL path) to POST (body)
5. Mobile: `AuthRepository.verifyEmail()` changed from GET to POST with body
6. Mobile: Updated bloc comments to reflect new endpoint

---

### P2-W12-001: DRY Password Complexity Rules (Architectural Refactor)

**Files**: `backend/src/validation/schemas.ts`, `frontend/src/pages/auth.ts`, `frontend/src/pages/profile.ts`, `nammerha_mobile/lib/features/auth/screens/register_wizard_screen.dart`

**Problem**: Password complexity rules (min 8 chars, max 128, uppercase, lowercase, digit, special) were duplicated in **7 locations** across 3 platforms:

- Backend: 3 inline Zod chains (`registerSchema`, `resetPasswordSchema`, `changePasswordSchema`)
- Frontend: 2 inline regex blocks in `auth.ts` + 1 bare length check in `profile.ts`
- Mobile: 1 inline method in `register_wizard_screen.dart`

> `changePasswordSchema` had bare `.regex()` with **no validation messages** — users got cryptic Zod errors.
> `profile.ts` only checked `length < 8` — accepted 'abcdefgh' without complexity, backend then rejected with confusing 400.

**Fix** (cross-platform, 4 files):

1. Backend: Extracted `passwordSchema` Zod primitive — used by all 3 schemas
2. Frontend `auth.ts`: Imports `validatePasswordComplexity()` from `validators.ts` — replaces 2 inline regex blocks + uses shared constants
3. Frontend `profile.ts`: Imports `validatePasswordComplexity()` — fixes missing complexity validation
4. Mobile: `_validatePassword()` delegates to shared `validatePasswordComplexity()` from `password_validator.dart`

---

## Verification Results

| Check                         | Result                       |
| ----------------------------- | ---------------------------- |
| Backend `npx tsc --noEmit`    | ✅ 0 errors                  |
| Frontend `npx tsc --noEmit`   | ✅ 0 errors                  |
| Mobile `flutter analyze`      | ✅ 0 errors                  |
| No `any` types introduced     | ✅                           |
| No `@ts-ignore` introduced    | ✅                           |
| No physical CSS properties    | ✅                           |
| All innerHTML uses `esc()`    | ✅ (no innerHTML in changes) |
| No untracked intervals remain | ✅                           |
| Dark mode variants present    | ✅                           |
| No old GET pattern references | ✅                           |
| No orphaned pw inline regex   | ✅                           |
| No v19.0 in active code       | ✅                           |
| No busy-wait polling          | ✅                           |

---

## Architecture Notes for Future Sessions

### Rate Limiting Map (Post-Wave 12)

```
/register              → sensitiveActionLimiter (15/15min) ✅ NEW
/login                 → loginLimiter (30/15min) ✅ NEW
/forgot-password       → sensitiveActionLimiter (15/15min) ✅
/resend-verification   → sensitiveActionLimiter (15/15min) ✅
/reset-password        → sensitiveActionLimiter (15/15min) ✅
/change-password       → sensitiveActionLimiter (15/15min) ✅
/verify-email          → verifyEmailLimiter (20/15min) ✅ POST (was GET)
/logout                → logoutLimiter (30/15min) ✅
```

### Timer Tracking Coverage (Post-Wave 12)

```
auth.ts          → _activeTimers + pagehide cleanup ✅ (Wave 6)
reset-password.ts → _activeTimers + pagehide cleanup ✅ (Wave 12)
verify-email.ts   → No intervals used ✅
```

### Cross-Tab State Map (Post-Wave 12)

```
nmh_resend_cooldown_until  → Resend verification 60s cooldown ✅ NEW
__google_oauth_state       → Google OAuth CSRF state ✅ (Wave 5)
nm_lockout_until_*         → Login lockout display ✅ (Wave 3)
```

---

## Known Remaining Items (Future Sessions)

1. ~~**P0-W12-004**: Verify email uses GET instead of POST~~ ✅ **RESOLVED in Wave 12b**
2. ~~**P2-W12-001**: Password complexity rules duplicated 4×~~ ✅ **RESOLVED in Wave 12c** (was 7×, not 4×)
3. ~~**P3-W12-002**: Facebook SDK version hardcoded to v19.0~~ ✅ **RESOLVED in Wave 12d** (upgraded to v22.0 — URGENT: v19.0 expired May 21, 2026)
4. ~~**P3-W12-003**: Apple SDK busy-wait polling~~ ✅ **RESOLVED in Wave 12d** (event-driven await)
5. **Mobile (Flutter)**: Token URL cleanup not yet implemented in mobile WebView
6. **Backend**: Arabic translation for security alert email body (Wave 11 carry-over)
