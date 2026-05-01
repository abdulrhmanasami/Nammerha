import '../../../core/services/api_services.dart';

// ═══════════════════════════════════════════════════════════════════════════
// OPEN DATA REPOSITORY — GAP-G02 REMEDIATION
// Data access layer for OCDS transparency endpoints
// ═══════════════════════════════════════════════════════════════════════════

class OpenDataRepository {
  final OpenDataApi _api;

  OpenDataRepository({OpenDataApi? api}) : _api = api ?? OpenDataApi();

  /// Load platform-wide transparency statistics
  Future<Map<String, dynamic>> getStats() => _api.getStats();

  /// Load paginated project listings
  Future<List<Map<String, dynamic>>> getProjectListings({
    int? limit,
    int? offset,
  }) =>
      _api.getProjectListings(limit: limit, offset: offset);

  /// Load a single project card (OCDS-compliant)
  Future<Map<String, dynamic>> getProjectCard(String projectId) =>
      _api.getProjectCard(projectId);

  /// Load full OCDS release package
  Future<Map<String, dynamic>> getOCDSRelease(String projectId) =>
      _api.getOCDSRelease(projectId);

  /// Export project report as PDF or XLSX
  Future<String?> exportReport(String projectId, {String format = 'pdf'}) =>
      _api.exportReport(projectId, format: format);
}
