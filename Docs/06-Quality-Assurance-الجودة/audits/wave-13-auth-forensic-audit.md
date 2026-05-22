# Wave 13 — Auth Deep Forensic Audit Report

# تدقيق الموجة 13 — نظام المصادقة الكامل

> **Date**: 2026-05-22
> **Session**: Wave 13 (Session 13 of Auth UX Sprint)
> **Scope**: Login + Registration + Forgot/Reset Password + Email Verification + MFA
> **Platforms Audited**: Web Frontend (auth.ts, reset-password.ts, verify-email.ts)
> **Lines Audited**: ~6,800+ lines across 8 files
> **Methodology**: Line-by-line code audit + architectural analysis + self-critique Red Team pass

---

## Executive Summary

Wave 13 focused on **DRY violations** that survived the Wave 12 migration and **MFA accessibility gaps**. The audit discovered 11 total issues, of which 2 were debunked during internal critique and 1 was verified as already implemented. **9 actionable fixes** were implemented and verified with zero TypeScript compilation errors.

### Key Metrics

| Metric                            | Value              |
| --------------------------------- | ------------------ |
| Issues Found                      | 11                 |
| Issues Debunked (false positives) | 2                  |
| Already Implemented               | 1                  |
| Fixes Applied                     | 9                  |
| Files Modified                    | 3                  |
| Files Created                     | 1 (shared utility) |
| TypeScript Errors After           | 0                  |
| `any` Types Introduced            | 0                  |

---

## Files Changed

| File                                   | Action   | Description                                               |
| -------------------------------------- | -------- | --------------------------------------------------------- |
| `frontend/src/utils/tracked-timers.ts` | **NEW**  | Shared timer tracking utility (DRY extraction)            |
| `frontend/src/pages/auth.ts`           | MODIFIED | MFA beforeinput + Escape key + timer DRY import           |
| `frontend/src/pages/reset-password.ts` | MODIFIED | Password validation DRY + banner fixes + timer DRY import |

---

## Fixes Applied

### 🔴 P0 — Critical

#### P0-W13-001: Password Validation DRY in reset-password.ts

- **Root Cause**: Wave 12 extracted `validatePasswordComplexity()` into `validators.ts` and migrated `auth.ts` (2 sites) and `profile.ts` (1 site). `reset-password.ts` was **missed** — 2 inline regex blocks remained.
- **Risk**: Password rule changes would propagate to auth.ts + profile.ts + backend but NOT to reset-password.ts. Users could set passwords on reset that are later rejected at login.
- **Fix**: Replaced both inline blocks with `validatePasswordComplexity()` import.
- **Standard**: DRY Principle, OWASP ASVS 2.1.1, NIST SP 800-63B §5.1.1.

#### P0-W13-002: MAX_PASSWORD_LENGTH DRY in reset-password.ts

- **Root Cause**: Local `const MAX_PASSWORD_LENGTH = 128` declared at L128 despite being exported from `validators.ts` (L15).
- **Risk**: Value drift if the limit changes.
- **Fix**: Removed local declaration, imported from `validators.ts`.
- **Standard**: DRY Principle, Single Source of Truth.

### 🟡 P1 — High

#### P1-W13-001: MFA Non-Numeric Input Flash

- **Root Cause**: MFA digit inputs used `input.value.replace(/\D/g, '')` in the `input` handler — non-numeric chars appeared for ~50ms before being stripped. Perceptible on Syria 2G devices.
- **Fix**: Added `beforeinput` event handler that calls `preventDefault()` on non-numeric input before it reaches the DOM.
- **Standard**: WCAG 3.3.1 (Error Prevention), Apple HIG (Keyboard Management).

#### P1-W13-002: MFA Panel Missing Escape Key

- **Root Cause**: MFA panel had no keyboard shortcut to return to login. Only a small text button existed.
- **Fix**: Added `keydown` listener on MFA panel for `Escape` → triggers "Back to Login".
- **Standard**: WCAG 2.1.1 (Keyboard), WAI-ARIA Dialog Practices, Nielsen #3.

#### P1-W13-005: Reset-Password Missing Auto-Clear Banner

- **Root Cause**: `auth.ts` auto-clears error banners when user starts typing. `reset-password.ts` had NO equivalent — stale error banners persisted during correction.
- **Fix**: Added `input` listeners on both password fields that auto-hide the banner.
- **Standard**: Nielsen #1 (Visibility of System Status), auth.ts parity.

### 🟢 P2 — Medium

#### P2-W13-001: showBanner Missing 'info' Type

- **Root Cause**: `showBanner()` only supported `'error' | 'success'`. The no-token state used `'error'` for informational guidance — red banner for non-error content.
- **Fix**: Extended to `'error' | 'success' | 'info'`. Changed no-token banner to `'info'`.
- **Standard**: Semantic Color Coding, Nielsen #9.

#### P2-W13-002: Timer Tracking DRY Extraction

- **Root Cause**: Identical 40-line timer tracking pattern copy-pasted in auth.ts and reset-password.ts.
- **Fix**: Extracted to `utils/tracked-timers.ts`. Both pages now import from shared module. Added `addTrackedTimer()` for setTimeout registration (used by social login safety timeout).
- **Standard**: DRY Principle, Timer Hygiene.

#### P2-W13-004: updateSubmitButton Inline Validation

- **Root Cause**: `updateSubmitButton()` used 6 inline conditions duplicating validators.ts logic.
- **Fix**: Now uses `validatePasswordComplexity().valid`.
- **Standard**: DRY Principle.

#### P2-W13-005: Missing Haptic Feedback on Banners

- **Root Cause**: `reset-password.ts` `showBanner()` had zero haptic feedback. auth.ts has differentiated haptic (error → heavy, success → success, info → light).
- **Fix**: Added haptic calls matching auth.ts pattern.
- **Standard**: Apple HIG, auth.ts parity.

---

## Issues Debunked During Self-Critique

1. **P1-W13-003** (Registration draft leak on tab switch): URL hash is cleared synchronously at L296 before `clearRegDraft()` at L308 — no race condition possible.
2. **P2-W13-003** (MFA \_mfaFailCount on back-to-login): Closure scoping ensures clean state per MFA session — variable is garbage-collected with the panel.

## Already Implemented

- **P1-W13-004** (verify-email.ts CSRF warm-up): Already present at L6+L9 (`warmCsrf()`) and L17-L21 (`visibilitychange` handler).

---

## Verification Results

```
✅ Frontend: npx tsc --noEmit → 0 errors
✅ Backend:  npx tsc --noEmit → 0 errors
✅ No inline password regex remains in reset-password.ts
✅ No local MAX_PASSWORD_LENGTH in reset-password.ts
✅ _activeTimers only declared in tracked-timers.ts
✅ No `any` types introduced
✅ No physical CSS properties introduced
✅ No @ts-ignore or @ts-nocheck
```

---

## AGENTS.md Pre-Commit Checklist

- [x] TypeScript: `npx tsc --noEmit` passes with 0 errors
- [x] No `any` types introduced
- [x] No physical CSS properties introduced (ms-/me-/ps-/pe- only)
- [x] All dynamic HTML uses `escapeHtml()` or safe DOM APIs
- [x] All new i18n strings use `t()` wrapper
- [x] Dark mode variants present where applicable
- [x] No `@ts-ignore` or `@ts-nocheck`

---

## Cumulative Auth Sprint Progress (Waves 1-13)

| Wave      | Session                             | Fixes          |
| --------- | ----------------------------------- | -------------- |
| 1-2       | Initial auth UX + ApiError codes    | ~18            |
| 3-4       | Social login + Registration wizard  | ~20            |
| 5-6       | Password security + Timer hygiene   | ~16            |
| 7-8       | Password strength DRY + MFA panel   | ~9             |
| 9-10      | Validation + Verify/Reset hardening | ~18            |
| 11        | Deep forensic: social-only guard    | ~7             |
| 12        | Deep forensic: rate limiters, DRY   | ~13            |
| **13**    | **Deep forensic: DRY + MFA a11y**   | **9**          |
| **Total** |                                     | **~110 fixes** |
