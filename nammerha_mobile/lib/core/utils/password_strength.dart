// ═══════════════════════════════════════════════════════════════════════════
// Nammerha — Unified Password Strength Scoring (Single Source of Truth)
// ═══════════════════════════════════════════════════════════════════════════
// MOB-PW-DRY FIX: Extracted from 3 duplicate implementations:
//   1. PasswordStrengthIndicator._strengthScore (widget)
//   2. ResetPasswordFormCubit.updateStrength (reset-password screen)
//   3. ChangePasswordFormCubit.updateStrength (profile change-password)
//
// All 3 locations now call this single function. If the scoring algorithm
// needs to change (e.g., add Unicode support for Arabic passwords, increase
// minimum length to match backend Zod schema), only this file needs updating.
//
// Scoring (0–4):
//   +1 for length >= 8
//   +1 for at least one uppercase letter [A-Z]
//   +1 for at least one lowercase letter [a-z]
//   +1 for at least one digit or special character [0-9!@#\$&*~]
//
// Returns an integer in the range [0, 4].
// ═══════════════════════════════════════════════════════════════════════════

/// Cached RegExp instances — avoid recompilation on every keystroke.
final _reUppercase = RegExp(r'[A-Z]');
final _reLowercase = RegExp(r'[a-z]');
final _reDigitOrSpecial = RegExp(r'[0-9!@#\$&*~]');

/// Computes a password strength score from 0 (empty/very weak) to 4 (strong).
///
/// This is the **single source of truth** for password strength across all
/// screens (register, reset-password, change-password) and the
/// [PasswordStrengthIndicator] widget.
int computePasswordStrength(String password) {
  if (password.isEmpty) return 0;

  int score = 0;
  if (password.length >= 8) score++;
  if (_reUppercase.hasMatch(password)) score++;
  if (_reLowercase.hasMatch(password)) score++;
  if (_reDigitOrSpecial.hasMatch(password)) score++;
  return score;
}
