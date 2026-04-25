import '../network/api_client.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT DASHBOARD API — Mirrors api.ts dashboard module
// ═══════════════════════════════════════════════════════════════════════════════
// GAP-C6 FIX: Wire mobile app to per-project management dashboard endpoints.
// Enables daily construction logs, material approvals, and project overview KPIs.
// ═══════════════════════════════════════════════════════════════════════════════

class ProjectDashboardApi {
  final NammerhaApiClient _api;
  ProjectDashboardApi({NammerhaApiClient? api})
      : _api = api ?? NammerhaApiClient.instance;

  /// GET /api/dashboard/:projectId/overview
  /// Returns project KPIs: progress, funding, milestones, team.
  Future<Map<String, dynamic>> getOverview(String projectId) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/dashboard/$projectId/overview',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/dashboard/:projectId/logs
  /// Returns list of daily construction logs submitted by engineers.
  Future<List<Map<String, dynamic>>> getDailyLogs(String projectId) async {
    final response = await _api.request<List<dynamic>>(
      '/dashboard/$projectId/logs',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// POST /api/dashboard/:projectId/logs
  /// Submit a new daily construction log with optional photos.
  Future<Map<String, dynamic>?> submitLog(
    String projectId, {
    required String description,
    String? workCompleted,
    String? issuesEncountered,
    String? weatherConditions,
    int? workersOnSite,
    List<String>? images,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/dashboard/$projectId/logs',
      method: 'POST',
      body: {
        'description': description,
        if (workCompleted != null) 'work_completed': workCompleted,
        if (issuesEncountered != null) 'issues_encountered': issuesEncountered,
        if (weatherConditions != null) 'weather_conditions': weatherConditions,
        if (workersOnSite != null) 'workers_on_site': workersOnSite,
        if (images != null) 'images': images,
      },
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data;
  }

  /// POST /api/dashboard/:projectId/approvals
  /// Create a material approval request for homeowner review.
  Future<Map<String, dynamic>?> createApproval(
    String projectId, {
    String? itemId,
    required String title,
    String? description,
    String? materialSampleUrl,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/dashboard/$projectId/approvals',
      method: 'POST',
      body: {
        if (itemId != null) 'item_id': itemId,
        'title': title,
        if (description != null) 'description': description,
        if (materialSampleUrl != null) 'material_sample_url': materialSampleUrl,
      },
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data;
  }

  /// POST /api/dashboard/approvals/:approvalId/respond
  /// Approve or reject a material approval request.
  Future<void> respondToApproval(
    String approvalId, {
    required String decision,
    String? note,
  }) async {
    await _api.request(
      '/dashboard/approvals/$approvalId/respond',
      method: 'POST',
      body: {
        'decision': decision,
        if (note != null) 'note': note,
      },
    );
  }
}
