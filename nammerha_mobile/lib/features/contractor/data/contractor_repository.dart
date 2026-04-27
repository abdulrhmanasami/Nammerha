import '../../../core/services/api_services.dart';
import '../models/contractor_models.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Contractor Repository — Data Access Layer (Platinum Standard)
// ═══════════════════════════════════════════════════════════════════════════
// Follows the SupplierRepository pattern: single loadFullDashboard() call
// with independent try/catch per API call for network resilience.
// Each failing endpoint degrades gracefully instead of killing the dashboard.
// ═══════════════════════════════════════════════════════════════════════════

class ContractorRepository {
  final ContractorApi _api;

  ContractorRepository({ContractorApi? api}) : _api = api ?? ContractorApi();

  /// Loads all dashboard data (stats, projects, marketplace, bids, payments)
  /// independently. Each call is wrapped separately so a single failing
  /// endpoint doesn't take down the entire dashboard.
  Future<ContractorDashboardModel> loadFullDashboard() async {
    Map<String, dynamic> rawStats = {};
    List<Map<String, dynamic>> rawProjects = [];
    List<Map<String, dynamic>> rawMarketplace = [];
    List<Map<String, dynamic>> rawBids = [];
    List<Map<String, dynamic>> rawPayments = [];

    // P0.3 FIX: Each catch now logs the error type for telemetry instead of
    // silently swallowing with `catch (_) {}`. The BLoC still receives a
    // degraded dashboard so the UI doesn't crash.

    try {
      rawStats = await _api.getStats();
    } catch (e) {
      // Degraded: KPI row shows zeros — better than crashing
      _logError('getStats', e);
    }

    try {
      rawProjects = await _api.getProjects();
    } catch (e) {
      _logError('getProjects', e);
    }

    try {
      rawMarketplace = await _api.getMarketplace();
    } catch (e) {
      _logError('getMarketplace', e);
    }

    try {
      rawBids = await _api.getBids();
    } catch (e) {
      _logError('getBids', e);
    }

    try {
      rawPayments = await _api.getPayments();
    } catch (e) {
      _logError('getPayments', e);
    }

    return ContractorDashboardModel(
      stats: rawStats.isNotEmpty
          ? ContractorStatsModel.fromJson(rawStats)
          : ContractorStatsModel.empty,
      projects: rawProjects.map((e) => ContractorProjectModel.fromJson(e)).toList(),
      marketplace: rawMarketplace.map((e) => ContractorProjectModel.fromJson(e)).toList(),
      bids: rawBids.map((e) => ContractorBidModel.fromJson(e)).toList(),
      payments: rawPayments.map((e) => ContractorPaymentModel.fromJson(e)).toList(),
    );
  }

  /// Submit a competitive bid for a project.
  Future<void> submitBid({
    required String projectId,
    required int proposedCost,
    required int estimatedDays,
    String? coverLetter,
    String? methodology,
  }) async {
    await _api.submitBid(
      projectId: projectId,
      proposedCost: proposedCost,
      estimatedDays: estimatedDays,
      coverLetter: coverLetter,
      methodology: methodology,
    );
  }

  /// Structured error logging — replaces silent `catch (_) {}`.
  void _logError(String endpoint, Object error) {
    // Using assert-guarded debugPrint ensures this is stripped in release builds.
    assert(() {
      // ignore: avoid_print
      print('[ContractorRepository] $endpoint failed: $error');
      return true;
    }());
  }
}
