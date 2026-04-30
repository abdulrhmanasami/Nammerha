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
  /// concurrently. Enforces Zero-Trust protocol: if any endpoint fails, the
  /// error is bubbled up to the BLoC to display an explicit error state,
  /// completely eradicating the 'Silent Failure' / fake empty state vulnerability.
  Future<ContractorDashboardModel> loadFullDashboard() async {
    final results = await Future.wait([
      _api.getStats(),
      _api.getProjects(),
      _api.getMarketplace(),
      _api.getBids(),
      _api.getPayments(),
    ]);

    final rawStats = results[0] as Map<String, dynamic>;
    final rawProjects = results[1] as List<Map<String, dynamic>>;
    final rawMarketplace = results[2] as List<Map<String, dynamic>>;
    final rawBids = results[3] as List<Map<String, dynamic>>;
    final rawPayments = results[4] as List<Map<String, dynamic>>;

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
}
