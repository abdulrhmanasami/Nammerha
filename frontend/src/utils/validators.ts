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
 */
export function validatePasswordComplexity(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push('يجب أن تكون كلمة المرور 8 أحرف على الأقل');
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    errors.push('يجب ألا تتجاوز كلمة المرور 128 حرفاً');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('يجب أن تحتوي على حرف كبير واحد على الأقل');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('يجب أن تحتوي على حرف صغير واحد على الأقل');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('يجب أن تحتوي على رقم واحد على الأقل');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('يجب أن تحتوي على رمز خاص واحد على الأقل');
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
