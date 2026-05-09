import '../../../core/services/api_services.dart';
import '../models/engineer_models.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Engineer Repository — Data Access Layer (Platinum Standard)
// ═══════════════════════════════════════════════════════════════════════════
// Follows the ContractorRepository pattern: single loadFullDashboard() call
// with Future.wait for concurrent loading. Each failing endpoint degrades
// gracefully instead of killing the dashboard.
// ═══════════════════════════════════════════════════════════════════════════

class EngineerRepository {
  final EngineerApi _api;

  EngineerRepository({EngineerApi? api}) : _api = api ?? EngineerApi();

  /// Loads all dashboard data (stats, projects, bids, captures) concurrently.
  Future<EngineerDashboardModel> loadFullDashboard() async {
    final results = await Future.wait([
      _api.getStats(),
      _api.getProjects(),
      _api.getBids(),
      _api.getCaptures(limit: 20),
    ]);

    final rawStats = results[0] as Map<String, dynamic>;
    final rawProjects = results[1] as List<Map<String, dynamic>>;
    final rawBids = results[2] as List<Map<String, dynamic>>;
    final rawCaptures = results[3] as List<Map<String, dynamic>>;

    return EngineerDashboardModel(
      stats: rawStats.isNotEmpty
          ? EngineerStatsModel.fromJson(rawStats)
          : EngineerStatsModel.empty,
      projects: rawProjects.map((e) => EngineerProjectModel.fromJson(e)).toList(),
      bids: rawBids.map((e) => EngineerBidModel.fromJson(e)).toList(),
      captures: rawCaptures.map((e) => EngineerCaptureModel.fromJson(e)).toList(),
    );
  }
}
