# Wave 11 — تدقيق شيطاني عميق: نظام المصادقة الكامل

# Deep Forensic Audit: Full Authentication System

> **Date**: 2026-05-22
> **Session**: Wave 11 (Session 11 of Auth UX Sprint)
> **Scope**: Login + Registration + Forgot/Reset Password + Email Verification
> **Platforms**: Web Frontend + Backend + Flutter Mobile (audit only)
> **Files Modified**: 5

---

## Previous Sessions Summary (Waves 1-10)

| Wave   | Focus                                     | Fixes Applied |
| ------ | ----------------------------------------- | ------------- |
| 1      | Initial auth UX audit                     | ~8 fixes      |
| 2      | ApiError codes, structured error handling | ~10 fixes     |
| 3      | Social login, rate limiting UX, RTL       | ~12 fixes     |
| 4      | Registration wizard, draft persistence    | ~8 fixes      |
| 5      | Password security, open redirect defense  | ~6 fixes      |
| 6      | Timer hygiene, session management         | ~10 fixes     |
| 7      | Password strength utility, DRY refactor   | ~5 fixes      |
| 8      | MFA challenge panel, CSRF pre-warm        | ~4 fixes      |
| 9      | Registration validation, field scrolling  | ~6 fixes      |
| 10     | Verify/Reset page hardening, dark mode    | ~12 fixes     |
| **11** | **Deep forensic audit — this session**    | **7 fixes**   |

---

## Methodology

1. **Code Coverage**: Read ~5,000 lines of auth code across all 3 platforms
2. **Previous Session Review**: Verified 80+ fixes from Waves 1-10
3. **User Journey Mapping**: Traced every possible path through login, registration, forgot password, reset password, email verification
4. **Edge Case Simulation**: Tested scenarios like social-only users, unverified emails, shared computers, cross-tab sessions

---

## Fixes Applied in Wave 11

### P0-W11-004: Social Login → Forgot Password Confusion Guard (Critical)

**File**: `backend/src/routes/auth.routes.ts`

**Problem**: Social-only users (Google/Apple/Facebook) could click "Forgot Password?", receive a legitimate reset link, and silently create dual-auth (social + email/password) without any warning.

**Fix**: Added `password_hash IS NULL` check in `/api/auth/forgot-password`. When detected, sends a security alert email guiding the user to use their social login method. Anti-enumeration response stays identical.

**Impact**: Prevents accidental dual-auth creation. Improves security posture.

---

### P0-W11-006: Reset Password URL — Include Email Param (Critical)

**File**: `backend/src/routes/auth.routes.ts`

**Problem**: Reset URL was `reset-password.html?token=X` without email. After successful reset, redirect to auth.html relied only on API response data. On Syria 2G, interrupted responses caused email loss.

**Fix**: URL now includes `&email=` param (same pattern as verification URL).

**Impact**: Reliable post-reset login pre-fill on unreliable networks.

---

### P1-W11-008: Login Lockout Countdown Timer

**File**: `frontend/src/pages/auth.ts`

**Problem**: On 429 lockout, users saw static "try again later" message — no idea when lockout expires.

**Fix**: Parses lockout duration from backend message (`"Try again in X minute(s)"`) and shows a live countdown timer using `createTrackedInterval()`. Falls back to static message if duration can't be parsed.

**Impact**: Users know exactly when they can retry.

---

### P1-W11-010: Cross-tab Logout Banner Auto-dismiss

**File**: `frontend/src/auth.ts`

**Problem**: After logging out in Tab A (showing red banner in Tab B), logging back in from Tab A didn't dismiss the banner in Tab B. Banner persisted forever.

**Fix**:

1. Added `storage` event listener for key being SET (login from another tab)
2. Auto-dismisses banner with fade animation + updates local `currentUser` state
3. Added 30s auto-dismiss timeout for the logout banner itself

**Impact**: No stale red banners confusing users who re-authenticated.

---

### P1-W11-011: Registration Anti-enumeration Helper Text

**File**: `frontend/src/pages/auth.ts`

**Problem**: Backend returns generic success for both new and existing email registrations (anti-enumeration). If email already exists, no verification email is actually sent. User waits forever.

**Fix**: Added subtle hint: "لم يصلك شيء خلال ٥ دقائق؟ ربما لديك حساب سابق — جرّب تسجيل الدخول"

**Impact**: Users with existing accounts get a soft nudge without breaking anti-enumeration.

---

### P2-W11-006: Reset Password — Token URL Cleanup (Security)

**File**: `frontend/src/pages/reset-password.ts`

**Problem**: Reset token persisted in browser URL bar and history. On shared/public computers (common in Syrian internet cafes), tokens exposed to next user.

**Fix**: `history.replaceState()` removes `?token=` from URL bar immediately after extraction.

---

### P2-W11-007: Verify Email — Token URL Cleanup (Security)

**File**: `frontend/src/pages/verify-email.ts`

**Same pattern as P2-W11-006** — removes verification token from URL bar after extraction.

---

## Items Verified as Already Fixed (Waves 1-10)

| ID         | Description                            | Location                               | Wave   |
| ---------- | -------------------------------------- | -------------------------------------- | ------ |
| P0-W11-001 | Post-registration "Check Email" panel  | `showEmailSentConfirmation()` L1406    | Wave 8 |
| P0-W11-002 | Forgot password email validation       | L1328-1332                             | Wave 3 |
| P0-W11-005 | Login unverified email → inline resend | `showInlineResendVerification()` L1534 | Wave 2 |
| P0-W11-007 | Password match live indicator          | `pw-mismatch-error` L823-827           | Wave 7 |

---

## Verification Results

| Check                       | Result      |
| --------------------------- | ----------- |
| Backend `npx tsc --noEmit`  | ✅ 0 errors |
| Frontend `npx tsc --noEmit` | ✅ 0 errors |
| No `any` types introduced   | ✅          |
| No `@ts-ignore` introduced  | ✅          |
| No physical CSS properties  | ✅          |
| All innerHTML uses `esc()`  | ✅          |
| All i18n uses `t()`         | ✅          |
| Dark mode variants present  | ✅          |
| XSS safety                  | ✅          |

---

## Architecture Notes for Future Sessions

### Auth Flow Decision Tree (Post-Wave 11)

```
User clicks "Forgot Password?"
├── Email not found → Generic success (anti-enumeration) ✅
├── Email found, NOT verified → Send verification email instead ✅ (W3)
├── Email found, Social-only (no password_hash) → Send security alert ✅ (W11)
└── Email found, Has password → Send reset link with email param ✅ (W11)
```

### Cross-Tab Session State (Post-Wave 11)

```
Tab A logs out
├── Tab B shows red logout banner ✅ (W1)
├── Tab B auto-dismisses after 30s ✅ (W11)
└── Tab A logs back in → Tab B dismisses banner + updates state ✅ (W11)
```

### Token Security (Post-Wave 11)

```
User clicks reset/verify link
├── Token extracted from URL ✅
├── Token cleaned from URL bar (history.replaceState) ✅ (W11)
├── Token variable still available for API call ✅
└── Browser history shows clean URL ✅ (W11)
```

---

## Known Remaining Items (Future Sessions)

1. **Mobile (Flutter)**: Token URL cleanup not yet implemented in mobile WebView
2. **Backend**: Arabic translation for security alert email body (currently English-only)
3. **Frontend**: Consider adding "Open email app" deep link button on email sent panel (iOS/Android)
