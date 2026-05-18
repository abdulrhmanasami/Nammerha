// ============================================================================
// Nammerha — P1-013: Required Field Markers (Pre-Submit)
// ============================================================================
// Auto-detects form fields with the `required` attribute and adds visual
// asterisk markers to their associated labels — BEFORE the user attempts
// to submit.
//
// Problem: Forms across auth, contact, profile, and supplier pages have
// `required` HTML attributes on inputs, but ZERO visual indicators.
// Users don't know which fields are mandatory until they hit Submit
// and get validation errors. This violates WCAG 3.3.2 (Labels or
// Instructions) which mandates "required fields are indicated."
//
// Solution: Auto-detection via two strategies:
//   1. Explicit for/id: `label[for="x"]` ↔ `input#x[required]`
//   2. Ancestor wrap: `label > input[required]` (contact.html pattern)
//
// The utility adds `.nm-required-label` to each label, and CSS provides
// the `::after { content: " *"; color: error-red; }` marker.
//
// Additionally sets `aria-required="true"` on every required field for
// screen reader parity (belt-and-suspenders with HTML `required`).
//
// Standards:
//   - WCAG 3.3.2 (Labels or Instructions): "Required fields are indicated"
//   - WCAG 1.3.1 (Info & Relationships): Programmatic role via aria-required
//   - Material Design 3 (Text Fields): "Use an asterisk (*) for required fields"
//   - Apple HIG (Forms): "Indicate which fields are required"
//
// Usage (self-initializing):
//   import '../utils/required-markers';  // runs on DOMContentLoaded
// ============================================================================

/**
 * Scans the DOM for `[required]` fields and marks their associated labels.
 * Safe to call multiple times (idempotent — skips already-marked labels).
 */
export function initRequiredMarkers(): void {
    const fields = document.querySelectorAll<HTMLElement>(
        'input[required], textarea[required], select[required]'
    );

    fields.forEach(field => {
        let labelEl: HTMLElement | null = null;

        // Strategy 1: Explicit label[for] → input[id] association
        // Pattern: <label for="reg-name">Full Name</label> ... <input id="reg-name" required>
        if (field.id) {
            labelEl = document.querySelector<HTMLElement>(`label[for="${CSS.escape(field.id)}"]`);
        }

        // Strategy 2: Ancestor <label> wrapping the input (contact.html pattern)
        // Pattern: <label><span>Full Name</span><input required></label>
        if (!labelEl) {
            const parentLabel = field.closest('label');
            if (parentLabel) {
                // If the label has a child <span> acting as the visual label text,
                // mark the span (not the entire label) for precise asterisk placement.
                const textSpan = parentLabel.querySelector<HTMLElement>(':scope > span');
                labelEl = textSpan || (parentLabel as HTMLElement);
            }
        }

        // Apply marker class (idempotent)
        if (labelEl && !labelEl.classList.contains('nm-required-label')) {
            labelEl.classList.add('nm-required-label');
        }

        // Accessibility: aria-required (supplements HTML `required` for screen readers)
        if (!field.hasAttribute('aria-required')) {
            field.setAttribute('aria-required', 'true');
        }
    });
}

// ─── Self-initializing ──────────────────────────────────────────────────────
// Runs automatically when this module is imported. DOMContentLoaded ensures
// the HTML labels/inputs exist before scanning.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRequiredMarkers);
} else {
    // DOM already loaded (module loaded after DOMContentLoaded)
    initRequiredMarkers();
}
