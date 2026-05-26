# Nammerha — Agent Governance Protocol (AGENTS.md)

# ═══════════════════════════════════════════════════════════════════════════

# This file governs ALL AI agent behavior across the Nammerha platform.

# It is the single source of truth for architectural decisions, constraints,

# and safety boundaries. All agents MUST read and comply with this file.

#

# Standard: AGENTS.md (Cross-IDE Agent Governance Standard)

# Last Updated: 2026-05-19

# ═══════════════════════════════════════════════════════════════════════════

## 🛑 ZERO-REGRESSION MEMOS (CRITICAL AI MEMORY)

**MEMO 1: Unified Citizen Model & Donation Purge (May 25, 2026)**

- **Root Cause Destroyed:** The platform previously had intertwined "Donation" and "Crowdfunding" logic which violated the Unified Citizen Model and caused IDOR vulnerabilities in tests and routing.
- **New Logic Built:**
  1. ALL references to `donation`, `donor`, `crowdfunding`, and `campaign` are permanently eradicated.
  2. The platform operates on a single `users` table with unified roles.
  3. `payment.test.ts` and `matchmaking.test.ts` now rely strictly on `user_id` and ABAC/RBAC rather than `donor_id`.
  4. Escrow webhooks and financial mutations are guarded by Redis Distributed Locks (`redisLockManager`) and `$transaction` with `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`. Do NOT touch this logic.

**MEMO 2: Damage Report Offline UX & Memory Safety (May 25, 2026)**

- **Root Cause Destroyed:** The mobile app threw generic "Network Errors" during offline form submission, leading to cognitive distress. The app also needed a strict audit for memory leaks.
- **New Logic Built:**
  1. BLoC state management (`DamageReportBloc`) intercepts `ApiException(statusCode: 0)` and successfully queues the request, emitting `DamageReportOfflineSaved` instead of `DamageReportError`.
  2. The UI (`DamageReportScreen`) listens for this state and displays a `colors.info` SnackBar assuring the user of offline sync.
  3. All `FocusNode`, `TextEditingController`, and `PageController` instances are strictly disposed in the widget lifecycle. Memory leaks are zero.

**MEMO 4: The Zombie Tab API Dead End & Cognitive Negligence (May 26, 2026)**

- **Root Cause Destroyed:**
  1. The "In-Place Re-auth Modal" was bypassed on 401 API responses if the user's session was killed in another tab (`isAuthenticated()` returned false), destroying unsaved form data.
  2. The Cross-Tab Logout banner auto-dismissed after 30 seconds, leading to AFK users returning to a "Zombie Tab" with no visual warning of session death.
- **New Logic Built:**
  1. `api/_client.ts` now uses `sessionStorage.getItem('nammerha_orphaned_uid')` to detect Zombie Tabs and forces the In-Place Re-auth Modal to appear even if `isAuthenticated() === false`. **NEVER** revert the `isAuthenticated() || isZombieTab` check.
  2. `auth.ts` cross-tab logout banner is now PERSISTENT. **NEVER** re-add `setTimeout` auto-dismissal for critical session state changes.

**MEMO 5: SPA Dirty State & Cryptographic Theater Racing (May 26, 2026)**

- **Root Cause Destroyed:**
  1. The `DirtyStateGuard` only protected full-page unloads, failing to catch internal SPA navigation via `hash-router.ts`.
  2. The Cryptographic Theater in Escrow was a blocking UI delay that did not cancel if the API rejected instantly, leading to an Unhandled Promise Rejection and jarring UI desync.
  3. Pull-to-refresh suffered from a Gesture Race Condition if users pulled again during the success checkmark phase.
  4. The Conflict Refresh button used inline `onclick` violating CSP.
- **New Logic Built:**
  1. `hash-router.ts` broadcasts a cancelable `nm_internal_navigate` CustomEvent, intercepted by `DirtyStateGuard` via a `window.confirm` lock.
  2. The Escrow Cryptographic Theater uses a cancellable delay sequence (`isTheaterCancelled`) that immediately aborts if `admin.releaseEscrow` catches an error.
  3. `pull-refresh.ts` natively stores a `resetTimer`. Triggering a new touch immediately clears the timer and forcefully restores the base icon.
  4. Conflict buttons now use strict programmatic ID binding (`document.getElementById`).

**MEMO 6: SPA Direct Tab Switch Dirty State Bypass (May 26, 2026)**

- **Root Cause Destroyed:** The `DirtyStateGuard` was perfectly wired to intercept browser `popstate` via `hash-router.ts`. However, direct click events (tab buttons) inside portals bypassed the Bfcache lock and `window.confirm` guard, annihilating user data if they tapped a tab while filling a form.
- **New Logic Built:**
  1. A centralized cryptographic event interceptor (`nm_internal_navigate`) is injected at the top of the `switchTab(tab)` function across all portal architectures (`homeowner-portal.ts`, `contractor-portal.ts`, `engineer-portal.ts`, `tradesperson-portal.ts`).
  2. `switchTab` strictly verifies `window.dispatchEvent(navEvent)` before proceeding with DOM teardown, preserving the UI lock mathematically.

**MEMO 7: Platinum UI/UX Forensic Audit & State Preservation (May 26, 2026)**

- **Root Cause Destroyed:**
  1. `hash-router.ts` used `history.replaceState` which corrupted the browser history stack during dirty state cancellation.
  2. `ui-lock.ts` glassmorphism overlay lacked ARIA semantics and focus management, acting as an accessibility blackhole (Keyboard Trap) for screen readers.
  3. `session-timeout.ts` Privacy Shield leaked background scrolling during session locks, violating the visual freeze requirement.
- **New Logic Built:**
  1. `hash-router.ts` MUST use `history.pushState` when reverting a canceled `nm_internal_navigate` event to preserve the stack.
  2. `ui-lock.ts` MUST dynamically inject `role="alertdialog"`, `aria-modal="true"`, `tabindex="0"`, and force `.focus()` upon mount.
  3. `session-timeout.ts` MUST strictly apply `document.body.style.overflow = 'hidden'` while the shield is active, and restore it correctly on auth success.

**MEMO 8: The Double Confirmation Paradox & Dirty State Desync (May 26, 2026)**

- **Root Cause Destroyed:**
  1. The Custom `confirmAction` dialog in wizard flows (`homeowner-report.ts`) did not clear the `DirtyStateGuard` before executing `history.back()`. This spawned a second, native browser `beforeunload` dialog immediately after the user clicked "Confirm", causing extreme cognitive friction (Double Confirmation Paradox).
  2. `DirtyStateGuard`'s internal listener (`nm_internal_navigate`) failed to check `e.defaultPrevented`, risking a cascade of multiple `window.confirm` dialogs if concurrent guards intercepted the same navigation event.
- **New Logic Built:**
  1. `homeowner-report.ts` now explicitly calls `wizardGuard.markClean()` _before_ any programmatic navigation away from the dirty state. **NEVER** navigate programmatically without unregistering the dirty state guard.
  2. `dirty-guard.ts` now enforces an `if (e.defaultPrevented) return;` check at the very beginning of the `_internalNavListener` to guarantee mathematically that only one confirmation dialog can ever be rendered per navigation event.

**MEMO 3: UX UI Zero-Friction & Cognitive Flow (May 26, 2026)**

- **Root Cause Destroyed:**
  1. The mobile admin app suffered from a "Double Confirmation Paradox" where a `SwipeToConfirm` widget erroneously popped an `AlertDialog`, destroying cognitive efficiency.
  2. Transient states in Flutter Bloc caused UI wipeout blinks (`SizedBox.shrink()`).
  3. The web wallet had Race Conditions on slow networks (pull-to-refresh), Floating Point poisoning risks (`typeof !== 'number'` allowing `NaN`), and memory leaks with zombie skeleton timers.
- **New Logic Built:**
  1. `SwipeToConfirm` MUST bind strictly to the Bloc event. NO dialogs after a swipe. Swipe = Execution.
  2. ALL `BlocConsumer` widgets MUST use `buildWhen` to ignore transient states (e.g., `ActionSuccess`, `Error`) and prevent UI wipeouts.
  3. ALL asynchronous frontend data fetching on the Web MUST use Monotonic Request IDs (or AbortControllers) to discard stale responses and prevent Network Desync Race Conditions.
  4. Financial amounts (cents) MUST be validated exclusively via `Number.isSafeInteger()`.

**MEMO 9: The Platinum Audit & Zero-Day Extermination (May 26, 2026)**

- **Root Cause Destroyed:**
  1. `hash-router.ts` used `history.pushState` on `popstate` cancellation, which truncated forward history and created an infinite back-button trap.
  2. The `api/_client.ts` In-Flight Mutation Multiplexer assigned identical `mutationKey` to concurrent `FormData` requests, silently dropping all but the first file payload.
  3. Browsers (Chrome/Safari) aggressively ignored `autocomplete="off"` on financial fields in `contractor-portal.ts`, injecting passwords into `bid-cost`.
- **New Logic Built:**
  1. `hash-router.ts` MUST use `history.replaceState` when reverting a canceled `nm_internal_navigate` event. `pushState` is strictly PROHIBITED for `popstate` aborts.
  2. `api/_client.ts` MUST bypass the multiplexer (using a `crypto.randomUUID()`) for binary streams if no `Idempotency-Key` is provided. Never use static strings like `binary_or_stream`.
  3. ALL financial and numerical input fields (`bid-cost`, `bid-days`) MUST use `autocomplete="new-password"` to completely disable browser heuristic injections.

**MEMO 10: Unified Citizen Model Deep Eradication (May 26, 2026)**

- **Root Cause Destroyed:** The platform contained legacy fragmented logic that assumed a siloed "Donor" role (via `donor_id` references) in `escrow.service.ts`, `matching.service.ts`, `tip.service.ts`, GraphQL Resolvers (`domain.resolver.ts`, `row-mappers.ts`), and core TypeScript interfaces (`types/index.ts`). This violated the Unified Citizen Model (Polymorphic User Architecture) and created extreme risks for IDOR vulnerabilities, data desync during account nullification, and logic errors in transaction processing.
- **New Logic Built:**
  1. ALL remaining `donor_id` properties across the entire codebase were surgically eradicated and replaced with `user_id`.
  2. GraphQL mappers (`_shared/row-mappers.ts`) stripped of fallback logic (`row['user_id'] || row['donor_id']`), enforcing strict adherence to `user_id`.
  3. Tipping, receipt generation, and escrow APIs natively consume `userId` exclusively.
  4. Test suites completely refactored to align with the Unified Citizen Model ensuring zero regression testing capability.

**MEMO 11: Global Dirty State Registry Annihilation (May 26, 2026)**

- **Root Cause Destroyed:** `DirtyStateGuard` used a single boolean `isBeforeUnloadRegistered` to track the `beforeunload` listener across multiple active form instances. Saving one form cleared the listener globally, leaving other active forms unprotected from accidental tab closure.
- **New Logic Built:**
  1. Replaced the boolean flag with a reference counter (`activeGuardsCount`).
  2. The `beforeunload` listener is only detached when `activeGuardsCount === 0`. Never revert back to a single boolean flag for global state tracking.

**MEMO 12: Binary File Double-Submission Paradox (May 26, 2026)**

- **Root Cause Destroyed:** The In-Flight Mutation Multiplexer bypassed `FormData` entirely by assigning a random UUID (`crypto.randomUUID()`) to prevent different files from colliding. However, this allowed rapid double-taps on the same upload button to spawn multiple concurrent POST requests, bypassing idempotency locks.
- **New Logic Built:**
  1. The multiplexer now hashes the contents of `FormData` (combining file names, sizes, and field values) to generate a deterministic `bodyStr`.
  2. Duplicate identical uploads are caught and multiplexed into a single network promise.

**MEMO 13: Orphaned Event Broadcast & Cross-Pollination (May 26, 2026)**

- **Root Cause Destroyed:** `api/_client.ts` broadcasted a generic `nm_form_committed` event on every successful POST request. While `form-draft.ts` was updated to ignore it, the event remained a hazard for cross-pollinating unrelated listeners.
- **New Logic Built:**
  1. The global `nm_form_committed` broadcast was annihilated from `api/_client.ts`.
  2. Draft clearing must be targeted via explicit `nm_clear_specific_draft` broadcasts from the specific Page Module.

**MEMO 14: Unhandled Promise Rejection & Cryptographic Theater Crash (May 27, 2026)**

- **Root Cause Destroyed:**
  1. The Cryptographic Theater (`admin-escrow.ts`) re-threw errors during the API `catch` block while the synchronous theater delay was running, causing a catastrophic `UnhandledPromiseRejection` UI crash.
  2. `requestAnimationFrame` was running infinitely if the DOM unmounted.
  3. Dynamic input `flagInput` lacked keyboard accessibility (Enter key) violating WCAG AAA.
- **New Logic Built:**
  1. Adopted the "Promise Settlement Proxy" pattern. Errors are silently caught in `apiError` and thrown synchronously only AFTER the theater resolves.
  2. Memory leaks prevented by `document.body.contains(releaseBtn)` check in the RAF loop.
  3. Keyboard event listeners strictly enforce `Enter` key mirroring the click event.

**MEMO 15: Flutter Bloc UI Wipeout & Text Cursor Hijacking (May 27, 2026)**

- **Root Cause Destroyed:**
  1. `BlocConsumer` in `damage_report_screen.dart` lacked `buildWhen`, meaning transient Error/Success states caused a full Form UI Wipeout blink.
  2. Keystrokes in `onChanged` fired `UpdateFormDataEvent`, causing `listenWhen` to execute Navigation logic on every frame of typing (Jank).
  3. Macro chips overwrote `TextEditingController.text` and violently reset the cursor to `offset: 0`.
- **New Logic Built:**
  1. `BlocConsumer` MUST explicitly block `DamageReportError`, `DamageReportSuccess`, and `DamageReportOfflineSaved` in its `buildWhen` guard.
  2. `listenWhen` must restrict evaluation to state-type changes and Step changes to prevent Keystroke Spam.
  3. `TextEditingController.selection` must mathematically calculate and reposition the cursor using `TextSelection.fromPosition(TextPosition(offset: newText.length))` after programmatic updates.

**MEMO 16: Hardware Back-Button Trap & SWR Void Cache (May 27, 2026)**

- **Root Cause Destroyed:**
  1. The "Phantom Escape Paradox" in `homeowner-report.ts` trapped users who pressed the Android hardware Back button, triggering a global `beforeunload` instead of returning to the previous wizard step.
  2. The Stale-While-Revalidate (`swrFetch`) mechanism in `homeowner-portal.ts` swallowed API errors, resolving with `void`, causing the cache to freeze the error state and refuse background revalidation for 30 seconds.
  3. The `SpeechRecognition` API in `homeowner-report.ts` injected text directly into `textarea.value`, bypassing the native `input` event, failing to trigger `sessionStorage` auto-saves (Phantom Voice Event Desync).
- **New Logic Built:**
  1. `showStep` natively binds to the History API using `history.pushState`. A `popstate` interceptor guarantees Android hardware back-button parity with the wizard UI.
  2. Frontend data fetchers (`loadProjects`, `loadServiceRequests`) strictly `throw err;` on failure, preventing `swrFetch` from caching a void resolution. The global `switchTab` dispatcher intercepts floating promises with `.catch(() => {})`.
  3. `dispatchEvent(new Event('input'))` is strictly enforced after any programmatic text manipulation to mathematically guarantee auto-save state persistence.

## 🏗️ Platform Architecture

### Web Frontend (frontend/)

- **Stack:** Vanilla TypeScript + Vite (NOT React, Vue, or Flutter Web)
- **CSS:** Tailwind CSS with custom design tokens in `main.css`
- **Pattern:** Self-Injecting Component modules (see `src/pages/*.ts`)
- **i18n:** Static dictionary engine in `src/utils/i18n.ts` — zero API calls
- **State:** Module-scoped variables + DOM Contract (IDs for programmatic refs)

### Backend (backend/)

- **Stack:** Node.js + Express + TypeScript
- **Database:** PostgreSQL with typed query patterns
- **Security:** CSRF middleware, idempotency middleware, role-guard middleware
- **Compliance:** OCDS (Open Contracting Data Standard) — `ocds_release_id` fields

### Mobile App (nammerha_mobile/)

- **Stack:** Flutter/Dart (SDK ^3.10.7, fully null-safe)
- **State Management:** `flutter_bloc ^9.0.0` — **90 Bloc/Cubit files**
- **Map:** `flutter_map ^8.0.0` with OpenStreetMap tiles (NOT Google Maps)
- **Camera:** Native camera with GPS EXIF extraction
- **Notifications:** Firebase Cloud Messaging

---

## 🚫 ABSOLUTE PROHIBITIONS

### Architectural Paradigms

- **NEVER** reference, implement, or suggest the "Donor" (المانح) role or donation systems. The donation system is permanently suspended.
- **NEVER** use the concept of "Siloed Roles" (e.g., Role Switcher). The platform strictly operates on a **Unified Citizen Model** (نمط المواطن الموحد) where a single user can access multiple "Workspaces" (Homeowner, Contractor, Engineer, Tradesperson, Supplier).

### State Management (Flutter)

- **NEVER** suggest switching from BLoC to Riverpod, Provider, or GetX.
  The app has 90 Bloc/Cubit files — migration would take months.
- **NEVER** use `setState()` for business logic or API calls.
  Only allowed for transient UI state (e.g., `_isPressed`, `_isExpanded`).
- **NEVER** place `Future`, `async`, or API calls inside `build()`.
  Use `initState()`, BLoC events, or Cubit methods.
- **NEVER** use `FutureBuilder` for network calls in build() — use BlocBuilder.

### Web Frontend

- **NEVER** introduce React, Vue, Angular, or any SPA framework.
  The frontend is intentionally Vanilla TS for Syria's low-bandwidth networks.
- **NEVER** use physical CSS properties: `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`,
  `border-l`, `border-r`. Use logical equivalents: `ms-`, `me-`, `ps-`, `pe-`,
  `start-`, `end-`, `border-s`, `border-e`.
- **NEVER** use inline styles for layout. Use Tailwind utility classes.
- **NEVER** output unescaped dynamic content. ALL innerHTML MUST use `escapeHtml()`.

### Security (ALL platforms)

- **NEVER** commit API keys, secrets, or credentials to source code.
- **NEVER** use `any` type in TypeScript without explicit justification comment.
- **NEVER** use `@ts-ignore` or `// @ts-nocheck`.
- **NEVER** run `rm -rf` or destructive shell commands without user confirmation.
- **NEVER** modify escrow/financial logic without explicit user approval.

### Financial Integrity

- **ALL** monetary values are stored and transmitted in **CENTS** (integer).
  Never use floating-point for money.
- **ALL** escrow mutations require Redis distributed lock + Serializable transaction.
- **ALL** POST/PUT financial endpoints require `Idempotency-Key` header.
- GPS coordinates for delivery verification: Haversine validation (< 150m variance).

---

## ✅ MANDATORY PATTERNS

### Flutter (Dart)

```dart
// ✅ CORRECT: BLoC event-driven
context.read<ProjectBloc>().add(LoadProjects());

// ❌ WRONG: setState for async
setState(() => _projects = await api.getProjects()); // PROHIBITED
```

### Web (TypeScript)

```typescript
// ✅ CORRECT: Escaped dynamic content
card.innerHTML = `<h3>${escapeHtml(project.title)}</h3>`;

// ❌ WRONG: Unescaped XSS vector
card.innerHTML = `<h3>${project.title}</h3>`; // PROHIBITED
```

### CSS (RTL)

```css
/* ✅ CORRECT: Logical properties */
margin-inline-start: 16px;
padding-inline-end: 8px;
inset-inline-start: 0;

/* ❌ WRONG: Physical properties */
margin-left: 16px; /* PROHIBITED */
padding-right: 8px; /* PROHIBITED */
left: 0; /* PROHIBITED */
```

---

## 🎨 Brand Colors (Exact Hex — No Approximations)

| Token            | Hex       | Usage                                        |
| ---------------- | --------- | -------------------------------------------- |
| Trust Blue       | `#1558D6` | Primary CTA, links, active states            |
| Trust Blue Hover | `#0D47A1` | Hover states                                 |
| Smoky Jade       | `#109173` | Success, verified, escrow released           |
| Cloud Dancer     | `#F4F6F8` | Light background                             |
| Earth Tones      | `#D59F80` | Warm accents, secondary                      |
| Tech Dark        | `#242424` | Dark mode background                         |
| Warning Yellow   | `#FCC934` | Snagging/Pins ONLY — never for text on white |

---

## 📋 Pre-Commit Checklist (Agent Self-Check)

Before proposing ANY code change, the agent MUST verify:

1. [ ] TypeScript: `npx tsc --noEmit` passes with 0 errors
2. [ ] Flutter: `flutter analyze` shows 0 errors, 0 warnings
3. [ ] No `any` types introduced
4. [ ] No physical CSS properties introduced
5. [ ] All dynamic HTML uses `escapeHtml()`
6. [ ] All new i18n strings use `t()` wrapper with both ar/en values
7. [ ] Financial logic: cents-based, idempotent, locked
8. [ ] Dark mode: all new UI has `dark:` Tailwind variants

---

## 🔄 Circuit Breaker Rules

If an agent encounters **3 consecutive failures** (compilation errors, test failures,
or tool call errors) while attempting to fix the same issue:

1. **STOP** — Do not attempt a 4th fix
2. **REPORT** — Explain what was attempted and why it failed
3. **ESCALATE** — Ask the human for architectural guidance
4. **NEVER** delete files or rewrite large sections as a "nuclear" option

---

## 📚 Knowledge Base References

- Platform architecture: See KI `nammerha_reconstruction_platform`
- Frontend systems: See KI `nammerha_frontend_systems`
- Translation engine: See KI `nammerha_translation_engine`
- Storage (S3/MinIO): See KI `nammerha_storage_infrastructure`
- Deployment: See workflow `/deploy`
