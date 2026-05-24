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
