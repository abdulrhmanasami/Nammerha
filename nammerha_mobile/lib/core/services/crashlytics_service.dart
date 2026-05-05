// ============================================================================
// Nammerha — Crashlytics Service (GAP-M1 PLATINUM)
// ============================================================================
// Production crash reporting via Firebase Crashlytics. Captures:
//   1. Uncaught Flutter framework errors (FlutterError.onError)
//   2. Uncaught async/Zone errors (PlatformDispatcher.onError)
//   3. Manual non-fatal error reporting (recordError)
//   4. Custom keys for contextual debugging (user role, screen, locale)
//
// Nammerha Domain Law: Memory Sovereignty
//   No StreamSubscription, Controller, or FocusNode — this is a pure service.
//
// Standard: ISO/IEC 25010 Reliability (Fault Tolerance + Recoverability)
// ============================================================================

import 'dart:async';

import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';

/// Singleton service for production crash reporting.
///
/// Must be initialized in `main()` AFTER `Firebase.initializeApp()`.
///
/// Usage:
/// ```dart
/// // In main():
/// CrashlyticsService.instance.init();
///
/// // Anywhere in the app:
/// CrashlyticsService.instance.recordError(error, stackTrace);
/// CrashlyticsService.instance.setUserContext(userId: '...', role: 'donor');
/// CrashlyticsService.instance.log('User completed KYC verification');
/// ```
class CrashlyticsService {
  CrashlyticsService._();
  static final CrashlyticsService instance = CrashlyticsService._();

  late final FirebaseCrashlytics _crashlytics;
  bool _initialized = false;

  /// Initialize Crashlytics and wire global error handlers.
  ///
  /// Call ONCE in `main()` after `Firebase.initializeApp()`.
  /// In debug mode, Crashlytics is disabled to avoid polluting production data.
  void init() {
    if (_initialized) return;
    _initialized = true;

    _crashlytics = FirebaseCrashlytics.instance;

    // Disable in debug mode — only report crashes in production/profile builds
    if (kDebugMode) {
      _crashlytics.setCrashlyticsCollectionEnabled(false);
      debugPrint('[Crashlytics] Disabled in debug mode');
      return;
    }

    _crashlytics.setCrashlyticsCollectionEnabled(true);

    // ── 1. Flutter Framework Errors ──────────────────────────────────────
    // Catches: RenderBox overflow, setState after dispose, assertion errors
    FlutterError.onError = (errorDetails) {
      _crashlytics.recordFlutterFatalError(errorDetails);
      debugPrint('[Crashlytics] Flutter error recorded: ${errorDetails.exception}');
    };

    // ── 2. Async/Zone Errors (outside Flutter framework) ─────────────────
    // Catches: Unhandled Future rejections, Isolate errors, platform channel
    PlatformDispatcher.instance.onError = (error, stack) {
      _crashlytics.recordError(error, stack, fatal: true);
      debugPrint('[Crashlytics] Platform error recorded: $error');
      return true; // Prevents app crash — error is reported, not rethrown
    };

    debugPrint('[Crashlytics] Initialized — production mode');
  }

  /// Record a non-fatal error with optional context.
  ///
  /// Use for caught exceptions that don't crash the app but indicate issues:
  /// - API parsing failures
  /// - GPS verification mismatches
  /// - Image upload retries
  ///
  /// [reason] adds context visible in the Firebase Console (e.g., "GPS_VERIFY_FAIL").
  Future<void> recordError(
    dynamic error,
    StackTrace? stackTrace, {
    String? reason,
    bool fatal = false,
  }) async {
    if (!_initialized || kDebugMode) return;

    await _crashlytics.recordError(
      error,
      stackTrace,
      reason: reason ?? 'Non-fatal error',
      fatal: fatal,
    );
  }

  /// Set user identity for crash grouping.
  ///
  /// Called after login — allows filtering crashes by role/user in Firebase Console.
  /// [userId] is the opaque UUID (never PII like email).
  Future<void> setUserContext({
    required String userId,
    String? role,
    String? locale,
  }) async {
    if (!_initialized || kDebugMode) return;

    await _crashlytics.setUserIdentifier(userId);
    if (role != null) {
      await _crashlytics.setCustomKey('user_role', role);
    }
    if (locale != null) {
      await _crashlytics.setCustomKey('locale', locale);
    }
  }

  /// Clear user context on logout.
  Future<void> clearUserContext() async {
    if (!_initialized || kDebugMode) return;
    await _crashlytics.setUserIdentifier('');
  }

  /// Log a breadcrumb message for debugging context.
  ///
  /// These appear in the "Logs" tab of a crash report — useful for
  /// understanding what the user did before the crash.
  Future<void> log(String message) async {
    if (!_initialized || kDebugMode) return;
    await _crashlytics.log(message);
  }

  /// Set a custom key-value pair for crash context.
  ///
  /// Use for screen name, connection quality, etc.
  Future<void> setCustomKey(String key, Object value) async {
    if (!_initialized || kDebugMode) return;
    await _crashlytics.setCustomKey(key, value);
  }
}
