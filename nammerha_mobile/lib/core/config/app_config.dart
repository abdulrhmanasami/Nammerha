import 'dart:io';
import 'package:flutter/foundation.dart';

/// Nammerha App Configuration
/// Centralized environment and API configuration.
///
/// P1-1 FIX (C-2 Remediation): Added GraphQL and WebSocket endpoints
/// for hybrid transport layer. REST remains primary; GraphQL used for
/// financial mutations, aggregated queries, and real-time subscriptions.
class AppConfig {
  AppConfig._();

  // ─── Environment Detection ──────────────────────────────────────────────
  /// True when running against local dev backend (emulator/device)
  /// P1-2 FIX: Fallback to kDebugMode so standard IDE runs don't silently connect to production.
  static const bool isDev = bool.fromEnvironment(
    'DEV_MODE',
    defaultValue: kDebugMode,
  );

  // ─── REST API ───────────────────────────────────────────────────────────
  /// Production API base URL
  static const String _prodApiBase = 'https://nammerha.com/api';

  /// Development API base URL (10.0.2.2 = host localhost from Android emulator)
  static String get _devApiBase {
    if (Platform.isAndroid) return 'http://10.0.2.2:3001/api';
    if (Platform.isIOS) return 'http://localhost:3001/api';
    return 'http://localhost:3001/api';
  }

  /// Active API base URL (REST)
  static String get apiBaseUrl => isDev ? _devApiBase : _prodApiBase;

  // ─── GraphQL ────────────────────────────────────────────────────────────
  /// GraphQL HTTP endpoint (POST queries/mutations)
  static String get graphqlEndpoint {
    if (isDev) {
      if (Platform.isAndroid) return 'http://10.0.2.2:3001/graphql';
      return 'http://localhost:3001/graphql';
    }
    return 'https://nammerha.com/graphql';
  }

  /// GraphQL WebSocket endpoint (subscriptions)
  static String get wsEndpoint {
    if (isDev) {
      if (Platform.isAndroid) return 'ws://10.0.2.2:3001/graphql';
      return 'ws://localhost:3001/graphql';
    }
    return 'wss://nammerha.com/graphql';
  }

  // ─── App Identity ──────────────────────────────────────────────────────
  /// App version (must match MIN_MOBILE_APP_VERSION on backend)
  static const String appVersion = '1.0.0';

  /// API contract version (must match CURRENT_API_VERSION on backend)
  static const String apiVersion = '2026.1';

  /// Platform identifier sent to backend
  static String get platform => Platform.isIOS ? 'ios' : 'android';

  // ─── Social OAuth ──────────────────────────────────────────────────────
  /// Google Sign-In server client ID (WEB client ID).
  /// Required for requesting an ID token that the backend can verify.
  /// Set via compile-time: --dart-define=GOOGLE_SERVER_CLIENT_ID=xxx
  static const String googleServerClientId = String.fromEnvironment(
    'GOOGLE_SERVER_CLIENT_ID',
    defaultValue: '',
  );

  // ─── Network Policy ────────────────────────────────────────────────────
  /// Request timeout (30s accounts for Syrian 2G/3G latency)
  static const Duration requestTimeout = Duration(seconds: 30);

  /// Max retry attempts for idempotent requests
  static const int maxRetries = 2;

  /// Minimum transition duration (skeleton anti-flicker)
  static const Duration minTransitionDuration = Duration(milliseconds: 300);

  // ─── Map Tile Engine ─────────────────────────────────────────────────────
  /// Primary raster tile URL — points to the Nammerha production tile server.
  /// Dev: OpenStreetMap (no API key, works offline-adjacent for testing).
  /// Production: nammerha.com MapLibre-compatible tile CDN.
  static String get mapTileUrl {
    if (isDev) {
      return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    }
    // Production: swap with self-hosted MapLibre / Valhalla tile CDN
    return 'https://nammerha.com/tiles/{z}/{x}/{y}.png';
  }

  /// Fallback tile URL for degraded network conditions (Syria 2G/3G).
  /// Uses a lighter CDN with smaller tile sizes for offline-degraded UX.
  static const String mapFallbackTileUrl =
      'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png';

  /// Syria center coordinates — default camera anchor for the map.
  static const double syriaLat = 34.8021;
  static const double syriaLng = 38.9968;
  static const double syriaDefaultZoom = 6.0;
}
