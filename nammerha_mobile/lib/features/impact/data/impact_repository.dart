import 'package:flutter/foundation.dart';

import '../../../core/network/api_client.dart';
import '../../../core/offline/offline_queue.dart';
import '../models/impact_message_model.dart';

class ImpactRepository {
  final NammerhaApiClient _api = NammerhaApiClient.instance;

  Future<List<ImpactMessage>> fetchMessages({
    int limit = 50,
    int offset = 0,
    bool unreadOnly = false,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/api/impact/messages?limit=$limit&offset=$offset&unread_only=$unreadOnly',
      method: 'GET',
    );

    if (response.data?['success'] == true) {
      final List<dynamic> rawList = response.data?['data'] ?? [];
      return rawList.map((m) => ImpactMessage.fromJson(m)).toList();
    } else {
      throw Exception(response.data?['error'] ?? 'Failed to fetch impact messages');
    }
  }

  Future<int> getUnreadCount() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/api/impact/unread-count',
      method: 'GET',
    );
    if (response.data?['success'] == true) {
      return (response.data?['data']?['count'] as int?) ?? 0;
    }
    return 0;
  }

  Future<void> markAsRead(String messageId) async {
    try {
      await _api.request(
        '/api/impact/messages/$messageId/read',
        method: 'PUT',
      );
    } catch (e) {
      debugPrint('[ImpactRepository] markAsRead offline: $e');
      await OfflineQueue.instance.enqueue(QueuedRequest(
        id: 'impact_read_$messageId',
        endpoint: '/api/impact/messages/$messageId/read',
        method: 'PUT',
        idempotent: true,
        enqueuedAt: DateTime.now(),
      ));
    }
  }

  Future<void> markAllAsRead() async {
    try {
      await _api.request(
        '/api/impact/messages/read-all',
        method: 'PUT',
      );
    } catch (e) {
      debugPrint('[ImpactRepository] markAllAsRead offline: $e');
      await OfflineQueue.instance.enqueue(QueuedRequest(
        id: 'impact_read_all_${DateTime.now().millisecondsSinceEpoch}',
        endpoint: '/api/impact/messages/read-all',
        method: 'PUT',
        idempotent: true,
        enqueuedAt: DateTime.now(),
      ));
    }
  }
}
