import '../../../core/services/api_services.dart';
import '../models/tradesperson_models.dart';

class TradespersonRepository {
  final TradespersonApi _api;

  TradespersonRepository({TradespersonApi? api}) : _api = api ?? TradespersonApi();

  Future<TradespersonDashboardModel> loadDashboard() async {
    final stats = await _api.getStats();
    return TradespersonDashboardModel(stats: stats);
  }

  Future<TradespersonDashboardModel> loadRequests(TradespersonDashboardModel current) async {
    final reqs = await _api.getRequests();
    return current.copyWith(requests: reqs);
  }

  Future<TradespersonDashboardModel> loadAssignments(TradespersonDashboardModel current) async {
    final assignments = await _api.getAssignments();
    return current.copyWith(assignments: assignments);
  }

  Future<TradespersonDashboardModel> loadEarnings(TradespersonDashboardModel current) async {
    final earnings = await _api.getEarnings();
    return current.copyWith(earnings: earnings);
  }

  Future<TradespersonDashboardModel> loadProfile(TradespersonDashboardModel current) async {
    final profile = await _api.getProfile();
    final availability = profile['availability']?.toString() ?? 'offline';
    return current.copyWith(profile: profile, availability: availability);
  }

  Future<void> updateAvailability(String availability) async {
    await _api.updateAvailability(availability);
  }

  Future<void> acceptRequest(String requestId) async {
    await _api.acceptRequest(requestId);
  }

  Future<void> respondToAssignment(String assignmentId, bool accept) async {
    await _api.respondToAssignment(assignmentId, accept: accept);
  }
}
