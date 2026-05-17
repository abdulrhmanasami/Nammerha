// ============================================================================
// Nammerha — Performance Monitoring Service (GAP-M2 PLATINUM)
// ============================================================================
// Production app performance monitoring via Firebase Performance.
//
// Captures:
//   1. App startup time (automatic — cold start, warm start)
//   2. HTTP request metrics (latency, response size, status codes)
//   3. Custom screen traces (time spent on each screen)
//   4. Custom traces for critical operations (escrow release, GPS verify)
//
// Syrian Network Context:
//   Captures network quality alongside traces — essential for understanding
//   whether slow operations are caused by code or by 2G/3G connectivity.
//
// Nammerha Domain Law: Memory Sovereignty
//   Active traces are tracked in a Map and auto-stopped on dispose.
//   No dangling resources.
//
// Standard: Google Vitals, ISO/IEC 25010 Performance Efficiency
// ============================================================================

import 'package:firebase_performance/firebase_performance.dart';
import 'package:flutter/foundation.dart';

/// Singleton service for production performance monitoring.
///
/// Must be initialized in `main()` AFTER `Firebase.initializeApp()`.
///
/// Usage:
/// ```dart
/// // Screen trace (in initState / dispose):
/// PerformanceService.instance.startScreenTrace('DashboardScreen');
/// PerformanceService.instance.stopScreenTrace('DashboardScreen');
///
/// // Custom operation trace:
/// final trace = await PerformanceService.instance.startTrace('gps_verify');
/// trace?.putAttribute('project_id', projectId);
/// await performGpsVerification();
/// await PerformanceService.instance.stopTrace('gps_verify');
/// ```
class PerformanceService {
  PerformanceService._();
  static final PerformanceService instance = PerformanceService._();

  late final FirebasePerformance _performance;
  bool _initialized = false;

  /// Active traces indexed by name — ensures cleanup on dispose.
  final Map<String, Trace> _activeTraces = {};

  /// Initialize Firebase Performance.
  ///
  /// Call ONCE in `main()` after `Firebase.initializeApp()`.
  /// Disabled in debug mode to avoid performance overhead during development.
  void init() {
    if (_initialized) return;
    _initialized = true;

    _performance = FirebasePerformance.instance;

    if (kDebugMode) {
      _performance.setPerformanceCollectionEnabled(false);
      debugPrint('[Performance] Disabled in debug mode');
      return;
    }

    _performance.setPerformanceCollectionEnabled(true);
    debugPrint('[Performance] Initialized — production mode');
  }

  /// Start a custom trace for a named operation.
  ///
  /// Returns the [Trace] for adding attributes/metrics, or null if disabled.
  ///
  /// Common traces:
  ///   - `screen_<name>` — time spent on a screen
  ///   - `api_<endpoint>` — specific API call latency
  ///   - `gps_verify` — GPS verification pipeline
  ///   - `image_upload` — pre-signed URL + S3 upload
  ///   - `escrow_release` — financial escrow release flow
  Future<Trace?> startTrace(String name) async {
    if (!_initialized || kDebugMode) return null;

    // Sanitize name: Firebase allows [a-zA-Z0-9_] only, max 100 chars
    final safeName = name
        .replaceAll(RegExp(r'[^a-zA-Z0-9_]'), '_')
        .substring(0, name.length > 100 ? 100 : name.length);

    try {
      final trace = _performance.newTrace(safeName);
      await trace.start();
      _activeTraces[safeName] = trace;
      return trace;
    } catch (e) {
      debugPrint('[Performance] Failed to start trace "$safeName": $e');
      return null;
    }
  }

  /// Stop a named trace. No-op if trace doesn't exist or already stopped.
  Future<void> stopTrace(String name) async {
    if (!_initialized || kDebugMode) return;

    final safeName = name
        .replaceAll(RegExp(r'[^a-zA-Z0-9_]'), '_')
        .substring(0, name.length > 100 ? 100 : name.length);

    final trace = _activeTraces.remove(safeName);
    if (trace != null) {
      try {
        await trace.stop();
      } catch (e) {
        debugPrint('[Performance] Failed to stop trace "$safeName": $e');
      }
    }
  }

  /// Start a screen rendering trace.
  ///
  /// Call in `initState()` of StatefulWidgets.
  /// Call [stopScreenTrace] in `dispose()`.
  Future<void> startScreenTrace(String screenName) async {
    await startTrace('screen_$screenName');
  }

  /// Stop a screen rendering trace.
  ///
  /// Call in `dispose()` of StatefulWidgets.
  Future<void> stopScreenTrace(String screenName) async {
    await stopTrace('screen_$screenName');
  }

  /// Create an HTTP metric for network request monitoring.
  ///
  /// Firebase Performance automatically captures HTTP metrics for most
  /// HTTP clients, but this allows manual instrumentation for custom clients.
  ///
  /// Returns null in debug mode.
  Future<HttpMetric?> createHttpMetric(
    String url,
    HttpMethod method,
  ) async {
    if (!_initialized || kDebugMode) return null;

    try {
      final metric = _performance.newHttpMetric(url, method);
      await metric.start();
      return metric;
    } catch (e) {
      debugPrint('[Performance] Failed to create HTTP metric: $e');
      return null;
    }
  }

  /// Stop all active traces. Call on app termination or logout.
  Future<void> stopAllTraces() async {
    if (!_initialized || kDebugMode) return;

    for (final entry in _activeTraces.entries) {
      try {
        await entry.value.stop();
      } catch (e) {
        debugPrint('[Nammerha] services/performance_service: $e');
        // Ignore — trace may have already been stopped
      }
    }
    _activeTraces.clear();
  }
}
