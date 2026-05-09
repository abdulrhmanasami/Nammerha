import '../../../core/network/api_client.dart';

class PrivacyRepository {
  final NammerhaApiClient _api = NammerhaApiClient.instance;

  Future<void> requestDataExport() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/api/privacy/export',
      method: 'POST',
    );
    if (response.data?['success'] != true) {
      throw Exception(response.data?['error'] ?? 'Failed to request data export');
    }
  }

  Future<void> withdrawConsent() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/api/privacy/withdraw-consent',
      method: 'POST',
    );
    if (response.data?['success'] != true) {
      throw Exception(response.data?['error'] ?? 'Failed to withdraw consent');
    }
  }

  Future<void> deleteAccount() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/api/privacy/account',
      method: 'DELETE',
    );
    if (response.data?['success'] != true) {
      throw Exception(response.data?['error'] ?? 'Failed to delete account');
    }
  }

  Future<List<Map<String, dynamic>>> getConsentAuditLogs() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/api/privacy/audit-logs',
      method: 'GET',
    );
    if (response.data?['success'] == true) {
      return List<Map<String, dynamic>>.from(response.data?['data'] ?? []);
    }
    throw Exception(response.data?['error'] ?? 'Failed to fetch audit logs');
  }
}
