import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../config/app_config.dart';

/// Nammerha Subscription Client — graphql-ws Protocol over WebSocket
///
/// Implements the `graphql-ws` protocol (NOT the legacy `subscriptions-transport-ws`).
/// Protocol spec: https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md
///
/// Message types:
///   Client → Server: connection_init, subscribe, complete, ping
///   Server → Client: connection_ack, next, error, complete, pong
///
/// Architecture:
///   - Singleton per app lifecycle (created once, reconnects automatically)
///   - JWT auth via `connectionParams.token`
///   - Exponential backoff reconnection (1s → 2s → 4s → … → 16s cap)
///   - Each subscription identified by unique monotonic ID
///   - Stream-based API (Dart-native `Stream<Map<String, dynamic>>`)
///   - Memory-safe: all controllers tracked and cleaned on dispose
///
/// Syrian Network Awareness:
///   - No aggressive keepalive (conserves battery/data on 2G/3G)
///   - Graceful degradation: app works without WS (REST fallback)
///   - Reconnect only when app is in foreground
class NammerhaSubscriptionClient {
  NammerhaSubscriptionClient._();

  static final NammerhaSubscriptionClient instance =
      NammerhaSubscriptionClient._();

  // ─── Connection State ───────────────────────────────────────────────────
  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _channelSubscription;
  bool _isConnected = false;
  bool _isConnecting = false;
  bool _isDisposed = false;
  int _reconnectAttempts = 0;
  Timer? _reconnectTimer;

  /// JWT token for WebSocket authentication.
  /// Must be set before calling [connect]. Updated on token refresh.
  String? _authToken;

  /// Maximum reconnection delay (seconds). Exponential backoff caps here.
  static const int _maxReconnectDelaySec = 16;

  /// Minimum reconnection delay (seconds).
  static const int _minReconnectDelaySec = 1;

  // ─── Subscription Registry ──────────────────────────────────────────────
  int _nextSubscriptionId = 1;

  /// Active subscriptions: id → StreamController
  final Map<String, StreamController<Map<String, dynamic>>> _subscriptions = {};

  /// Subscription metadata: id → query (for reconnect replay)
  final Map<String, _SubscriptionMeta> _subscriptionMeta = {};

  /// Connection state stream for UI indicators
  final StreamController<bool> _connectionStateController =
      StreamController<bool>.broadcast();

  /// Stream that emits `true` when connected, `false` when disconnected.
  Stream<bool> get connectionState => _connectionStateController.stream;

  /// Whether the WebSocket is currently connected and authenticated.
  bool get isConnected => _isConnected;

  // ─── Public API ─────────────────────────────────────────────────────────

  /// Set the JWT token for WebSocket authentication.
  /// Call this after user login and on token refresh.
  void setAuthToken(String token) {
    _authToken = token;
  }

  /// Connect to the WebSocket server.
  ///
  /// Sends `connection_init` with `{ token }` in connectionParams.
  /// Waits for `connection_ack` before resolving.
  /// Replays all active subscriptions on reconnect.
  Future<void> connect() async {
    if (_isConnected || _isConnecting || _isDisposed) return;
    if (_authToken == null || _authToken!.isEmpty) {
      debugPrint('[NammerhaWS] Cannot connect: no auth token');
      return;
    }

    _isConnecting = true;

    try {
      final wsUrl = Uri.parse(AppConfig.wsEndpoint);

      _channel = WebSocketChannel.connect(
        wsUrl,
        protocols: ['graphql-transport-ws'], // graphql-ws protocol identifier
      );

      // Wait for channel to be ready
      await _channel!.ready;

      // Listen for messages
      _channelSubscription = _channel!.stream.listen(
        _onMessage,
        onError: _onError,
        onDone: _onDone,
        cancelOnError: false,
      );

      // Send connection_init
      _send({
        'type': 'connection_init',
        'payload': {
          'token': _authToken,
        },
      });

      // Wait for connection_ack (with timeout)
      final ackCompleter = Completer<void>();
      Timer? ackTimeout;

      void ackHandler(Map<String, dynamic> message) {
        if (message['type'] == 'connection_ack' && !ackCompleter.isCompleted) {
          ackCompleter.complete();
        }
      }

      _pendingAckHandler = ackHandler;
      ackTimeout = Timer(const Duration(seconds: 10), () {
        if (!ackCompleter.isCompleted) {
          ackCompleter.completeError(
            TimeoutException('WebSocket connection_ack timeout'),
          );
        }
      });

      await ackCompleter.future;
      ackTimeout.cancel();
      _pendingAckHandler = null;

      _isConnected = true;
      _isConnecting = false;
      _reconnectAttempts = 0;
      _connectionStateController.add(true);

      debugPrint('[NammerhaWS] ✅ Connected to ${AppConfig.wsEndpoint}');

      // Replay active subscriptions on reconnect
      _replaySubscriptions();
    } catch (e) {
      _isConnecting = false;
      debugPrint('[NammerhaWS] ❌ Connection failed: $e');
      _scheduleReconnect();
    }
  }

  /// Subscribe to a GraphQL subscription.
  ///
  /// Returns a `Stream<Map<String, dynamic>>` that emits the `data` payload
  /// for each event. The stream is automatically replayed on reconnect.
  ///
  /// Example:
  /// ```dart
  /// final stream = client.subscribe(
  ///   query: SubscriptionQueries.notificationReceived,
  ///   operationName: 'OnNotificationReceived',
  /// );
  /// stream.listen((data) {
  ///   final notification = data['notificationReceived'];
  ///   // Handle notification
  /// });
  /// ```
  Stream<Map<String, dynamic>> subscribe({
    required String query,
    Map<String, dynamic>? variables,
    String? operationName,
  }) {
    final id = (_nextSubscriptionId++).toString();
    final controller = StreamController<Map<String, dynamic>>.broadcast(
      onCancel: () => _unsubscribe(id),
    );

    _subscriptions[id] = controller;
    _subscriptionMeta[id] = _SubscriptionMeta(
      query: query,
      variables: variables,
      operationName: operationName,
    );

    // Send subscribe message if connected
    if (_isConnected) {
      _sendSubscribe(id);
    }

    return controller.stream;
  }

  /// Disconnect from the WebSocket server.
  /// Cancels all subscriptions and stops reconnection.
  void disconnect() {
    _reconnectTimer?.cancel();
    _reconnectTimer = null;

    // Send complete for all active subscriptions
    for (final id in _subscriptions.keys.toList()) {
      _unsubscribe(id);
    }

    _channelSubscription?.cancel();
    _channelSubscription = null;
    _channel?.sink.close();
    _channel = null;

    _isConnected = false;
    _isConnecting = false;
    _connectionStateController.add(false);

    debugPrint('[NammerhaWS] Disconnected');
  }

  /// Permanently dispose the client. Cannot be reconnected after this.
  void dispose() {
    _isDisposed = true;
    disconnect();

    // Close all stream controllers
    for (final controller in _subscriptions.values) {
      controller.close();
    }
    _subscriptions.clear();
    _subscriptionMeta.clear();
    _connectionStateController.close();
  }

  // ─── Protocol Implementation ────────────────────────────────────────────

  void Function(Map<String, dynamic>)? _pendingAckHandler;

  void _send(Map<String, dynamic> message) {
    if (_channel == null) return;
    try {
      _channel!.sink.add(json.encode(message));
    } catch (e) {
      debugPrint('[NammerhaWS] Send error: $e');
    }
  }

  void _sendSubscribe(String id) {
    final meta = _subscriptionMeta[id];
    if (meta == null) return;

    _send({
      'id': id,
      'type': 'subscribe',
      'payload': {
        'query': meta.query,
        if (meta.variables != null) 'variables': meta.variables,
        if (meta.operationName != null) 'operationName': meta.operationName,
      },
    });
  }

  void _unsubscribe(String id) {
    // Send complete to server
    if (_isConnected) {
      _send({'id': id, 'type': 'complete'});
    }

    // Clean up local state
    _subscriptions[id]?.close();
    _subscriptions.remove(id);
    _subscriptionMeta.remove(id);
  }

  void _onMessage(dynamic rawMessage) {
    if (rawMessage is! String) return;

    Map<String, dynamic> message;
    try {
      message = json.decode(rawMessage) as Map<String, dynamic>;
    } catch (e) {
      debugPrint('[NammerhaWS] Invalid JSON: $rawMessage');
      return;
    }

    final type = message['type'] as String?;

    switch (type) {
      case 'connection_ack':
        _pendingAckHandler?.call(message);
        break;

      case 'next':
        // Data event for a subscription
        final id = message['id'] as String?;
        final payload = message['payload'] as Map<String, dynamic>?;
        final data = payload?['data'] as Map<String, dynamic>?;

        if (id != null && data != null && _subscriptions.containsKey(id)) {
          _subscriptions[id]!.add(data);
        }
        break;

      case 'error':
        // Error event for a subscription
        final id = message['id'] as String?;
        final payload = message['payload'] as List<dynamic>?;

        if (id != null && _subscriptions.containsKey(id)) {
          final errorMsg = payload?.isNotEmpty == true
              ? (payload!.first as Map<String, dynamic>)['message'] ?? 'Unknown error'
              : 'Subscription error';
          _subscriptions[id]!.addError(Exception(errorMsg));
        }
        break;

      case 'complete':
        // Server completed the subscription
        final id = message['id'] as String?;
        if (id != null && _subscriptions.containsKey(id)) {
          _subscriptions[id]!.close();
          _subscriptions.remove(id);
          _subscriptionMeta.remove(id);
        }
        break;

      case 'ping':
        // Respond with pong (graphql-ws keepalive)
        _send({'type': 'pong'});
        break;

      case 'pong':
        // Server responded to our ping — connection alive
        break;

      default:
        debugPrint('[NammerhaWS] Unknown message type: $type');
    }
  }

  void _onError(dynamic error) {
    debugPrint('[NammerhaWS] Stream error: $error');
    _handleDisconnection();
  }

  void _onDone() {
    debugPrint('[NammerhaWS] Stream closed');
    _handleDisconnection();
  }

  void _handleDisconnection() {
    _isConnected = false;
    _isConnecting = false;
    _channelSubscription?.cancel();
    _channelSubscription = null;
    _channel = null;
    _connectionStateController.add(false);

    if (!_isDisposed) {
      _scheduleReconnect();
    }
  }

  // ─── Reconnection ──────────────────────────────────────────────────────

  void _scheduleReconnect() {
    if (_isDisposed || _reconnectTimer != null) return;

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s (cap)
    final delaySec = min(
      _minReconnectDelaySec * pow(2, _reconnectAttempts).toInt(),
      _maxReconnectDelaySec,
    );
    _reconnectAttempts++;

    debugPrint('[NammerhaWS] Reconnecting in ${delaySec}s (attempt $_reconnectAttempts)');

    _reconnectTimer = Timer(Duration(seconds: delaySec), () {
      _reconnectTimer = null;
      connect();
    });
  }

  /// Replay all active subscriptions after reconnect.
  void _replaySubscriptions() {
    for (final id in _subscriptionMeta.keys.toList()) {
      if (_subscriptions.containsKey(id)) {
        _sendSubscribe(id);
      }
    }

    if (_subscriptionMeta.isNotEmpty) {
      debugPrint('[NammerhaWS] Replayed ${_subscriptionMeta.length} subscription(s)');
    }
  }
}

// ─── Internal Data Classes ────────────────────────────────────────────────────

class _SubscriptionMeta {
  final String query;
  final Map<String, dynamic>? variables;
  final String? operationName;

  const _SubscriptionMeta({
    required this.query,
    this.variables,
    this.operationName,
  });
}
