// ═══════════════════════════════════════════════════════════════════════════
// Nammerha Push Notification Service — Platinum Standard FCM Integration
// ═══════════════════════════════════════════════════════════════════════════
//
// ARCHITECTURE:
//   - Firebase Cloud Messaging (FCM) for transport
//   - flutter_local_notifications for foreground display
//   - GraphQL registerPushToken mutation for backend registry
//   - Token lifecycle: register on login, refresh on rotate, unregister on logout
//   - Deep link navigation from notification tap
//   - Background message handler (isolate-safe, top-level function)
//
// BACKEND CONTRACT:
//   - Table: push_tokens (user_id, device_token, platform, device_id, is_active)
//   - GraphQL: mutation registerPushToken(deviceToken, platform, deviceId)
//   - FCM HTTP v1 API via push-notification.service.ts
//
// DEPENDS: firebase_core, firebase_messaging, flutter_local_notifications
// ═══════════════════════════════════════════════════════════════════════════

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../network/api_client.dart';

// ─── Background Message Handler ────────────────────────────────────────────
// MUST be a top-level function (not a class method) for isolate safety.
// @pragma('vm:entry-point') ensures tree-shaking doesn't remove it.
// ────────────────────────────────────────────────────────────────────────────

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Ensure Firebase is initialized in the background isolate
  await Firebase.initializeApp();

  // Background messages are automatically displayed as system notifications
  // by FCM. No manual display needed here.
  // If custom processing is needed (e.g., offline caching), add it here.
  debugPrint('[Nammerha Push] Background message: ${message.messageId}');
}

// ─── Notification Channel (Android) ────────────────────────────────────────
// Android 8.0+ requires a notification channel for foreground notifications.
// ────────────────────────────────────────────────────────────────────────────

const AndroidNotificationChannel _nammerhaChannel = AndroidNotificationChannel(
  'nammerha_high_importance', // channel ID
  'إشعارات نعمّرها', // channel name (Arabic)
  description: 'إشعارات المنصة — تبرعات، ضمان، تحديثات المشاريع',
  importance: Importance.high,
  enableVibration: true,
  playSound: true,
);

// ═══════════════════════════════════════════════════════════════════════════
// Push Notification Service — Singleton
// ═══════════════════════════════════════════════════════════════════════════

class PushNotificationService {
  PushNotificationService._();

  static final PushNotificationService instance = PushNotificationService._();

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  StreamSubscription<RemoteMessage>? _foregroundSubscription;
  StreamSubscription<String>? _tokenRefreshSubscription;

  /// Callback invoked when user taps a notification.
  /// Passes the notification data payload for deep link routing.
  void Function(Map<String, dynamic> data)? onNotificationTapped;

  /// Callback invoked when a foreground push arrives (for BLoC injection).
  void Function(RemoteMessage message)? onForegroundMessage;

  bool _initialized = false;

  // ─── Initialization ───────────────────────────────────────────────────

  /// Initialize FCM and local notifications.
  /// Call AFTER Firebase.initializeApp() in main().
  Future<void> init() async {
    if (_initialized) return;

    // 1. Register background handler
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    // 2. Create Android notification channel
    await _createAndroidChannel();

    // 3. Initialize flutter_local_notifications
    await _initLocalNotifications();

    // 4. Listen for foreground messages
    _foregroundSubscription = FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

    // 5. Handle notification taps (app opened from terminated or background)
    FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);

    // Check if the app was launched from a notification
    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) {
      _handleNotificationTap(initialMessage);
    }

    _initialized = true;
    debugPrint('[Nammerha Push] Service initialized');
  }

  // ─── Permission Request ──────────────────────────────────────────────

  /// Request notification permission.
  /// Returns true if the user granted permission.
  Future<bool> requestPermission() async {
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
      announcement: false,
      carPlay: false,
      criticalAlert: false,
    );

    final granted = settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;

    debugPrint('[Nammerha Push] Permission: ${settings.authorizationStatus}');
    return granted;
  }

  // ─── Token Management ────────────────────────────────────────────────

  /// Get the current FCM token and register it with the backend.
  /// Call after successful authentication.
  Future<void> registerToken() async {
    try {
      final token = await _messaging.getToken();
      if (token == null) {
        debugPrint('[Nammerha Push] FCM token is null — skipping registration');
        return;
      }

      await _registerTokenWithBackend(token);

      // Listen for token refresh events
      _tokenRefreshSubscription?.cancel();
      _tokenRefreshSubscription = _messaging.onTokenRefresh.listen((newToken) {
        _registerTokenWithBackend(newToken);
      });

      debugPrint('[Nammerha Push] Token registered successfully');
    } catch (e) {
      // Non-fatal: push is a best-effort feature
      debugPrint('[Nammerha Push] Token registration failed: $e');
    }
  }

  /// Unregister the current FCM token.
  /// Call on logout to prevent stale token delivery.
  Future<void> unregisterToken() async {
    try {
      _tokenRefreshSubscription?.cancel();
      _tokenRefreshSubscription = null;

      // Delete the FCM token on Firebase side
      await _messaging.deleteToken();
      debugPrint('[Nammerha Push] Token unregistered');
    } catch (e) {
      debugPrint('[Nammerha Push] Token unregister failed: $e');
    }
  }

  // ─── Internal: Backend Token Registration ────────────────────────────

  Future<void> _registerTokenWithBackend(String token) async {
    final api = NammerhaApiClient.instance;
    if (!api.isAuthenticated) return;

    final platform = Platform.isIOS ? 'ios' : 'android';

    // Use REST endpoint (simpler than GraphQL for this single mutation)
    try {
      await api.request(
        '/notifications/push-token',
        method: 'POST',
        body: {
          'device_token': token,
          'platform': platform,
        },
      );
    } catch (_) {
      // Fallback: try GraphQL mutation if REST endpoint not available
      try {
        await api.graphql(
          query: '''
            mutation RegisterPushToken(\$deviceToken: String!, \$platform: String!) {
              registerPushToken(deviceToken: \$deviceToken, platform: \$platform)
            }
          ''',
          variables: {
            'deviceToken': token,
            'platform': platform,
          },
          operationName: 'RegisterPushToken',
        );
      } catch (e) {
        debugPrint('[Nammerha Push] Backend registration failed: $e');
      }
    }
  }

  // ─── Internal: Android Channel ──────────────────────────────────────

  Future<void> _createAndroidChannel() async {
    if (!Platform.isAndroid) return;

    final androidPlugin =
        _localNotifications.resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();

    await androidPlugin?.createNotificationChannel(_nammerhaChannel);
  }

  // ─── Internal: Local Notifications Init ─────────────────────────────

  Future<void> _initLocalNotifications() async {
    const androidSettings = AndroidInitializationSettings('@drawable/ic_notification');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: false, // We request via FirebaseMessaging
      requestBadgePermission: false,
      requestSoundPermission: false,
    );

    const settings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _localNotifications.initialize(
      settings: settings,
      onDidReceiveNotificationResponse: (NotificationResponse response) {
        // Handle notification tap from local notification
        if (response.payload != null) {
          try {
            final data = jsonDecode(response.payload!) as Map<String, dynamic>;
            onNotificationTapped?.call(data);
          } catch (_) {
            // Payload parse failed — ignore
          }
        }
      },
    );
  }

  // ─── Internal: Foreground Message Handler ────────────────────────────

  void _handleForegroundMessage(RemoteMessage message) {
    debugPrint('[Nammerha Push] Foreground: ${message.notification?.title}');

    // Notify the BLoC layer
    onForegroundMessage?.call(message);

    // Display local notification (FCM doesn't auto-display in foreground)
    final notification = message.notification;
    if (notification == null) return;

    final android = message.notification?.android;

    _localNotifications.show(
      id: message.hashCode,
      title: notification.title ?? 'نعمّرها',
      body: notification.body ?? '',
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _nammerhaChannel.id,
          _nammerhaChannel.name,
          channelDescription: _nammerhaChannel.description,
          importance: Importance.high,
          priority: Priority.high,
          icon: android?.smallIcon ?? '@drawable/ic_notification',
          color: const Color(0xFF0D47A1), // Trust Blue
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: jsonEncode(message.data),
    );
  }

  // ─── Internal: Notification Tap Handler ──────────────────────────────

  void _handleNotificationTap(RemoteMessage message) {
    debugPrint('[Nammerha Push] Tap: ${message.data}');
    onNotificationTapped?.call(message.data);
  }

  // ─── Dispose ─────────────────────────────────────────────────────────

  /// Clean up subscriptions. Call only if the service is being torn down.
  void dispose() {
    _foregroundSubscription?.cancel();
    _foregroundSubscription = null;
    _tokenRefreshSubscription?.cancel();
    _tokenRefreshSubscription = null;
    _initialized = false;
  }
}
