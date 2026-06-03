# Nammerha Frontend — Engineering Rules

## 🛑 ZERO-REGRESSION MEMOS (CRITICAL AI MEMORY)

**MEMO 81: Tooltip RTL Cartesian Mismatch & Theme Ghost OS Hijacking (June 3, 2026)**

- **Root Cause Destroyed:**
  1. **Tooltip Alignment Failure:** The zero-JS CSS tooltip engine attempted to mix logical positioning (`inset-inline-start: 50%`) with physical CSS transforms (`translateX(-50%)`). In a strict RTL environment, this caused a mathematical Cartesian mismatch, pushing the tooltip completely off the target element. Also, long text broke the UI via `white-space: nowrap`.
  2. **Theme Mirage & Ghost State:** Nammerha enforces a strict "Light Mode Default" mandate. However, Tailwind was configured with `darkMode: ['selector', '[data-theme="dark"]']`. On first boot without localStorage, `theme-toggle.js` injected a shadow `system` state. Tailwind v3.4 silently fell back to `@media (prefers-color-scheme: dark)`, allowing the OS to hijack the UI and render it dark against the user's will and in violation of the light-mode mandate.
- **New Logic Built:**
  1. **Tooltip Pure Symmetry:** Replaced the logical/physical mismatch with strict physical absolute symmetry globally (`left: 50%` + `translateX(-50%)`), completely bypassing RTL drift. Tooltip text wraps responsively using `max-width: 250px; white-space: normal`.
  2. **Absolute Light Mandate Validation:** Changed Tailwind to strict class-mode (`darkMode: ['class', '[data-theme="dark"]']`) to permanently eliminate OS-media-query fallback. Purged the `system` state from `theme-toggle.js`. The default mode is mathematically locked to `light`.
- **Verification:** Frontend compiled correctly. `main.css`, `theme-toggle.js`, and `tailwind.config.js` locked to Platinum standard. Server recompiled via `/deploy` workflow.

**MEMO 45: The Deployment Mirage Loop (Mandatory Deployment Protocol) (May 28, 2026)**

- **Root Cause Destroyed:** The AI Agent spent two months executing "Platinum Standard Audits" locally, successfully wiping bugs (like the Ghost Dark Mode Toggle), but *failed to deploy the code to the live server*. This created a Mirage Loop where the human evaluated the live server, saw the bug, and instructed the Agent to fix it again. The Agent assumed its previous fix failed and wrote unnecessarily complex UI patches (`!important`, DOM Observers) for code that was already correct locally.
- **New Logic Built:** 
  1. A **Mandatory Deployment Check** is now strictly enforced. ANY session that modifies frontend UI/UX states that the human user must verify, MUST end with an explicit `deploy` protocol execution (`rsync` to the server and a zero-downtime `docker compose up -d --build`).
  2. NEVER assume a bug fix has failed if the environment the user is testing is out-of-sync with the workspace. Always verify deployment state first.

**MEMO 44: The Event Quarantine Pattern (Zombie Listeners) (May 28, 2026)**

- **Root Cause Destroyed:** 
  1. The SPA (`hash-router.ts`) navigation did not automatically clear JavaScript Event Listeners from the DOM.
  2. Successive module loads stacked duplicate listeners on buttons (e.g., `confirmAction` dialogs, `submitForm`), leading to Exponential Event Triggers (Double Submissions, infinite loops).
- **New Logic Built:**
  1. **Event Quarantine Pattern:** ALL dynamic event listeners bound during a view's lifecycle MUST utilize an `AbortController` (or central `nmClearAllListeners` registry). 
  2. When navigating away, `controller.abort()` must execute, chemically incinerating all listeners and guaranteeing mathematical zero-leak state.

**MEMO 43: Zero-Patching Policy (The OS Override Rebellion) (May 28, 2026)**

- **Root Cause Destroyed:** The AI Agent fought the "Dark Mode Ghost State" by surgically removing HTML buttons and modifying CSS. However, the root cause was a covert JavaScript listener inside `theme-toggle.js` (`window.matchMedia('(prefers-color-scheme: dark)')`) that forcefully rebelled against the UI and injected the dark theme based on the user's OS. The Agent used "Patching" (CSS overrides) instead of "Root Cause Analysis".
- **New Logic Built:**
  1. **Zero-Patching Policy:** We absolutely prohibit using CSS `!important` or `setTimeout` hacks to fight state anomalies. 
  2. Always trace the ghost state to the fundamental trigger (e.g., Native OS APIs, `StorageEvent`, Service Workers) and eradicate it at the source.

## Icon System Standard (Mandatory)

> **PHOSPHOR ICONS ONLY** — No exceptions.

All icons in the Nammerha frontend MUST use the **Phosphor Icons** system, self-hosted at `/fonts/phosphor/phosphor.css`.

### Allowed
```html
<i class="ph ph-house"></i>
<i class="ph ph-check-circle"></i>
```

### Forbidden
- ❌ Unicode symbols used as icons: `✓ ✕ ✗ ★ ← → ▲ ▼ ● ◉`
- ❌ Emoji used as icons: `🏠 🔧 ⚡ 📊 🛒`
- ❌ Inline SVGs for common icons (use Phosphor class instead)
- ❌ External icon CDNs (Font Awesome, Material Icons, Heroicons, etc.)
- ❌ CSS-generated icon content (`content: "→"`)

### Pattern for Dynamic Icons in TypeScript
```typescript
// Helper for inline Phosphor icons in template literals
const ph = (name: string) => `<i class="ph ph-${name}"></i>`;

// Usage
btn.innerHTML = `${ph('check')} Submitted`;
```

### Rationale
- **Consistency**: Single visual language across all 31+ pages
- **Performance**: Self-hosted, no external CDN dependency
- **Syria 2G**: Zero network requests for icons
- **RTL**: Phosphor supports bidirectional rendering
- **Accessibility**: `<i>` tags are aria-hidden by default

## i18n Architecture

- Engine: `public/i18n.js` (common keys + `__nmDictMerge()` API)
- Page chunks: `public/i18n/{page}.js` (loaded via `<script defer>`)
- All keys MUST be `snake_case` format
- New keys go in the appropriate page chunk, NOT the engine
- Backward compatibility via `KEY_ALIASES` in engine
