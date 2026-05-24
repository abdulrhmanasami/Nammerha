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
