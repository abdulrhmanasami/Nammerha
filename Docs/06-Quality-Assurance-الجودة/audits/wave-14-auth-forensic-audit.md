# 🔥 Wave 14 — Auth System Forensic Audit (الموجة ١٤ — تدقيق جنائي لنظام المصادقة)

> **Auditor**: Titan-Architect | **Date**: 2026-05-22
> **Scope**: Login, Registration, Password Reset, Email Verification
> **Platforms**: Web Frontend (`auth.ts` 3300L) · Backend (`auth.routes.ts` 1525L) · Flutter Mobile (900+L)
> **Previous Audits**: Wave 11, 12, 13 — all reviewed and cross-referenced

---

## Executive Summary

After performing a line-by-line forensic analysis across all three platforms, the Nammerha auth system is in **strong shape** — Waves 11-13 addressed the critical architectural issues (TOCTOU races, CSRF, token hashing, XSS, RTL, DRY violations, anti-enumeration). The codebase demonstrates exceptional defensive engineering with deep comments tracing every fix to its root cause.

However, I've identified **14 remaining issues** organized by severity. These represent the delta between the current state and ISO/IEC 25010 Platinum certification.

---

## 🚨 CRITICAL (P0) — Must Fix Before Production

### P0-W14-001: Registration Rate Limit Lockout Has No Countdown Timer

**Platform**: Web Frontend
**File**: [auth.ts](file:///Users/abdulrahman/Github/Nammerha/frontend/src/pages/auth.ts#L1431-L1440)

**Current State**: When registration hits HTTP 429, the error handler shows the raw backend message or a static "محاولات كثيرة" banner. Unlike the login flow (which has full countdown timer logic at L1227-1292), registration gives ZERO indication of how long the user must wait.

**User Impact**: A Syrian user on 2G fills the 3-step wizard, submits, gets 429 → sees "Too many attempts" → waits 30 seconds → retries → 429 again → has no idea the lockout is 15 minutes → gives up. **This is a registration dead-end for every rate-limited new user.**

**Root Cause**: The login handler at L1227 parses `minuteMatch` from the backend message and creates a `createTrackedInterval` countdown. The registration catch at L1431 only does:

```typescript
if (err.status === 429) {
  showBanner('error', err.message || t('auth_rate_limited', '...'));
}
```

No minute parsing, no countdown, no sessionStorage persistence.

**Fix**: Mirror the login 429 handler logic (L1227-1292) into the registration catch block. Extract a shared `showRateLimitCountdown()` utility.

---

### P0-W14-002: Mobile Registration Missing `phone` Field — Backend Schema Mismatch

**Platform**: Flutter Mobile
**Files**: [auth_bloc.dart](file:///Users/abdulrahman/Github/Nammerha/nammerha_mobile/lib/features/auth/bloc/auth_bloc.dart#L38-L48) → [auth_repository.dart](file:///Users/abdulrahman/Github/Nammerha/nammerha_mobile/lib/features/auth/repositories/auth_repository.dart#L62-L80)

**Current State**: The `AuthRegisterRequested` event only carries `email`, `password`, and `fullName` — no `phone` field. The `AuthRepository.register()` method accepts an optional `phone` parameter, but `AuthBloc._onRegister()` never passes it:

```dart
final message = await _authRepository.register(
  email: event.email,
  password: event.password,
  fullName: event.fullName,
  // ❌ phone: event.phone — missing!
);
```

**Root Cause**: When the web frontend added phone (W3-P2-001 at [auth.ts L1358](file:///Users/abdulrahman/Github/Nammerha/frontend/src/pages/auth.ts#L1358)), the mobile BLoC event was never updated.

**Impact**: Web users can register with phone numbers; mobile users cannot. Cross-platform parity violation.

**Fix**: Add `String? phone` to `AuthRegisterRequested` event, wire it through the BLoC handler, and ensure the registration screen collects and passes it.

---

### P0-W14-003: Password Reuse Check Consumes Reset Token — User Trapped

**Platform**: Backend
**File**: [auth.routes.ts](file:///Users/abdulrahman/Github/Nammerha/backend/src/routes/auth.routes.ts#L1055-L1097)

**Current State**: The `POST /api/auth/reset-password` endpoint uses atomic `UPDATE...RETURNING` to consume the token (L1062-1070). Then at L1088-1096, it checks if the new password matches the current hash. If it does, it returns 400 "New password must be different" — **but the token is already consumed**.

The user must now:

1. Go back to the login page
2. Click "Forgot Password" again
3. Wait for a new email
4. Click the new link
5. Enter a _different_ password

**Severity**: The code comment at L1084-1087 explicitly acknowledges this is by design for security (prevents attackers from retrying), but it's terrible UX for legitimate users who just wanted to keep their password. The inline comment says "correct security trade-off" — but NIST SP 800-63B §5.1.1.2 actually recommends NOT enforcing password history on resets, only on changes.

> [!IMPORTANT]
> **Design Decision Required**: Should the password-reuse check on reset be removed (NIST recommendation) or kept with UX mitigation (warn the user before consuming the token)?

---

## 🔴 HIGH (P1) — Should Fix This Sprint

### P1-W14-001: Mobile Social Login Missing MFA Challenge Gate

**Platform**: Flutter Mobile
**File**: [auth_bloc.dart](file:///Users/abdulrahman/Github/Nammerha/nammerha_mobile/lib/features/auth/bloc/auth_bloc.dart#L214-L234)

**Current State**: The `_onSocialLogin` handler directly emits `AuthAuthenticated(user)` on success. There's NO MFA challenge detection — unlike the web frontend which checks `data.mfa_required && data.mfa_token` at [auth.ts L2397](file:///Users/abdulrahman/Github/Nammerha/frontend/src/pages/auth.ts#L2397).

If a user enables MFA via the web, then tries social login on mobile → the backend returns `{ mfa_required: true, mfa_token: "..." }` → the mobile BLoC receives `response.data` but tries to parse `.user` → throws `type 'Null' is not a subtype of type 'Map<String, dynamic>'` → emits `AuthError` with a cryptic cast error.

**Impact**: MFA users are **completely locked out of the mobile app** when using social login.

**Fix**: Add `AuthMfaRequired` state to the BLoC, detect `mfa_required` in both `_onLogin` and `_onSocialLogin`, and build a TOTP entry screen.

---

### P1-W14-002: Mobile Login Missing MFA Challenge Gate

**Platform**: Flutter Mobile
**File**: [auth_bloc.dart](file:///Users/abdulrahman/Github/Nammerha/nammerha_mobile/lib/features/auth/bloc/auth_bloc.dart#L331-L363)

**Current State**: Same issue as P1-W14-001 but for email login. The `_onLogin` handler at L334 calls `_authRepository.login()` which expects `response.data['user']` at [auth_repository.dart L107](file:///Users/abdulrahman/Github/Nammerha/nammerha_mobile/lib/features/auth/repositories/auth_repository.dart#L107). When backend returns MFA challenge instead of user data, this line crashes with a null cast error.

**Impact**: MFA users are **completely locked out of the mobile app** for ALL login methods.

**Fix**: Repository `login()` must detect `data['mfa_required'] == true` and return a distinct type (e.g., `LoginResult.mfaRequired(token)` sealed class instead of `NammerhaUser`).

---

### P1-W14-003: Frontend Forgot-Password Cooldown Not Persisted in SessionStorage

**Platform**: Web Frontend
**File**: [auth.ts](file:///Users/abdulrahman/Github/Nammerha/frontend/src/pages/auth.ts#L1564-L1581)

**Current State**: The forgot-password handler at L1572 creates a 60s cooldown timer, but unlike the resend-verification handler (which uses `setResendCooldown(60)` with sessionStorage at L1731), the forgot-password cooldown is **purely DOM-based**. Opening a second tab or refreshing the page bypasses it entirely.

**Inconsistency**: The resend-verification cooldown uses cross-tab sessionStorage persistence (P2-W12-005 fix). The forgot-password cooldown does NOT — creating asymmetric protection.

**Fix**: Call `setResendCooldown(60)` in the forgot-password handler's finally block (or create a separate `setForgotPwCooldown()` key to avoid key collision with resend).

---

### P1-W14-004: Backend Registration Anti-Enumeration Leaks via Timing

**Platform**: Backend
**File**: [auth.routes.ts](file:///Users/abdulrahman/Github/Nammerha/backend/src/routes/auth.routes.ts) (registration handler)

**Current State**: The registration endpoint runs bcrypt hashing (~10-12 cost factor, ~200-300ms) ONLY for new users. For existing emails, it returns immediately with the anti-enumeration "success" response. This creates a measurable timing side-channel:

- New email → 300-500ms response (bcrypt + DB insert + email queue)
- Existing email → 5-20ms response (early return after SELECT)

An attacker can enumerate valid emails by measuring response times, even though both return `{ success: true }`.

**Fix**: Add a `bcrypt.hash(randomBytes(16), saltRounds)` dummy computation in the "email exists" branch to normalize response time. This is the same pattern recommended by OWASP for anti-enumeration.

---

### P1-W14-005: Social Login `handleSocialLoginSuccess` Swallows MFA on `!response.success`

**Platform**: Web Frontend
**File**: [auth.ts](file:///Users/abdulrahman/Github/Nammerha/frontend/src/pages/auth.ts#L2393-L2403)

**Current State**: The function checks `!response.success || !response.data?.user` first (L2393). If the backend returns `{ success: true, data: { mfa_required: true, mfa_token: "..." } }`, the `!response.data?.user` check is true (user is null for MFA challenges) — so it enters the error path.

Inside that error path, L2397 correctly detects `mfa_required` and calls `showMfaChallengePanel`. But the function structure is fragile — the MFA detection is buried inside a "not success" branch that ALSO handles actual errors. A future refactor could easily break this.

**Fix**: Check MFA challenge FIRST (before the error check) as a separate condition.

---

## 🟡 MEDIUM (P2) — Should Fix This Cycle

### P2-W14-001: Mobile `forgotPassword` Returns Raw Backend Message (Not i18n)

**Platform**: Flutter Mobile
**File**: [auth_repository.dart](file:///Users/abdulrahman/Github/Nammerha/nammerha_mobile/lib/features/auth/repositories/auth_repository.dart#L194-L202)

**Current State**: `forgotPassword()` returns `response.message ?? ErrorKeys.resetLinkSent`. The backend's anti-enumeration message is in English: _"If an account with that email exists, a password reset link has been sent."_ This raw English string is shown to Arabic users.

The BLoC's `_onForgotPassword` handler emits `AuthPasswordResetSent(message)` — the UI screen displays it directly.

**Fix**: Always return `ErrorKeys.resetLinkSent` regardless of backend message (anti-enumeration requires identical client-side wording). Let the i18n system translate it.

---

### P2-W14-002: `resendVerification` Returns Raw Backend Message (Same Pattern)

**Platform**: Flutter Mobile
**File**: [auth_repository.dart](file:///Users/abdulrahman/Github/Nammerha/nammerha_mobile/lib/features/auth/repositories/auth_repository.dart#L222-L230)

Same pattern as P2-W14-001 — `response.message` may be English, displayed raw.

---

### P2-W14-003: Registration Draft Collision — Login Tab Doesn't Clear Draft Key

**Platform**: Web Frontend
**File**: [auth.ts](file:///Users/abdulrahman/Github/Nammerha/frontend/src/pages/auth.ts#L287-L289)

**Current State**: When switching to Login tab, `clearRegDraft()` is correctly called (P1-W13-003 fix at L287). However, the forgot-password cooldown key (`RESEND_COOLDOWN_KEY`) and lockout key (`nmh_lockout_until`) are NOT cleared on tab switch. If a user triggers a resend cooldown on the registration confirmation panel, switches to login tab, and then switches back to register — the cooldown is still active (correct behavior), but the cooldown TIMER visual is gone (the panel was removed).

**UX Friction**: User sees "Resend" button enabled → clicks → gets "Wait (45s)" banner but no countdown visual attached to the button.

**Fix**: On returning to registration tab, check `isResendOnCooldown()` and re-initialize the countdown display if active.

---

### P2-W14-004: `loginSchema` Doesn't Validate Password Complexity (By Design — But Risky)

**Platform**: Backend
**File**: [schemas.ts](file:///Users/abdulrahman/Github/Nammerha/backend/src/validation/schemas.ts#L79-L83)

**Current State**: `loginSchema` only validates `z.string().min(1).max(128)`. It does NOT validate password complexity (no uppercase/lowercase/digit/special char check). This is intentional — you don't want to reject a login attempt because the user's OLD password (set before the complexity rules existed) doesn't meet new rules.

**Risk**: If the bcrypt cost factor is ever increased and an attacker sends 128-char passwords without rate limiting, bcrypt can take up to 3-5 seconds per hash. The `max(128)` cap mitigates this, but there's no entropy check.

> [!NOTE]
> No action needed currently — this is by design. Documenting for audit trail.

---

## 🟢 LOW (P3) — Polish / Maintenance

### P3-W14-001: MFA Digit Inputs Missing `autocomplete="one-time-code"` On All Digits

**Platform**: Web Frontend
**File**: [auth.ts](file:///Users/abdulrahman/Github/Nammerha/frontend/src/pages/auth.ts#L2042)

**Current State**: Only the FIRST MFA digit input has `autocomplete="one-time-code"`. The browser's auto-fill (when reading an SMS-forwarded code) only populates the first digit. The paste handler at L2138 handles pasted codes correctly, but SMS auto-fill doesn't trigger a paste event.

**Fix**: Move `autocomplete="one-time-code"` to a single hidden input that captures the full 6-digit code, then distribute to individual digit inputs programmatically. This is the pattern used by Stripe, GitHub, and Google.

---

### P3-W14-002: Facebook SDK Version `v22.0` Lifecycle Not Tracked

**Platform**: Web Frontend
**File**: [auth.ts](file:///Users/abdulrahman/Github/Nammerha/frontend/src/pages/auth.ts#L2949)

The `FACEBOOK_SDK_VERSION = 'v22.0'` is correctly externalized (P3-W12-002 fix). However, there's no automated check for Meta's version expiry. When v22.0 expires (~2027), Facebook login will silently break.

**Fix**: Add a commented TODO with the expected expiry date and consider a quarterly CI check against Meta's Platform API Changelog.

---

### P3-W14-003: `handleLoginRedirect` Uses `window.location.href` — No SPA Router Integration

**Platform**: Web Frontend
**File**: [auth.ts](file:///Users/abdulrahman/Github/Nammerha/frontend/src/pages/auth.ts#L1989-L1991)

The 800ms delay + full page navigation is required because this is a Vanilla TS app (no SPA router). This is architecturally correct for the current stack. Documenting for future migration.

---

## ✅ Verified Fixes (Waves 11-13 Confirmed Working)

| Fix ID       | Description                                       | Status                            |
| ------------ | ------------------------------------------------- | --------------------------------- |
| P0-W12-004   | Verify-email GET→POST migration                   | ✅ Atomic + hashed token          |
| P1-W13-006   | Reset-password TOCTOU race condition              | ✅ UPDATE...RETURNING             |
| P0-AUTH-003  | Email sent confirmation panel                     | ✅ Rich panel with resend + back  |
| P0-W12-002   | MFA exponential client delay                      | ✅ 2s×failCount, 10s cap          |
| P2-W12-005   | Cross-tab resend cooldown persistence             | ✅ sessionStorage                 |
| P2-W12-008   | Lockout countdown persistence                     | ✅ sessionStorage + restore       |
| P1-W12-001   | DRY email regex (4 copies → 1)                    | ✅ validators.ts                  |
| P2-W12-001   | DRY password complexity (3 copies → 1)            | ✅ validators.ts + passwordSchema |
| P0-DEEP-004  | MFA inline styles → Tailwind                      | ✅ Full conversion                |
| P2-DEEP-001  | Name validation (rejects "123", "!!!")            | ✅ Frontend + backend parity      |
| W3-P1-007    | Forgot-PW for unverified user → send verification | ✅ Smart routing                  |
| P0-W11-004   | Forgot-PW for social-only → security alert        | ✅ Informative email              |
| PLATINUM-002 | Google OAuth CSRF state parameter                 | ✅ crypto.getRandomValues         |
| P1-DEEP-005  | Firefox tabnabbing defense                        | ✅ popup.opener = null            |
| V-012        | Password reset security notification email        | ✅ Sent on completion             |
| P1-REM-004   | Account lockout notification email                | ✅ Sent on 5th failure            |

---

## Proposed Changes

### Web Frontend — [auth.ts](file:///Users/abdulrahman/Github/Nammerha/frontend/src/pages/auth.ts)

#### P0-W14-001: Registration 429 Countdown

- Extract login 429 handler (L1227-1292) into shared `showRateLimitCountdown(errMsg, showBannerFn)`
- Call it from registration catch block (L1431)
- Includes sessionStorage persistence for page refresh

#### P1-W14-003: Forgot-Password Cooldown Persistence

- Add `setResendCooldown(60)` call in forgot-password `finally` block (L1564)
- Use a separate `FORGOT_PW_COOLDOWN_KEY` to avoid collision

#### P1-W14-005: MFA Detection Reorder in `handleSocialLoginSuccess`

- Check `mfa_required` BEFORE the error path (L2393-2403)

---

### Backend — [auth.routes.ts](file:///Users/abdulrahman/Github/Nammerha/backend/src/routes/auth.routes.ts)

#### P1-W14-004: Registration Anti-Enumeration Timing Defense

- Add dummy bcrypt hash in the "email exists" branch
- Normalize response time to prevent timing side-channel

#### P0-W14-003: Password Reuse Check (Design Decision)

- **Option A**: Remove the check on reset (NIST recommendation)
- **Option B**: Keep it but warn user before token consumption (two-step: validate, then confirm)
- **Awaiting user decision**

---

### Flutter Mobile

#### P0-W14-002: Registration Phone Field

- Add `String? phone` to `AuthRegisterRequested` event
- Wire through `_onRegister` → `_authRepository.register()`

#### P1-W14-001 / P1-W14-002: MFA Support

- Add `AuthMfaRequired` state to auth_bloc
- Detect `mfa_required` in repository login/social responses
- Build TOTP entry screen (new screen in `features/auth/screens/`)

#### P2-W14-001 / P2-W14-002: i18n Error Messages

- Always return ErrorKeys constants, never raw backend messages

---

## Verification Plan

### Automated Tests

1. `npx tsc --noEmit` — zero TypeScript errors
2. `flutter analyze` — zero Dart errors/warnings
3. Manual API testing via curl for 429 countdown behavior
4. MFA flow testing with test TOTP secret

### Manual Verification

- [ ] Register → hit rate limit → verify countdown shows
- [ ] Forgot password → 60s cooldown → refresh page → cooldown persists
- [ ] MFA-enabled user → login on mobile → verify TOTP screen appears
- [ ] Social login + MFA → verify challenge screen on both web and mobile
- [ ] Arabic RTL layout → all new UI renders correctly

---

## Open Questions

> [!IMPORTANT]
> **Q1**: P0-W14-003 — Should we remove the password-reuse check on reset (NIST 800-63B recommends NO password history on resets) or keep it with UX mitigation?

> [!IMPORTANT]
> **Q2**: P1-W14-001/002 — Mobile MFA is a significant feature addition (new screen + BLoC state + i18n). Should we implement it in this sprint or create a separate ticket for Phase 2?

> [!IMPORTANT]
> **Q3**: P1-W14-004 — The timing side-channel on registration is a real but low-exploitability issue (requires statistical analysis of many requests). Should we prioritize it or backlog it?
