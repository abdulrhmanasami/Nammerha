import '../../../core/network/api_client.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Compliance API — Mirrors web api.ts compliance module
// ═══════════════════════════════════════════════════════════════════════════
// NEW: This module was completely missing from the mobile app.
// Web reference: frontend/src/api.ts lines 670–711
// ═══════════════════════════════════════════════════════════════════════════

class ComplianceApi {
  final NammerhaApiClient _api;
  ComplianceApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// GET /api/compliance/metrics — OCDS compliance rate, spatial accuracy
  Future<Map<String, dynamic>> getMetrics() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/compliance/metrics',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/dashboard/compliance/stats — Dashboard KPIs
  Future<Map<String, dynamic>> getDashboardStats() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/dashboard/compliance/stats',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/compliance/escrow-reviews — Pending escrow reviews queue
  Future<List<Map<String, dynamic>>> getEscrowReviews() async {
    final response = await _api.request<List<dynamic>>(
      '/compliance/escrow-reviews',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// POST /api/compliance/escrow-reviews/:reference/approve (idempotent)
  Future<void> approveReview(String reference) async {
    await _api.request(
      '/compliance/escrow-reviews/$reference/approve',
      method: 'POST',
      idempotent: true,
    );
  }

  /// POST /api/compliance/escrow-reviews/:reference/flag (idempotent)
  Future<void> flagReview(String reference) async {
    await _api.request(
      '/compliance/escrow-reviews/$reference/flag',
      method: 'POST',
      idempotent: true,
    );
  }

  /// POST /api/compliance/sdn/screen — Screen a name against SDN list
  Future<Map<String, dynamic>> screenSDN({
    required String fullName,
    String? country,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/compliance/sdn/screen',
      method: 'POST',
      body: {
        'full_name': fullName,
        if (country != null) 'country': country,
      },
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/compliance/security-events — Security event log
  Future<List<Map<String, dynamic>>> getSecurityEvents({
    String? severity,
    int? limit,
  }) async {
    final params = <String, String>{};
    if (severity != null) params['severity'] = severity;
    if (limit != null) params['limit'] = limit.toString();
    final qs = params.entries.map((e) => '${e.key}=${e.value}').join('&');
    final endpoint = '/compliance/security-events${qs.isNotEmpty ? '?$qs' : ''}';
    final response = await _api.request<List<dynamic>>(
      endpoint,
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }
}
