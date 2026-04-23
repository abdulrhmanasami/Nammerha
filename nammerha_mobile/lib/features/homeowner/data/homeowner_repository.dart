import '../../../core/services/api_services.dart';
import '../../../core/network/api_client.dart';
import '../models/homeowner_models.dart';

class HomeownerRepository {
  final HomeownerApi _api;
  final NammerhaApiClient _apiClient;

  HomeownerRepository({HomeownerApi? api, NammerhaApiClient? apiClient})
      : _api = api ?? HomeownerApi(),
        _apiClient = apiClient ?? NammerhaApiClient.instance;

  Future<HomeownerDashboardModel> loadDashboard() async {
    final results = await Future.wait([
      _api.getStats(),
      _api.getProjects(),
    ]);
    return HomeownerDashboardModel(
      stats: results[0] as Map<String, dynamic>,
      projects: (results[1] as List).cast<Map<String, dynamic>>(),
    );
  }

  Future<HomeownerDashboardModel> loadProjects(HomeownerDashboardModel current) async {
    final projects = await _api.getProjects();
    return current.copyWith(projects: projects);
  }

  Future<HomeownerDashboardModel> loadServiceRequests(HomeownerDashboardModel current) async {
    final reqs = await _api.getServiceRequests();
    return current.copyWith(serviceRequests: reqs);
  }

  Future<HomeownerDashboardModel> loadApprovals(HomeownerDashboardModel current) async {
    final apps = await _api.getApprovals();
    return current.copyWith(approvals: apps);
  }

  Future<HomeownerDashboardModel> loadEscrow(HomeownerDashboardModel current) async {
    final esc = await _api.getEscrow();
    return current.copyWith(escrow: esc);
  }

  Future<void> respondToApproval(String approvalId, String decision) async {
    await _apiClient.request(
      '/dashboard/approvals/$approvalId/respond',
      method: 'POST',
      idempotent: true,
      body: {'decision': decision},
    );
  }
}
