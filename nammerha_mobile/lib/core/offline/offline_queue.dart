import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

import '../network/api_client.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// Offline Request Queue — Platinum Standard v2 (Nammerha Domain Law: Offline-First)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Architecture:
//   1. Intercepts failed POST/PATCH/PUT requests caused by network errors
//   2. Persists them to SharedPreferences as JSON (survives app restarts)
//   3. Automatically replays queued requests when connectivity is restored
//   4. Idempotency-Key ensures zero duplicate mutations on replay
//   5. Exponential backoff prevents server hammering on flaky 2G/3G
//   6. [PLATINUM v2] Startup replay: if queue non-empty AND online at launch,
//      processQueue() fires immediately — no more silent queue abandonment.
//   7. [PLATINUM v2] De-bounce: flappy connections debounce replay by 2s
//      to prevent rapid-fire storms on unstable 2G connections in Syria.
//   8. [PLATINUM v2] Per-item exponential backoff: 2^retryCount * 200ms
//      (capped at 30s) between retry attempts for individual failed items.
//
// Critical Contract:
//   - Only IDEMPOTENT mutations are queued (identified by Idempotency-Key header)
//   - GET requests are never queued (they should use cached data)
//   - Non-idempotent mutations fail immediately (user must retry manually)
//
// This is PURPOSE-BUILT for Syria's restricted network conditions:
//   - Average 2G latency: 500-2000ms with frequent drops
//   - Fatora webhook race: queued payments replay after device reconnects
//   - GPS proof uploads: large payloads that fail mid-transfer
// ═══════════════════════════════════════════════════════════════════════════════

/// A single queued API request waiting for network restoration.
class QueuedRequest {
  final String id;
  final String endpoint;
  final String method;
  final Map<String, dynamic>? body;
  final Map<String, String>? extraHeaders;
  final bool idempotent;
  final DateTime enqueuedAt;
  int retryCount;

  QueuedRequest({
    required this.id,
    required this.endpoint,
    required this.method,
    this.body,
    this.extraHeaders,
    this.idempotent = true,
    required this.enqueuedAt,
    this.retryCount = 0,
  });

  factory QueuedRequest.fromJson(Map<String, dynamic> json) {
    return QueuedRequest(
      id: json['id'] as String,
      endpoint: json['endpoint'] as String,
      method: json['method'] as String,
      body: json['body'] as Map<String, dynamic>?,
      extraHeaders: (json['extraHeaders'] as Map<String, dynamic>?)
          ?.map((k, v) => MapEntry(k, v as String)),
      idempotent: json['idempotent'] as bool? ?? true,
      enqueuedAt: DateTime.parse(json['enqueuedAt'] as String),
      retryCount: json['retryCount'] as int? ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'endpoint': endpoint,
        'method': method,
        'body': body,
        'extraHeaders': extraHeaders,
        'idempotent': idempotent,
        'enqueuedAt': enqueuedAt.toIso8601String(),
        'retryCount': retryCount,
      };

  /// Maximum age before a queued request is discarded (24 hours).
  /// Stale mutations are dangerous — escrow state may have changed.
  bool get isExpired =>
      DateTime.now().difference(enqueuedAt) > const Duration(hours: 24);

  /// Maximum retry attempts before permanent discard.
  static const int maxRetries = 5;
  bool get isExhausted => retryCount >= maxRetries;
}

/// Singleton offline queue engine.
///
/// Usage:
///   // In api_client.dart catch block:
///   OfflineQueue.instance.enqueue(QueuedRequest(...));
///
///   // In main.dart:
///   await OfflineQueue.instance.init();
class OfflineQueue {
  static OfflineQueue? _instance;
  static OfflineQueue get instance {
    _instance ??= OfflineQueue._();
    return _instance!;
  }

  OfflineQueue._();

  static const String _storageKey = 'nammerha_offline_queue';
  static const int _maxQueueSize = 50;

  // ─── De-bounce timer for flappy connections ─────────────────────────────
  // Purpose: Syria's 2G/3G connections frequently drop and restore within
  // milliseconds. Without de-bouncing, a "offline → online" flap triggers
  // multiple rapid `processQueue()` calls simultaneously.
  // Solution: Wait 2 seconds after a connectivity restore before processing.
  static const Duration _debounceDuration = Duration(seconds: 2);
  Timer? _debounceTimer;

  final List<QueuedRequest> _queue = [];
  StreamSubscription<List<ConnectivityResult>>? _connectivitySub;
  bool _isProcessing = false;
  bool _isInitialized = false;

  /// Callback invoked when a queued request is successfully replayed.
  void Function(QueuedRequest request)? onRequestReplayed;

  /// Callback invoked when a queued request permanently fails.
  void Function(QueuedRequest request, String error)? onRequestFailed;

  /// Callback for UI to show queue status changes.
  ValueNotifier<int> pendingCount = ValueNotifier<int>(0);

  // ─── Initialization ──────────────────────────────────────────────────────

  /// Initialize the queue: load persisted requests + start connectivity listener.
  ///
  /// PLATINUM v2 FIX (Startup Race Condition):
  /// After loading from disk, check CURRENT connectivity. If already online
  /// AND queue is non-empty, trigger processQueue() immediately.
  /// Previously, the queue was only replayed on connectivity CHANGES —
  /// meaning persisted requests from a previous session were silently
  /// abandoned until the user lost and regained internet.
  Future<void> init() async {
    if (_isInitialized) return;
    _isInitialized = true;

    await _loadFromDisk();
    _startConnectivityMonitor();

    // PLATINUM v2: If app launched online with a non-empty queue,
    // replay immediately without waiting for a connectivity change event.
    if (_queue.isNotEmpty) {
      final connectivity = Connectivity();
      final currentResults = await connectivity.checkConnectivity();
      final isOnline = currentResults.any((r) => r != ConnectivityResult.none);

      if (isOnline) {
        debugPrint(
          '[OfflineQueue] STARTUP REPLAY — ${_queue.length} persisted requests found online',
        );
        // Small delay to let the rest of `main()` complete first
        await Future<void>.delayed(const Duration(seconds: 3));
        unawaited(processQueue());
      }
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /// Number of requests waiting in the queue.
  int get length => _queue.length;

  /// Whether the queue has pending requests.
  bool get hasPending => _queue.isNotEmpty;

  /// Enqueue a failed request for later replay.
  ///
  /// Only idempotent mutations are accepted. Non-idempotent mutations
  /// MUST fail immediately to prevent duplicate financial state changes.
  Future<void> enqueue(QueuedRequest request) async {
    if (!request.idempotent) {
      debugPrint(
        '[OfflineQueue] REJECTED non-idempotent request: ${request.endpoint}',
      );
      return;
    }

    if (_queue.length >= _maxQueueSize) {
      // Evict oldest expired request, or reject if full
      _queue.removeWhere((r) => r.isExpired);
      if (_queue.length >= _maxQueueSize) {
        debugPrint('[OfflineQueue] FULL — cannot enqueue: ${request.endpoint}');
        return;
      }
    }

    // De-duplicate: reject if same Idempotency-Key already in queue
    final alreadyQueued = _queue.any((r) => r.id == request.id);
    if (alreadyQueued) {
      debugPrint('[OfflineQueue] DUPLICATE rejected: ${request.id}');
      return;
    }

    _queue.add(request);
    pendingCount.value = _queue.length;
    await _saveToDisk();

    debugPrint(
      '[OfflineQueue] ENQUEUED: ${request.method} ${request.endpoint} '
      '(${_queue.length} pending)',
    );
  }

  /// Process all queued requests (called on connectivity restoration).
  ///
  /// PLATINUM v2: Per-item exponential backoff on failure.
  /// Failed items sleep for `min(2^retryCount * 200ms, 30s)` before
  /// the queue continues — preventing server flood on Syria's flaky 2G.
  Future<void> processQueue() async {
    if (_isProcessing || _queue.isEmpty) return;
    _isProcessing = true;

    debugPrint('[OfflineQueue] PROCESSING ${_queue.length} queued requests...');

    // Copy queue to avoid modification during iteration
    final snapshot = List<QueuedRequest>.from(_queue);

    for (final request in snapshot) {
      // Skip expired or exhausted requests
      if (request.isExpired || request.isExhausted) {
        _queue.remove(request);
        onRequestFailed?.call(
          request,
          request.isExpired
              ? 'انتهت صلاحية الطلب (24 ساعة)'
              : 'تم استنفاد محاولات الإعادة',
        );
        continue;
      }

      try {
        if (request.extraHeaders?['X-GraphQL-Mutation'] == 'true') {
          await NammerhaApiClient.instance.graphql(
            query: request.body?['query'] as String,
            variables: request.body?['variables'] as Map<String, dynamic>?,
            operationName: request.body?['operationName'] as String?,
            idempotent: request.idempotent,
          );
        } else {
          await NammerhaApiClient.instance.request(
            request.endpoint,
            method: request.method,
            body: request.body,
            idempotent: request.idempotent,
            extraHeaders: request.extraHeaders,
          );
        }

        // ── SUCCESS ───────────────────────────────────────────────────────
        _queue.remove(request);
        onRequestReplayed?.call(request);

        debugPrint(
          '[OfflineQueue] ✅ REPLAYED: ${request.method} ${request.endpoint}',
        );

        // Brief inter-request pause to avoid server flood
        await Future<void>.delayed(const Duration(milliseconds: 500));
      } catch (e) {
        // ── FAILURE ───────────────────────────────────────────────────────
        request.retryCount++;
        debugPrint(
          '[OfflineQueue] ❌ RETRY FAILED (${request.retryCount}/${QueuedRequest.maxRetries}): '
          '${request.endpoint} — $e',
        );

        if (request.isExhausted) {
          _queue.remove(request);
          onRequestFailed?.call(request, e.toString());
        } else {
          // PLATINUM v2 — Exponential backoff per failed item.
          // Formula: min(2^retryCount × 200ms, 30s)
          // retryCount 1 →  400ms | 2 →  800ms | 3 → 1.6s | 4 → 3.2s | 5 → 6.4s
          final backoff = _computeBackoff(request.retryCount);
          debugPrint(
            '[OfflineQueue] BACKOFF ${backoff.inMilliseconds}ms before next item',
          );
          await Future<void>.delayed(backoff);
        }
      }
    }

    pendingCount.value = _queue.length;
    await _saveToDisk();
    _isProcessing = false;

    debugPrint('[OfflineQueue] COMPLETE — ${_queue.length} remaining');
  }

  /// Clear all queued requests (e.g., on logout).
  Future<void> clear() async {
    _queue.clear();
    pendingCount.value = 0;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_storageKey);
  }

  /// Dispose connectivity listener and de-bounce timer.
  void dispose() {
    _debounceTimer?.cancel();
    _connectivitySub?.cancel();
  }

  // ─── Private Implementation ──────────────────────────────────────────────

  /// Starts the connectivity monitor.
  ///
  /// PLATINUM v2 — De-bounce Pattern:
  /// On connectivity restoration, we do NOT immediately fire `processQueue()`.
  /// Instead, we start a 2-second de-bounce timer. If another connectivity
  /// change arrives within 2 seconds (flappy connection), the timer resets.
  /// Only after 2 consecutive seconds of "online" status does replay begin.
  ///
  /// This prevents request storms on Syrian 2G where the connection may
  /// toggle offline → online → offline → online many times per minute.
  void _startConnectivityMonitor() {
    _connectivitySub = Connectivity()
        .onConnectivityChanged
        .listen((List<ConnectivityResult> results) {
      final isOnline = results.any((r) => r != ConnectivityResult.none);

      if (isOnline && _queue.isNotEmpty) {
        // Cancel any existing de-bounce timer and start fresh
        _debounceTimer?.cancel();
        _debounceTimer = Timer(_debounceDuration, () {
          debugPrint(
            '[OfflineQueue] CONNECTIVITY STABLE — processing ${_queue.length} queued requests...',
          );
          unawaited(processQueue());
        });
      } else if (!isOnline) {
        // If we went offline, cancel any pending de-bounce
        _debounceTimer?.cancel();
        debugPrint('[OfflineQueue] CONNECTIVITY LOST — replay paused');
      }
    });
  }

  Future<void> _loadFromDisk() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_storageKey);
      if (raw == null) return;

      final List<dynamic> list = jsonDecode(raw) as List<dynamic>;
      _queue.clear();
      for (final item in list) {
        final request =
            QueuedRequest.fromJson(item as Map<String, dynamic>);
        if (!request.isExpired) {
          _queue.add(request);
        }
      }
      pendingCount.value = _queue.length;

      if (_queue.isNotEmpty) {
        debugPrint(
          '[OfflineQueue] LOADED ${_queue.length} persisted requests from disk',
        );
      }
    } catch (e) {
      debugPrint('[OfflineQueue] Failed to load from disk: $e');
    }
  }

  Future<void> _saveToDisk() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final json = jsonEncode(_queue.map((r) => r.toJson()).toList());
      await prefs.setString(_storageKey, json);
    } catch (e) {
      debugPrint('[OfflineQueue] Failed to persist to disk: $e');
    }
  }

  /// Compute exponential backoff duration for a given retry count.
  /// Formula: min(2^retryCount × 200ms, 30s)
  Duration _computeBackoff(int retryCount) {
    final ms = (math.pow(2, retryCount) * 200).toInt();
    return Duration(milliseconds: ms.clamp(200, 30000));
  }
}

/// Marks a Future as intentionally unawaited (suppresses Dart linter warning).
/// Used when we fire-and-forget processQueue() from synchronous callbacks.
void unawaited(Future<void> future) {
  // intentionally unawaited
}
