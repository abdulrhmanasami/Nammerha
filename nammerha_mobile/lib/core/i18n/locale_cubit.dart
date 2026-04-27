// ============================================================================
// Nammerha i18n — Locale State Management (Cubit)
// ============================================================================
// Manages the active locale with SharedPreferences persistence.
// Matches web's localStorage('nm_preferred_locale') pattern.
// ============================================================================

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'supported_locales.dart';

/// Manages the active locale. Persists choice to SharedPreferences.
///
/// Usage in main.dart:
/// ```dart
/// BlocProvider<LocaleCubit>(
///   create: (_) => LocaleCubit()..loadSavedLocale(),
/// ),
/// ```
class LocaleCubit extends Cubit<Locale> {
  LocaleCubit() : super(const Locale('ar', 'SY'));

  /// Load persisted locale from SharedPreferences.
  /// Call once at app startup.
  Future<void> loadSavedLocale() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(kLocaleStorageKey);
      if (saved != null && _isSupported(saved)) {
        emit(Locale(saved));
      }
    } catch (_) {
      // Fail silently — default Arabic locale is already set
    }
  }

  /// Switch to a new locale.
  /// Persists to SharedPreferences and emits new state.
  Future<void> switchLocale(String code) async {
    if (!_isSupported(code)) return;
    emit(Locale(code));
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(kLocaleStorageKey, code);
    } catch (_) {
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
