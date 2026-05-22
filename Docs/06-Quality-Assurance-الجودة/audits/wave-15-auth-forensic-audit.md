# Wave 15 — Auth System Forensic Audit & Fixes

> **Date**: 2026-05-22
> **Scope**: Login, Registration, Password Reset, Email Verification, MFA — All 3 Platforms
> **Files Modified**: 9 | **Files Created**: 1 | **TSC Compilation**: ✅ 0 errors (frontend + backend)

---

## Executive Summary

Wave 15 focused on closing the remaining gaps from the Wave 14 forensic audit:

1. **MFA Challenge Screen** (P1): Replaced the temporary "use web platform" AlertDialog with a full TOTP verification screen in Flutter mobile
2. **Forgot-Password Cooldown** (P2): Anti-abuse token-generation cooldown in backend
3. **Timer Hygiene** (P2): Migrated verify-email.ts to shared tracked-timers utility
4. **Phone Validation** (P2): Backend + mobile phone format validation (E.164-relaxed)
5. **Dead Code Removal** (P3): Removed unreachable MAX_PASSWORD_LENGTH check
6. **Cooldown Wiring** (P3): Connected forgot-password sessionStorage cooldown that was defined but never called
7. **Debug Hardening** (P3): Wrapped all debugPrint calls with kDebugMode guards

---

## Fixes Applied

### 🔵 Backend (Node.js/Express)

#### P2-W15-005: Forgot-Password Token-Generation Cooldown

- **File**: `backend/src/routes/auth.routes.ts`
- **Root Cause**: No cooldown between password reset token generations. An attacker could spam `/forgot-password` every second, invalidating the victim's legitimate reset link. While `sensitiveActionLimiter` throttled per IP, rotating proxies bypassed it.
- **Fix**: Added backwards-math cooldown check using `reset_token_expires_at` (same pattern as resend-verification at L829-841). Anti-enumeration response preserved — returns success without generating a new token during cooldown.
- **DB Impact**: Added `reset_token_expires_at` to the SELECT query's Pick type and SQL. No schema changes needed — column already existed.

#### P2-W15-006a: Phone Format Validation

- **File**: `backend/src/validation/schemas.ts`
- **Root Cause**: Phone field only had `.max(20)` — accepted garbage like "abc" as a phone number.
- **Fix**: Added `.regex(/^\+?[0-9]{7,20}$/, 'Invalid phone number format')` — E.164-relaxed pattern (digits with optional + prefix, 7-20 chars total).

---

### 🟢 Web Frontend (TypeScript/Vite)

#### P2-W15-004: verify-email.ts Tracked Timers Migration

- **File**: `frontend/src/pages/verify-email.ts`
- **Root Cause**: Raw `setInterval` with manual module-scoped tracking — duplicated the pattern from auth.ts and reset-password.ts instead of using the shared `tracked-timers.ts` utility.
- **Fix**: Imported `createTrackedInterval`/`clearTrackedInterval`/`clearAllTrackedTimers` from shared utility. `pagehide` listener now calls `clearAllTrackedTimers()` (centralized cleanup).

#### P3-W15-008: Dead MAX_PASSWORD_LENGTH Check

- **File**: `frontend/src/pages/reset-password.ts`
- **Root Cause**: Redundant `MAX_PASSWORD_LENGTH` check after `validatePasswordComplexity()` — the shared validator already checks both min(8) and max(128). The explicit check was unreachable dead code.
- **Fix**: Removed the dead code block and the orphaned `MAX_PASSWORD_LENGTH` import.

#### P3-W15-007: Forgot-Password Cooldown Wiring

- **File**: `frontend/src/pages/auth.ts`
- **Root Cause**: `isForgotPwOnCooldown()` and `getForgotPwCooldownRemaining()` were **defined** (L99, L109) but **never called anywhere**. `setForgotPwCooldown(60)` at L1667 wrote to sessionStorage on submit, but on page reload, no code checked the stored cooldown — the button was immediately re-enabled.
- **Fix**: Added `isForgotPwOnCooldown()` pre-guard at the top of `handleForgotPassword()` (mirrors `isResendOnCooldown()` pattern at L1783). Removed `void isForgotPwOnCooldown; void getForgotPwCooldownRemaining;` casts that previously suppressed TS6133.

---

### 🟡 Flutter Mobile (Dart/BLoC)

#### P1-W15-002: AuthMfaError State

- **File**: `nammerha_mobile/lib/features/auth/bloc/auth_bloc.dart`
- **Root Cause**: MFA verification errors emitted generic `AuthError`, which kicked the user back to the login screen. They had to re-enter their password to get a new MFA challenge.
- **Fix**: Added `AuthMfaError` state class that carries error message AND `mfaToken` + `email` for retry. Both `_onMfaVerify` and `_onMfaRecovery` now emit `AuthMfaError` instead of `AuthError`.

#### P1-W15-001: MFA Challenge Screen

- **Files**:
  - `nammerha_mobile/lib/features/auth/screens/mfa_challenge_screen.dart` (NEW)
  - `nammerha_mobile/lib/features/auth/screens/login_screen.dart`
  - `nammerha_mobile/lib/core/i18n/error_keys.dart`
  - `nammerha_mobile/lib/core/i18n/translations.dart`
- **Root Cause**: MFA users on mobile saw a dialog saying "use the web platform" — no actual TOTP verification was possible in the app.
- **Fix**:
  - Created full `MfaChallengeScreen` with 6-digit TOTP input, recovery code toggle, error retry with preserved MFA session, and back-to-login escape hatch.
  - Replaced the AlertDialog in `login_screen.dart` with `Navigator.push` to `MfaChallengeScreen`.
  - `BlocProvider.value` passes existing `AuthBloc` to the new screen.
  - Added `AuthMfaError` handler as fallback snackbar in login screen.
  - Added 9 MFA screen i18n keys (ar/en) + 3 error keys.

#### P2-W15-006b: Mobile Phone Format Validation

- **File**: `nammerha_mobile/lib/features/auth/screens/register_wizard_screen.dart`
- **Root Cause**: Phone field had no validator — user could enter "abc" or "123".
- **Fix**: Added validator with same regex as backend (`/^\+?\d{7,20}$/`). Optional: returns null for empty input. Added `textDirection: TextDirection.ltr` for phone input.
- Added `reg_phone_invalid` translation key (ar/en).

#### P3-W15-009: debugPrint kDebugMode Guards

- **File**: `nammerha_mobile/lib/features/auth/bloc/auth_bloc.dart`
- **Root Cause**: 17 bare `debugPrint` calls leaked log messages to release builds.
- **Fix**: All 17 calls wrapped with `if (kDebugMode) debugPrint(...)`.

---

## Verification Results

| Check                                 | Result                             |
| ------------------------------------- | ---------------------------------- |
| `npx tsc --noEmit` (frontend)         | ✅ 0 errors                        |
| `npx tsc --noEmit` (backend)          | ✅ 0 errors                        |
| No `any` types in modified files      | ✅ Verified                        |
| No physical CSS properties            | ✅ N/A (no CSS changes)            |
| All i18n keys have ar/en              | ✅ 13 keys verified                |
| All debugPrint calls guarded          | ✅ 17/17 calls wrapped             |
| No void cast suppressions remain      | ✅ Both functions consumed         |
| Phone regex parity (backend ↔ mobile) | ✅ Identical regex                 |
| Reset cooldown math correct           | ✅ Backwards-math pattern verified |
| MFA screen dispose() correct          | ✅ Both controllers disposed       |

---

## Open Items for Next Session

- **Flutter `flutter analyze`**: Run `flutter analyze` on the mobile project to catch any Dart-specific warnings. Cannot run in this session (no Flutter SDK in terminal path).
- **MFA Recovery Code Format**: Backend should define the expected recovery code format. Currently the mobile screen accepts any alphanumeric string — need to verify the backend's expected format and match the validator.
- **MFA Token Rotation**: The backend emits `mfaToken` in error responses. Need to confirm whether the backend actually rotates the MFA token on failed verification, or if the same token is reused.
