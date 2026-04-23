import '../../../core/services/api_services.dart';
import '../models/donor_models.dart';

class DonorRepository {
  final DonorApi _api;

  DonorRepository({DonorApi? api}) : _api = api ?? DonorApi();

  Future<DonorDashboardModel> loadDashboard() async {
    Map<String, dynamic> stats = {};
    List<Map<String, dynamic>> impact = [];

    try {
      stats = await _api.getStats();
    } catch (_) {}

    try {
      final raw = await _api.getImpact();
      impact = raw;
    } catch (_) {}

    return DonorDashboardModel(
      stats: stats,
      fundedProjects: impact,
    );
  }

  Future<DonorDashboardModel> loadMarketplace(DonorDashboardModel current) async {
    final marketplace = await _api.getMarketplace();
    return current.copyWith(marketplace: marketplace);
  }

  Future<DonorDashboardModel> loadDonations(DonorDashboardModel current) async {
    final donations = await _api.getDonations();
    return current.copyWith(donations: donations);
  }

  Future<DonorDashboardModel> loadImpact(DonorDashboardModel current) async {
    final impact = await _api.getImpact();
    return current.copyWith(impact: impact);
  }

  Future<DonorDashboardModel> loadProofs(DonorDashboardModel current) async {
    final proofs = await _api.getProofs();
    return current.copyWith(proofs: proofs);
  }

  /// Specialized call for the standalone Proof screen
  Future<List<Map<String, dynamic>>> loadStandaloneProofs() async {
    return await _api.getProofs();
  }
}
