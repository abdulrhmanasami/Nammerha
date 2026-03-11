// ============================================================================
// Nammerha — Shared Password Strength Utility
// PLT-MAR11-005 FIX: Extracted from auth.ts and reset-password.ts to DRY.
// Single source of truth for password strength evaluation + UI rendering.
// ============================================================================

interface StrengthLabel {
    text: string;
    i18nKey: string;
}

/**
 * Evaluates password strength (0–4) and updates the visual meter.
 *
 * Scoring:
 *   +1 for >= 8 characters
 *   +1 for uppercase letter
 *   +1 for digit
 *   +1 for special character
 *
 * @param password - The password string to evaluate
 * @param strengthBars - HTMLCollection of bar elements (4 expected)
 * @param strengthLabel - Element to display strength text
 * @returns Score from 0–4
 */
export function updatePasswordStrength(
    password: string,
    strengthBars: HTMLCollection | undefined,
    strengthLabel: HTMLElement | null,
): number {
    let score = 0;
    if (password.length >= 8) { score++; }
    if (/[A-Z]/.test(password)) { score++; }
    if (/[0-9]/.test(password)) { score++; }
    if (/[^A-Za-z0-9]/.test(password)) { score++; }

    const colors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-400'];

    const labels: StrengthLabel[] = [
        { text: 'Weak', i18nKey: 'pw_strength_weak' },
        { text: 'Fair', i18nKey: 'pw_strength_fair' },
        { text: 'Good', i18nKey: 'pw_strength_good' },
        { text: 'Strong', i18nKey: 'pw_strength_strong' },
    ];

    if (strengthBars) {
        for (let i = 0; i < strengthBars.length; i++) {
            const bar = strengthBars[i] as HTMLElement;
            if (i < score) {
                bar.className = `h-1 flex-1 rounded-full ${colors[score - 1]}`;
            } else {
                bar.className = 'h-1 flex-1 rounded-full bg-slate-200';
            }
        }
    }

    if (strengthLabel && password.length > 0) {
        const label = labels[score - 1];
        if (label) {
            strengthLabel.textContent = label.text;
            strengthLabel.setAttribute('data-i18n', label.i18nKey);
        } else {
            strengthLabel.textContent = 'Too short';
            strengthLabel.setAttribute('data-i18n', 'pw_strength_too_short');
        }
    } else if (strengthLabel) {
        strengthLabel.textContent = '8+ chars, 1 uppercase, 1 number, 1 special';
        strengthLabel.setAttribute('data-i18n', 'pw_requirements');
    }

    return score;
}
