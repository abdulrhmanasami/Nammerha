// ============================================================================
// Nammerha i18n — Locale State Management (Cubit)
// ============================================================================
// Manages the active locale with SharedPreferences persistence.
// Matches web's localStorage('nm_preferred_locale') pattern.
//
// CURRENCY SYNC: Calls FormatUtils.setLocale() on every locale change so that
// all static currency formatting methods (used by 28+ screens) automatically
// resolve the correct symbol (ل.س / SYP) without needing BuildContext.
// ============================================================================

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'supported_locales.dart';
import '../utils/format_utils.dart';

/// Manages the active locale. Persists choice to SharedPreferences.
///
/// Usage in main.dart:
/// ```dart
/// BlocProvider<LocaleCubit>(
///   create: (_) => LocaleCubit()..loadSavedLocale(),
/// ),
/// ```
class LocaleCubit extends Cubit<Locale> {
  LocaleCubit() : super(const Locale('ar', 'SY')) {
    // Initialize FormatUtils with the default locale (Arabic)
    FormatUtils.setLocale('ar');
  }

  /// Load persisted locale from SharedPreferences.
  /// Call once at app startup.
  Future<void> loadSavedLocale() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(kLocaleStorageKey);
      if (saved != null && _isSupported(saved)) {
        FormatUtils.setLocale(saved);
        emit(Locale(saved));
      }
    } catch (e) {
      debugPrint('[Nammerha] i18n/locale_cubit: $e');
      // Fail silently — default Arabic locale is already set
    }
  }

  /// Switch to a new locale.
  /// Persists to SharedPreferences and emits new state.
  Future<void> switchLocale(String code) async {
    if (!_isSupported(code)) return;
    FormatUtils.setLocale(code);
    emit(Locale(code));
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(kLocaleStorageKey, code);
    } catch (e) {
      debugPrint('[Nammerha] i18n/locale_cubit: $e');
      // Persist failure is non-fatal — locale already switched in memory
    }
  }

  /// Current locale code shorthand.
  String get currentCode => state.languageCode;

  /// Whether current locale is RTL.
  bool get isRTL => state.languageCode == 'ar';

  /// Get the native name of the current locale.
  String get currentLocaleName {
    for (final loc in kSupportedLocales) {
      if (loc.code == state.languageCode) return loc.nativeName;
    }
    return 'العربية';
  }

  bool _isSupported(String code) {
    return kSupportedLocales.any((l) => l.code == code);
  }
}
