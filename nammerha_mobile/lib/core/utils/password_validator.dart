// Nammerha — Shared Password Validation Utility
//
// Single source of truth for password complexity rules.
// Used by: RegisterWizardScreen, ResetPasswordScreen, ChangePasswordFormCubit
//
// Wave 10 Fix: P1-W10-009 (eliminate validation duplication)

/// Minimum password length (matches backend Zod schema)
const int kMinPasswordLength = 8;

/// Maximum password length to prevent bcrypt DoS (matches backend Zod schema)
const int kMaxPasswordLength = 128;

/// Result of password complexity validation.
class PasswordValidationResult {
  final bool isValid;
  final List<String> errors;

  const PasswordValidationResult({
    required this.isValid,
    required this.errors,
  });
}

/// Validates password complexity against platform rules.
///
/// Rules (must match backend `validation/schemas.ts`):
///   - At least [kMinPasswordLength] characters
///   - At most [kMaxPasswordLength] characters (bcrypt DoS prevention)
///   - At least one uppercase letter
///   - At least one lowercase letter
///   - At least one digit
///   - At least one special character
PasswordValidationResult validatePasswordComplexity(String password) {
  final errors = <String>[];

  if (password.length < kMinPasswordLength) {
    errors.add('password_too_short');
  }
  if (password.length > kMaxPasswordLength) {
    errors.add('password_too_long');
  }
  if (!RegExp(r'[A-Z]').hasMatch(password)) {
    errors.add('password_missing_uppercase');
  }
  if (!RegExp(r'[a-z]').hasMatch(password)) {
    errors.add('password_missing_lowercase');
  }
  if (!RegExp(r'[0-9]').hasMatch(password)) {
    errors.add('password_missing_digit');
  }
  if (!RegExp(r'[^A-Za-z0-9]').hasMatch(password)) {
    errors.add('password_missing_special');
  }

  return PasswordValidationResult(
    isValid: errors.isEmpty,
    errors: errors,
  );
}
