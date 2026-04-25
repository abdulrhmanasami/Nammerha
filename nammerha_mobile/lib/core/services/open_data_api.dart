import '../network/api_client.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// OPEN DATA API — Mirrors backend/src/routes/open-data.routes.ts
// ═══════════════════════════════════════════════════════════════════════════════
// GAP-H3 FIX: Public OCDS endpoints for transparency portal.
// ═══════════════════════════════════════════════════════════════════════════════

class OpenDataApi {
  final NammerhaApiClient _api;
  OpenDataApi({NammerhaApiClient? api})
      : _api = api ?? NammerhaApiClient.instance;

  /// GET /api/open-data/projects — List published public projects.
  Future<Map<String, dynamic>> getProjects({
    int limit = 20,
    int offset = 0,
    String? status,
  }) async {
    final qs = StringBuffer('?limit=$limit&offset=$offset');
    if (status != null) qs.write('&status=$status');
    final response = await _api.request<Map<String, dynamic>>(
      '/open-data/projects$qs',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/open-data/projects/:id — Public project card.
  Future<Map<String, dynamic>> getProjectCard(String projectId) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/open-data/projects/$projectId',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/open-data/projects/:id/ocds — OCDS Release Package.
  Future<Map<String, dynamic>> getOCDSRelease(String projectId) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/open-data/projects/$projectId/ocds',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/open-data/stats — Platform-wide statistics.
  Future<Map<String, dynamic>> getStats() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/open-data/stats',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/open-data/schema — OCDS Extension Schema.
  Future<Map<String, dynamic>> getSchema() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/open-data/schema',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }
}
