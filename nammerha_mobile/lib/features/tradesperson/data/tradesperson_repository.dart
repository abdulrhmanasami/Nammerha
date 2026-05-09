import '../../../core/services/api_services.dart';
import '../models/tradesperson_models.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Tradesperson Repository — Data Access Layer (Platinum Standard)
// ═══════════════════════════════════════════════════════════════════════════
// Follows the EngineerRepository pattern: per-tab lazy loading with typed
// model parsing. Each failing endpoint degrades gracefully with typed
// empty fallbacks instead of raw map silences.
// ═══════════════════════════════════════════════════════════════════════════

class TradespersonRepository {
  final TradespersonApi _api;

  TradespersonRepository({TradespersonApi? api}) : _api = api ?? TradespersonApi();

  /// Load dashboard KPIs (tab 0).
  Future<TradespersonDashboardModel> loadDashboard() async {
    final rawStats = await _api.getStats();
    return TradespersonDashboardModel(
      stats: rawStats.isNotEmpty
          ? TradespersonStatsModel.fromJson(rawStats)
          : TradespersonStatsModel.empty,
    );
  }

  /// Load available service requests matching tradesperson's trade (tab 1).
  Future<TradespersonDashboardModel> loadRequests(TradespersonDashboardModel current) async {
    final rawReqs = await _api.getRequests();
    return current.copyWith(
      requests: rawReqs.map((e) => ServiceRequestModel.fromJson(e)).toList(),
    );
  }

  /// Load contractor assignments (tab 2).
  Future<TradespersonDashboardModel> loadAssignments(TradespersonDashboardModel current) async {
    final rawAssignments = await _api.getAssignments();
    return current.copyWith(
      assignments: rawAssignments.map((e) => TradeAssignmentModel.fromJson(e)).toList(),
    );
  }

  /// Load earnings history (tab 3).
  Future<TradespersonDashboardModel> loadEarnings(TradespersonDashboardModel current) async {
    final rawEarnings = await _api.getEarnings();
    return current.copyWith(
      earnings: rawEarnings.map((e) => EarningRecordModel.fromJson(e)).toList(),
    );
  }

  /// Load profile with availability (tab 4 + init).
  Future<TradespersonDashboardModel> loadProfile(TradespersonDashboardModel current) async {
    final rawProfile = await _api.getProfile();
    final profile = rawProfile.isNotEmpty
        ? TradespersonProfileModel.fromJson(rawProfile)
        : TradespersonProfileModel.empty;
    return current.copyWith(
      profile: profile,
      availability: profile.availability,
    );
  }

  /// Update availability status (available | busy | offline).
  Future<void> updateAvailability(String availability) async {
    await _api.updateAvailability(availability);
  }

  /// Accept a homeowner service request (Thumbtack mode).
  Future<void> acceptRequest(String requestId) async {
    await _api.acceptRequest(requestId);
  }

  /// Respond to a contractor assignment (accept/decline).
  Future<void> respondToAssignment(String assignmentId, bool accept) async {
    await _api.respondToAssignment(assignmentId, accept: accept);
  }
}
