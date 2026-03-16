# Nammerha Frontend — Engineering Rules

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
