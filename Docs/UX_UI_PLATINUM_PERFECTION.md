# 🛡️ Nammerha — Platinum UX/UI Perfection Audit (Permanent Documentation)

> **DO NOT REVERT**: The architectural constraints listed below were implemented to solve severe, demonic UX/UI "Zero-Day" vulnerabilities. Reverting or ignoring these rules will immediately degrade the platform's ISO/IEC 25010 Platinum compliance.

## 🌐 Web Frontend Constraints (Vanilla TS + Vite)

### 1. Browser Autofill Fracture

**Problem:** Browsers (Chrome, Safari) maliciously injected saved passwords into numerical fields (e.g., "Project Budget", "Escrow Value"), corrupting the financial state and breaking the UI.
**Permanent Rule:** ALL non-credential numerical or financial inputs must explicitly include `autocomplete="new-password"` to spoof the browser into disabling autofill heuristics.

### 2. Service Worker Forced Reload (Data Loss)

**Problem:** Automatically calling `skipWaiting()` forced a page reload while the user was interacting with the platform (e.g., recording voice notes, filling out Bids), causing absolute data loss.
**Permanent Rule:** Service Workers must NEVER self-update. The Service Worker must passively download the update and trigger a "Toast Notification" allowing the user to manually apply the update via the `SKIP_WAITING` message queue.

### 3. Zombie Toast Throttling (Event Spam)

**Problem:** Rapid repetitive errors (e.g., failing bulk uploads) triggered an endless stack of Toast notifications, blinding the user.
**Permanent Rule:** The `toast.ts` module must deduplicate messages. If an identical active toast exists in the DOM, the new toast request MUST be silently dropped.

### 4. WCAG AAA Map Pin Geometry

**Problem:** Route map markers (`georavity-start` and `georavity-end`) relied purely on Red/Green color coding, entirely alienating Protanopia (colorblind) users.
**Permanent Rule:** Color is never enough. Use specific geometry and CSS SVG patterns:

- Start / Done / Trust: Green + Circle + Dotted Pattern.
- End / Snag / Warning: Red + Square + Striped Pattern.

---

## 📱 Mobile Engine Constraints (Flutter)

### 5. Infinite Scroll OOM (Memory Leak)

**Problem:** Default Flutter `ImageCache` consumes 1000 images or 100MB, guaranteeing an Out-Of-Memory (OOM) crash on low-end 3G Syrian smartphones during infinite scroll.
**Permanent Rule:** The `PaintingBinding.instance.imageCache` must be hard-capped in `main.dart` to `maximumSize = 100` and `maximumSizeBytes = 50 * 1024 * 1024` (50MB). Do NOT remove this cap.

### 6. Escrow Double-Tap Spending

**Problem:** Rapid double-taps on the "Release Escrow" button triggered concurrent API mutations, risking financial double-spending.
**Permanent Rule:** All critical State-Mutating BLoC Events (e.g., `ReleaseEscrow`, `SubmitBid`) MUST use the `droppable()` Event Transformer from `bloc_concurrency` to mathematically guarantee that concurrent events are ignored while the primary transaction is locking the DB.

### 7. Keyboard Dismissal UI Fracture

**Problem:** Dismissing a `BottomSheet` while the keyboard was active caused the keyboard to snap out of sync with the bottom sheet animation, shattering the UI frame.
**Permanent Rule:** A global `KeyboardDismissObserver` (extending `NavigatorObserver`) must be bound to the root `MaterialApp`. It instantly triggers `FocusManager.instance.primaryFocus?.unfocus()` whenever any route is popped, guaranteeing synchronized exit animations.

### 8. Ghost Keyboard Submissions (Web)

**Problem:** A user hits "Enter" to submit a form. A 500ms API lock begins. If the user mashes "Enter" while the keyboard is still active (but the UI is loading), the `keypress` events bypass the DOM disable state and trigger duplicate submissions.
**Permanent Rule:** The global `ui-lock.ts` must execute `(document.activeElement as HTMLElement)?.blur();` and attach a capture-phase `keydown` interceptor that strictly calls `e.preventDefault(); e.stopPropagation();` on all keys while locked.

### 9. Scroll Lock Memory Leak (Web)

**Problem:** If the UI is locked (scroll disabled) and the user triggers a browser 'Back' navigation (via swipe gesture), the lock state is preserved in the bfcache, causing the previous page to be permanently frozen.
**Permanent Rule:** A global `popstate` event listener must be attached to `window` to unconditionally run `unlockUI()` and clear all DOM locks upon back/forward navigation.

### 10. LocalStorage Quota Crash (Web)

**Problem:** `sessionStorage` has a strict 5MB limit. Endless auto-saves (e.g., uploading Base64 images to form drafts) crash the JS execution thread when the `QuotaExceededError` is thrown, yielding a White Screen of Death.
**Permanent Rule:** All storage writes must be proxied through a `safeSessionStorageSet` wrapper that traps `QuotaExceededError` and executes an LRU (Least Recently Used) cache eviction protocol to safely drop old drafts.

### 11. Pinch-To-Zoom Layout Destruction (Web)

**Problem:** iOS Safari allows pinch-to-zoom natively, which completely destroys the App-Like Web UI structure (fixed headers, off-canvas menus).
**Permanent Rule:** A global `touchmove` and `touchend` interceptor in `main.ts` must block `event.scale !== 1` and `touches.length > 1` to strictly enforce a Native App feel.

### 12. Double-Tap Route Duplication (Mobile)

**Problem:** The Flutter animation framework takes ~300ms to mount a new route. If a user double-taps a navigation card rapidly, the same screen is pushed onto the stack twice.
**Permanent Rule:** ALL navigation must be routed through `DebouncedNavigator` (in `core/utils/debounced_navigator.dart`), which drops subsequent `push` requests if they occur within 400ms of the last push.

### 13. RenderFlex Overflow Protection (Mobile)

**Problem:** If a visually impaired user sets their OS font size to 300% (Dynamic Type), every Flutter layout mathematically shatters into a wall of Yellow/Black "RenderFlex Overflow" errors.
**Permanent Rule:** The root `MaterialApp.builder` MUST wrap the app in a `MediaQuery` that restricts the `textScaler.clamp(minScaleFactor: 1.0, maxScaleFactor: 1.3)`. This guarantees layout integrity while maintaining reasonable accessibility scaling.

### 14. Async DOM Disassociation (Zombie Callback Protection)

**Problem:** In Vanilla TS (no Virtual DOM), changing the active tab in the hash router destroyed DOM elements. In-flight requests initiated from the previous tab would later resolve and attempt to manipulate those dead elements (`Cannot read properties of null`), causing ghost memory leaks and global error spam.
**Permanent Rule:** The global `api/_client.ts` exports an `abortPendingRouteRequests()` function that severs an active `AbortController`. This MUST be called synchronously in `hash-router.ts` during any `setActiveTab` or `popstate` transition to annihilate pending network requests from the outgoing page.

### 15. Chronological State Regression (Pessimistic Epoch Lock)

**Problem:** Severe network latency caused stale `GET` requests (e.g., fetching escrow status) to arrive _after_ a fast `POST` request (e.g., releasing escrow) had already updated the UI. This overwrote the UI with old data, causing users to panic and double-submit financial mutations.
**Permanent Rule:** All state-mutating requests (`POST/PUT/DELETE`) must update a `lastMutationEpoch` timestamp in `_client.ts`. Any `GET` request must record its `startTime`. If the `GET` response arrives and its `startTime < lastMutationEpoch`, it MUST be discarded as an `AbortError` to prevent state staleness.

### 16. Double-Bind Data Destruction Paradox (Cross-Tab Re-Auth)

**Problem:** The cross-tab logout banner contained a direct `<a href="/auth.html">` link. Clicking it forced a hard navigation, instantly destroying any unsaved form data. Furthermore, logging back in from another tab triggered an immediate `window.location.reload()` due to the Schizophrenia Lock, also destroying data.
**Permanent Rule:** The cross-tab logout CTA MUST use `target="_blank"` to isolate authentication to a new tab. Additionally, `clearAuth()` must save an `ORPHANED_SESSION_KEY` so the `storage` event can intelligently bypass the reload if the exact same user logs back in.

### 17. Offline Cookie Resurrection (Kill Switch)

**Problem:** If `clearAuth()` was executed while offline, the backend `/api/auth/logout` request failed silently. The UI appeared logged out locally, but the `HttpOnly` JWT remained immortal in the browser, leaving protected routes vulnerable upon network restoration.
**Permanent Rule:** A `nammerha_pending_kill_switch` flag MUST be set locally if the server logout fails. The global API interceptor (`_client.ts`) MUST aggressively block all non-login outbound traffic if this flag is active.

### 18. FormData Stream Consumption Crash

**Problem:** The In-Place Re-auth Modal paused 401 requests and replayed them via a `continue` loop. If the original payload contained a `ReadableStream` (e.g., file uploads via `FormData`), `fetch()` consumed the stream on the first attempt, causing the replay to throw a fatal `TypeError` and crash the JS thread.
**Permanent Rule:** The `_client.ts` interceptor MUST catch `TypeError` during re-auth replays, explicitly check if `fetchOptions.body instanceof ReadableStream`, and gracefully prompt the user to re-attach their files instead of crashing.

### 19. The "Time-Machine" Form Rehydration Paradox (Bfcache Phantom State)

**Problem:** We implemented `safeSessionStorageSet` for form drafts to prevent data loss. However, if a user successfully submits a form, navigates away, and then clicks the browser "Back" button, the Bfcache resurrects the page. The `form-draft.ts` script would blindly hydrate the draft from `sessionStorage`, making the form appear completely filled out again. Users panicked, assuming their submission failed, leading to duplicate financial requests.
**Permanent Rule:** Any state-mutating request (`POST/PUT/DELETE`) executed in `api/_client.ts` MUST globally broadcast an `nm_form_committed` CustomEvent. The `form-draft.ts` utility MUST listen for this event, physically wipe all active drafts in the current tab, and inject a strict `nm_draft_committed_${key}=true` lock. The hydration function must block rehydration if this lock exists.

### 20. The 400 Wipeout (Premature Form Eviction)

**Problem:** A `POST` request that fails validation (e.g., 400 Bad Request) still historically fired the `nm_form_committed` epoch broadcast in `_client.ts`. This instantly and permanently deleted the user's form draft because it fired _before_ checking `!res.ok`. The user was forced to re-enter all data if a single field validation failed.
**Permanent Rule:** The `nm_form_committed` broadcast and `lastMutationEpoch` update MUST strictly execute _after_ verifying `res.ok`. Failed network or validation requests must never destroy local drafts.

### 21. Cross-Pollination Form Annihilation

**Problem:** The `nm_form_committed` listener in `form-draft.ts` wiped ALL known drafts in the current session. A minor side-effect `POST` request (like toggling a setting or liking an item) would silently destroy the user's massive BOQ or Damage Report draft that they were currently filling out.
**Permanent Rule:** The blanket draft eviction is prohibited. Draft clearing must be targeted via the `nm_clear_specific_draft` custom event, or explicitly via `clearDraft(key)` from the specific Page Module.

### 22. The Diagonal Swipe Trap (Horizontal Lock)

**Problem:** The `pull-refresh.ts` gesture handler triggered `e.preventDefault()` if `distance > 0` (measuring vertical delta only). If a user swiped horizontally on a carousel or tabs but their finger angled slightly downwards, the gesture was hijacked, completely blocking horizontal accessibility.
**Permanent Rule:** The touch handler MUST employ a Trigonometric Lock. If `Math.abs(deltaX) > 5` and `Math.abs(deltaY) < 10` during the initial stroke, the gesture handler must set an `isHorizontalLock = true` state and immediately bail out, preserving native horizontal scrolling.

### 23. The Draft Poisoning Paradox (Bfcache Form Lockout)

**Problem:** After form submission, a `nm_draft_committed_${key}=true` lock was injected to prevent Bfcache resurrection. However, `saveDraft` failed to annihilate this lock when the user started a *new* draft. If a user refreshed the page while drafting a second report, `loadDraft` would see the old lock and permanently delete the new draft, causing a catastrophic data blackhole.
**Permanent Rule:** The `saveDraft` function MUST unconditionally execute `sessionStorage.removeItem('nm_draft_committed_${key}')` the moment a user begins typing, mathematically guaranteeing the lock is destroyed for subsequent drafts.

### 24. The Glass Prison Trap (Keyboard Lockout)

**Problem:** The `ui-lock.ts` global UI freeze mechanism utilized a capture-phase `keydown` interceptor that blindly called `e.preventDefault()` for ALL keys. This blocked native browser survival shortcuts (`Cmd+R`, `F5`, `Cmd+W`), trapping the user visually and interactively if the network hung.
**Permanent Rule:** The `keydown` interceptor MUST employ an Escape Route Preservation check. It must immediately `return` if `e.metaKey`, `e.ctrlKey`, `e.altKey`, or `e.key.startsWith('F')` is detected, ensuring the browser retains control over window survival commands.

### 25. The Blind Oracle Re-Auth Vulnerability (Message Spoofing)

**Problem:** The In-Place Re-auth modal iframe communicated via a `message` event listener that blindly trusted any `e.data === 'nm_auth_success'` message without verifying the origin. A malicious extension or cross-window interaction could spoof this message, triggering a replay attack on aborted financial mutations.
**Permanent Rule:** ALL `message` event listeners MUST enforce Zero-Trust Origin Verification by strictly validating `e.origin === window.location.origin` before processing the payload.

### 26. The State Desync Paradox (Hash Revert Failure)

**Problem:** In the SPA router (`hash-router.ts`), if the user rejected a `DirtyStateGuard` navigation warning, the router attempted to push the old URL back into history using `window.location.href`. However, because `popstate` fires *after* the URL changes, `window.location.href` already contained the *new* URL. This pushed the new URL into history but aborted the UI update, trapping the user in a permanently desynced state where they could not navigate to the new tab.
**Permanent Rule:** The `hash-router.ts` MUST maintain a strictly controlled `currentHash` internal state variable. If an internal navigation is cancelled, the router MUST use `history.replaceState(null, '', '#' + currentHash)` to safely revert the URL back to match the currently rendered UI.

### 27. Cryptographic Theater Failure (Async Race Condition)

**Problem:** The pull-to-refresh gesture handler immediately displayed a "Refresh Complete" checkmark the millisecond the `REFRESH_EVENT` was dispatched, disregarding the fact that the actual data fetch (Network Promise) takes several seconds. This created severe cognitive dissonance where the UI claimed success while old data remained on screen.
**Permanent Rule:** The `REFRESH_EVENT` must expose an asynchronous lock via its `detail` payload (`detail.wait = Promise`). The pull-to-refresh engine MUST delay the `showRefreshComplete()` transition until this promise has resolved, enforcing strict Synchronicity between Network State and Visual Feedback.

### 28. Cross-Origin Privacy Shield Spoofing

**Problem:** The `session-timeout.ts` Privacy Shield used the exact same flawed `message` event listener pattern as the re-auth modal. It listened for `nm_auth_success` without checking `e.origin`. A malicious tab could broadcast this message, bypassing the Privacy Shield lock and exposing the user's unsaved session data underneath without actual authentication.
**Permanent Rule:** The Zero-Trust Origin Verification (`e.origin === window.location.origin`) MUST be universally applied to all cross-context message listeners, specifically including the `session-timeout.ts` Privacy Shield listener.

### 29. Cross-User Draft Poisoning (IDOR via Local Storage)

**Problem:** If a user logged out from Tab A, and logged in as a different user in Tab B, Tab A's "State Schizophrenia Lock" would force a hard reload. However, because `sessionStorage` is tab-scoped, the old user's unsubmitted form drafts remained in memory. The new user's session would blindly hydrate these generic drafts (e.g. `nm_draft_report`), exposing highly sensitive financial or personal data belonging to the previous user.
**Permanent Rule:** Zero-Trust Data Hydration MUST be enforced. Every saved draft MUST be cryptographically sealed with the `owner_uid`. The `loadDraft` function MUST perform a biometric match against the currently active `user_id`. If they do not match, the draft MUST be instantly annihilated to prevent cross-user poisoning.

### 30. Service Worker 4xx Data Blackhole & Binary Corruption

**Problem:** The `saveToQueue` function historically used `await request.text()`, permanently corrupting binary offline uploads (like Damage Report GPS Photos). Furthermore, `replayQueue` blindly submitted old headers (stale `X-CSRF-Token`). If the session expired while offline, the backend returned 401/403. The SW treated 4xx as a "Client Error" and instantly deleted the queued data, creating a catastrophic Data Blackhole for offline workers.
**Permanent Rule:** 
1. **Binary Integrity:** `saveToQueue` MUST use `await request.blob()` to preserve `multipart/form-data` perfectly.
2. **Auth-Resilience Guard:** `replayQueue` MUST explicitly ignore 401, 403, and 419 errors when pruning the queue. It must freeze execution to wait for re-authentication.
3. **Dynamic CSRF Injection:** `replayQueue` MUST execute a preemptive fetch to `/api/csrf-token` to inject a fresh token into `entry.headers` before replaying the offline mutation.
### 31. Strict Content Security Policy (CSP) Inline Execution Block
**Problem:** A fallback error screen used an inline `onclick="window.location.reload()"` handler. Under strict Web Security environments (`script-src 'self'`), the browser instantly blocks inline Javascript. This permanently locked users on a dead screen, destroying operational flow and trapping them without recovery.
**Permanent Rule:** ALL interactive UI elements MUST be bound using `addEventListener` securely within the JavaScript runtime context via deterministic DOM element IDs (e.g. `document.getElementById('nm-retry').addEventListener(...)`). Under absolutely no circumstances may any HTML element contain an inline `onclick`, `onchange`, or `onsubmit` execution handler.
