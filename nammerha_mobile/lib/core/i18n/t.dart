// ============================================================================
// Nammerha i18n — Translation Lookup Helper
// ============================================================================
// Safe t() function matching web's t(key, fallback) pattern.
// Provides BuildContext extension for ergonomic `context.tr('key')` usage.
// Fallback chain: exact key → Arabic value → key itself (never crashes).
// ============================================================================

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'locale_cubit.dart';
import 'translations.dart';

/// Translate a key for the current locale.
///
/// Usage:
/// ```dart
/// Text(context.tr('auth_welcome'))
/// Text(tr(context, 'auth_welcome'))
/// ```
///
/// Fallback chain:
/// 1. `kTranslations[key][currentLocale]` — exact match
/// 2. `kTranslations[key]['ar']` — Arabic fallback (source language)
/// 3. `key` itself — raw key as last resort (makes missing keys visible)
String tr(BuildContext context, String key) {
  final locale = context.read<LocaleCubit>().state.languageCode;
  final entry = kTranslations[key];
  if (entry == null) return key;
  return entry[locale] ?? entry['ar'] ?? key;
}

/// Context extension for ergonomic translation access.
extension TranslationExtension on BuildContext {
  /// Translate a key. Shorthand for `tr(context, key)`.
  String tr(String key) {
    final locale = read<LocaleCubit>().state.languageCode;
    final entry = kTranslations[key];
    if (entry == null) return key;
    return entry[locale] ?? entry['ar'] ?? key;
  }

  /// Current locale code (e.g., 'ar', 'en').
  String get localeCode => read<LocaleCubit>().state.languageCode;

  /// Whether the current locale is RTL.
  bool get isRTL => read<LocaleCubit>().state.languageCode == 'ar';
}
