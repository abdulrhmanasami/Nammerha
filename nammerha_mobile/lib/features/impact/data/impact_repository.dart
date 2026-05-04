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
    final response = await _api.get(
      '/api/impact/messages',
      queryParameters: {
        'limit': limit.toString(),
        'offset': offset.toString(),
        'unread_only': unreadOnly.toString(),
      },
    );

    if (response.data['success'] == true) {
      final List<dynamic> rawList = response.data['data'] ?? [];
      return rawList.map((m) => ImpactMessage.fromJson(m)).toList();
    } else {
      throw Exception(response.data['error'] ?? 'Failed to fetch impact messages');
    }
  }

  Future<int> getUnreadCount() async {
    final response = await _api.get('/api/impact/unread-count');
    if (response.data['success'] == true) {
      return response.data['data']['count'] ?? 0;
    }
    return 0;
  }

  Future<void> markAsRead(String messageId) async {
    try {
      await _api.put('/api/impact/messages/$messageId/read');
    } catch (e) {
      // Offline resilience pattern: Queue the mutation
      await OfflineQueue.instance.enqueue(
        endpoint: '/api/impact/messages/$messageId/read',
        method: 'PUT',
      );
    }
  }

  Future<void> markAllAsRead() async {
    try {
      await _api.put('/api/impact/messages/read-all');
    } catch (e) {
      // Offline resilience pattern: Queue the mutation
      await OfflineQueue.instance.enqueue(
        endpoint: '/api/impact/messages/read-all',
        method: 'PUT',
      );
    }
  }
}
