// ============================================================================
// Nammerha Frontend — Shared Validators
// ============================================================================
// DRY validation utilities used across auth pages.
// Wave 10 Fix: P1-W10-005 (password duplication), P1-W10-006 (email duplication)
// ============================================================================

/**
 * RFC 5321 compliant email regex — single source of truth.
 * Used by: auth.ts (login, register, forgot-password), reset-password.ts
 */
export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/** Maximum password length to prevent bcrypt DoS (matches backend Zod schema) */
export const MAX_PASSWORD_LENGTH = 128;

/** Minimum password length (matches backend Zod schema) */
export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates password complexity against platform rules.
 * Must match backend Zod schema in validation/schemas.ts.
 *
 * Rules:
 *   - At least 8 characters
 *   - At most 128 characters (bcrypt DoS prevention)
 *   - At least one uppercase letter
 *   - At least one lowercase letter
 *   - At least one digit
 *   - At least one special character
 *
 * P2-AUDIT-005 FIX: Accepts optional `translate` function for i18n-safe error messages.
 * PREVIOUS: Hardcoded Arabic strings — broke i18n for English users.
 * Standard: i18n consistency, DRY pattern parity with rest of codebase.
 *
 * @param password The password to validate
 * @param translate Optional i18n function (e.g., `t` from utils/i18n.ts).
 *                  Falls back to Arabic strings if not provided.
 */
export function validatePasswordComplexity(
  password: string,
  translate?: (key: string, fallback: string) => string,
): PasswordValidationResult {
  const errors: string[] = [];
  const tr = translate ?? ((_key: string, fallback: string) => fallback);

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(tr('pw_rule_min_length', 'يجب أن تكون كلمة المرور 8 أحرف على الأقل'));
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    errors.push(tr('pw_rule_max_length', 'يجب ألا تتجاوز كلمة المرور 128 حرفاً'));
  }
  if (!/[A-Z]/.test(password)) {
    errors.push(tr('pw_rule_uppercase', 'يجب أن تحتوي على حرف كبير واحد على الأقل'));
  }
  if (!/[a-z]/.test(password)) {
    errors.push(tr('pw_rule_lowercase', 'يجب أن تحتوي على حرف صغير واحد على الأقل'));
  }
  if (!/[0-9]/.test(password)) {
    errors.push(tr('pw_rule_digit', 'يجب أن تحتوي على رقم واحد على الأقل'));
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push(tr('pw_rule_special', 'يجب أن تحتوي على رمز خاص واحد على الأقل'));
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates an email address against the platform regex.
 */
export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}
