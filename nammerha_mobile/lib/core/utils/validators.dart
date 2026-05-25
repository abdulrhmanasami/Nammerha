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

/// Validates a full name — strict parity with web validateName.
bool isValidName(String name) {
  final trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 100) return false;
  // Must contain at least one letter (any script)
  if (!RegExp(r'\p{L}', unicode: true).hasMatch(trimmed)) return false;
  // No digits (Western or Eastern Arabic)
  if (RegExp(r'[\d٠-٩]').hasMatch(trimmed)) return false;
  // No dangerous chars
  if (RegExp(r'[<>{}[\]\\]').hasMatch(trimmed)) return false;
  return true;
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

/// Name form field validator — returns translated error or null.
/// Enforces strict cross-platform parity (no digits, no symbols).
String? validateName(String? value, String Function(String) tr) {
  final trimmed = value?.trim() ?? '';
  if (trimmed.isEmpty) return tr('auth_name_required');
  if (trimmed.length < 2) return tr('auth_name_too_short');
  if (trimmed.length > 100) return tr('auth_name_too_long');
  if (!RegExp(r'\p{L}', unicode: true).hasMatch(trimmed)) return tr('auth_name_must_have_letters');
  if (RegExp(r'[\d٠-٩]').hasMatch(trimmed)) return tr('auth_name_no_digits');
  if (RegExp(r'[<>{}[\]\\]').hasMatch(trimmed)) return tr('auth_name_invalid_chars');
  return null;
}
