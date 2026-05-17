import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// ThemeCubit — Platinum-grade Theme State Management
/// ═══════════════════════════════════════════════════════════════════════════
/// Persists user preference via SharedPreferences.
/// Emits ThemeMode which MaterialApp observes.
/// ═══════════════════════════════════════════════════════════════════════════

class ThemeCubit extends Cubit<ThemeMode> {
  static const _key = 'nammerha_theme_mode';

  ThemeCubit() : super(ThemeMode.light);

  /// Load persisted theme preference on app start
  Future<void> loadSavedTheme() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_key);
      if (saved == 'dark') {
        emit(ThemeMode.dark);
      } else if (saved == 'system') {
        emit(ThemeMode.system);
      } else {
        emit(ThemeMode.light);
      }
    } catch (e) {
      debugPrint('[Nammerha] theme/theme_cubit: $e');
      // Fallback: light mode on error (fail-safe)
      emit(ThemeMode.light);
    }
  }

  /// Toggle between light and dark
  Future<void> toggleTheme() async {
    final newMode = state == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    emit(newMode);
    _persist(newMode);
  }

  /// Set theme explicitly
  Future<void> setTheme(ThemeMode mode) async {
    emit(mode);
    _persist(mode);
  }

  /// Whether dark mode is currently active
  bool get isDark => state == ThemeMode.dark;

  Future<void> _persist(ThemeMode mode) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final value = switch (mode) {
        ThemeMode.dark => 'dark',
        ThemeMode.system => 'system',
        ThemeMode.light => 'light',
      };
      await prefs.setString(_key, value);
    } catch (e) {
      debugPrint('[Nammerha] theme/theme_cubit: $e');
      // Silent — non-critical persistence failure
    }
  }
}
