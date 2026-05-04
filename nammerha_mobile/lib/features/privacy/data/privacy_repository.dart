import '../../../core/network/api_client.dart';

class PrivacyRepository {
  final NammerhaApiClient _api = NammerhaApiClient.instance;

  Future<void> requestDataExport() async {
    final response = await _api.post('/api/privacy/export');
    if (response.data['success'] != true) {
      throw Exception(response.data['error'] ?? 'Failed to request data export');
    }
  }

  Future<void> withdrawConsent() async {
    final response = await _api.post('/api/privacy/withdraw-consent');
    if (response.data['success'] != true) {
      throw Exception(response.data['error'] ?? 'Failed to withdraw consent');
    }
  }

  Future<void> deleteAccount() async {
    final response = await _api.delete('/api/privacy/account');
    if (response.data['success'] != true) {
      throw Exception(response.data['error'] ?? 'Failed to delete account');
    }
  }

  Future<List<Map<String, dynamic>>> getConsentAuditLogs() async {
    final response = await _api.get('/api/privacy/audit-logs');
    if (response.data['success'] == true) {
      return List<Map<String, dynamic>>.from(response.data['data'] ?? []);
    }
    throw Exception(response.data['error'] ?? 'Failed to fetch audit logs');
  }
}
