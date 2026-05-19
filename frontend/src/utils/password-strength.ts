// ============================================================================
// Nammerha — Shared Password Strength Utility
// PLT-MAR11-005 FIX: Extracted from auth.ts and reset-password.ts to DRY.
// Single source of truth for password strength evaluation + UI rendering.
// ============================================================================

import { t } from './i18n';

interface StrengthLabel {
  text: string;
  i18nKey: string;
}

/**
 * Evaluates password strength (0–5) and updates the visual meter.
 *
 * Scoring (BUG-011 FIX — now matches backend's 5 criteria):
 *   +1 for >= 8 characters
 *   +1 for uppercase letter
 *   +1 for lowercase letter
 *   +1 for digit
 *   +1 for special character
 *
 * Visual bars: 4 bars map to 5 criteria via threshold rounding.
 *
 * @param password - The password string to evaluate
 * @param strengthBars - HTMLCollection of bar elements (4 expected)
 * @param strengthLabel - Element to display strength text
 * @returns Score from 0–5
 */
export function updatePasswordStrength(
  password: string,
  strengthBars: HTMLCollection | undefined,
  strengthLabel: HTMLElement | null,
): number {
  let score = 0;
  if (password.length >= 8) {
    score++;
  }
  if (/[A-Z]/.test(password)) {
    score++;
  }
  // BUG-011 FIX: Was missing — backend requires lowercase (auth.routes.ts L106).
  // Without this, 'PASSWORD1!' scored 3/4 ("good") but failed backend validation.
  if (/[a-z]/.test(password)) {
    score++;
  }
  if (/[0-9]/.test(password)) {
    score++;
  }
  if (/[^A-Za-z0-9]/.test(password)) {
    score++;
  }

  // BUG-011 FIX: Expanded from 4 to 5 colors/labels to match 5 scoring criteria.
  const colors = ['bg-red-400', 'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-400'];

  const labels: StrengthLabel[] = [
    { text: t('pw_strength_very_weak', 'ضعيف جداً'), i18nKey: 'pw_strength_very_weak' },
    { text: t('pw_strength_weak', 'ضعيف'), i18nKey: 'pw_strength_weak' },
    { text: t('pw_strength_fair', 'مقبول'), i18nKey: 'pw_strength_fair' },
    { text: t('pw_strength_good', 'جيد'), i18nKey: 'pw_strength_good' },
    { text: t('pw_strength_strong', 'قوي'), i18nKey: 'pw_strength_strong' },
  ];

  if (strengthBars) {
    // Map 5 criteria to 4 visual bars: bar fills at score >= (barIndex + 1) * 5/4
    for (let i = 0; i < strengthBars.length; i++) {
      const bar = strengthBars[i] as HTMLElement;
      const threshold = Math.ceil(((i + 1) * 5) / 4);
      if (score >= threshold) {
        bar.className = `h-2 flex-1 rounded-full ${colors[score - 1]}`;
      } else {
        bar.className = 'h-2 flex-1 rounded-full bg-slate-200';
      }
    }
  }

  if (strengthLabel && password.length > 0) {
    const label = labels[score - 1];
    if (label) {
      strengthLabel.textContent = label.text;
      strengthLabel.setAttribute('data-i18n', label.i18nKey);
    } else {
      strengthLabel.textContent = t('pw_strength_too_short', 'قصير جداً');
      strengthLabel.setAttribute('data-i18n', 'pw_strength_too_short');
    }
  } else if (strengthLabel) {
    strengthLabel.textContent = t('pw_requirements', '+٨ أحرف، حرف كبير، حرف صغير، رقم، رمز');
    strengthLabel.setAttribute('data-i18n', 'pw_requirements');
  }

  return score;
}
