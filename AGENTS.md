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
