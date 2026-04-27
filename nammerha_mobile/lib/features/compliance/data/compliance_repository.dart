import '../../../core/services/compliance_api.dart';
import '../models/compliance_models.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Compliance Repository — Data Access Layer (Platinum Standard)
// ═══════════════════════════════════════════════════════════════════════════

class ComplianceRepository {
  final ComplianceApi _api;

  ComplianceRepository({ComplianceApi? api}) : _api = api ?? ComplianceApi();

  /// Loads stats + review queue independently for resilience.
  Future<ComplianceDashboardModel> loadDashboard() async {
    Map<String, dynamic> rawStats = {};
    Map<String, dynamic> rawMetrics = {};
    List<Map<String, dynamic>> rawReviews = [];

    try {
      rawStats = await _api.getDashboardStats();
    } catch (e) {
      _logError('getDashboardStats', e);
    }

    try {
      rawMetrics = await _api.getMetrics();
    } catch (e) {
      _logError('getMetrics', e);
    }

    try {
      rawReviews = await _api.getEscrowReviews();
    } catch (e) {
      _logError('getEscrowReviews', e);
    }

    // Merge stats and metrics into a single model
    final mergedStats = <String, dynamic>{...rawStats, ...rawMetrics};

    return ComplianceDashboardModel(
      stats: mergedStats.isNotEmpty
          ? ComplianceStatsModel.fromJson(mergedStats)
          : ComplianceStatsModel.empty,
      reviews: rawReviews.map((e) => EscrowReviewModel.fromJson(e)).toList(),
    );
  }

  /// Approve an escrow review by reference.
  Future<void> approveReview(String reference) async {
    await _api.approveReview(reference);
  }

  /// Flag an escrow review by reference.
  Future<void> flagReview(String reference) async {
    await _api.flagReview(reference);
  }

  void _logError(String endpoint, Object error) {
    assert(() {
      // ignore: avoid_print
      print('[ComplianceRepository] $endpoint failed: $error');
      return true;
    }());
  }
}
