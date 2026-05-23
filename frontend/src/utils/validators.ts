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

// ─── P2-S5-007: Name Validation (Backend Parity) ───────────────────────────
// Mirrors Zod schema in backend/src/validation/schemas.ts L64-71.
// PREVIOUS: Name validation was backend-only — users entering "12345" or "!!!"
// passed frontend validation, submitted, and got a generic "Invalid registration
// data" error with zero per-field guidance.
// Standard: DRY Principle, Frontend/Backend Parity, OWASP Input Validation.
// ────────────────────────────────────────────────────────────────────────────

export interface NameValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a user's full name against platform rules.
 * Must match backend Zod schema in validation/schemas.ts.
 *
 * Rules:
 *   - At least 2 characters
 *   - At most 100 characters
 *   - Must contain at least one Unicode letter (Arabic, Latin, etc.)
 *   - Must NOT contain digits
 *   - Must NOT contain dangerous characters (< > { } [ ] \)
 *
 * @param name The name to validate
 * @param translate Optional i18n function for error messages
 */
export function validateName(
  name: string,
  translate?: (key: string, fallback: string) => string,
): NameValidationResult {
  const errors: string[] = [];
  const tr = translate ?? ((_key: string, fallback: string) => fallback);
  const trimmed = name.trim();

  if (trimmed.length < 2) {
    errors.push(tr('name_rule_min', 'يجب أن يكون الاسم حرفين على الأقل'));
  }
  if (trimmed.length > 100) {
    errors.push(tr('name_rule_max', 'يجب ألا يتجاوز الاسم 100 حرف'));
  }
  if (!/\p{L}/u.test(trimmed)) {
    errors.push(tr('name_rule_letter', 'يجب أن يحتوي الاسم على حرف واحد على الأقل'));
  }
  if (/[0-9]/.test(trimmed)) {
    errors.push(tr('name_rule_no_digits', 'يجب ألا يحتوي الاسم على أرقام'));
  }
  if (/[<>{}[\]\\]/.test(trimmed)) {
    errors.push(tr('name_rule_no_special', 'يجب ألا يحتوي الاسم على رموز خاصة'));
  }

  return { valid: errors.length === 0, errors };
}
