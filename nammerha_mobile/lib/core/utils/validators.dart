// ============================================================================
// Nammerha Mobile — Shared Validators
// ============================================================================
// DRY validation utilities used across auth screens.
// P2-AUDIT-006: Email regex was duplicated 3+ times in login/register screens.
//
// Standard: Frontend Parity (validators.ts), Backend Parity (schemas.ts)
// ============================================================================

/// RFC 5321 compliant email regex — single source of truth.
/// Parity with: frontend/src/utils/validators.ts, backend/src/validation/schemas.ts
final RegExp emailRegExp = RegExp(
  r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
);

/// Maximum password length (parity with backend Zod schema).
const int maxPasswordLength = 128;

/// Minimum password length (parity with backend Zod schema).
const int minPasswordLength = 8;

/// Validates an email address against the platform regex.
bool isValidEmail(String? email) {
  if (email == null || email.trim().isEmpty) return false;
  return emailRegExp.hasMatch(email.trim());
}

/// Email form field validator — returns translated error or null.
/// [tr] is the translation function (context.tr).
String? validateEmail(String? value, String Function(String) tr) {
  if (value == null || value.trim().isEmpty) {
    return tr('auth_email_required');
  }
  if (!emailRegExp.hasMatch(value.trim())) {
    return tr('auth_email_invalid');
  }
  return null;
}
