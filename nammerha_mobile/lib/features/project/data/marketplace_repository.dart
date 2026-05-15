import '../../../core/services/api_services.dart';
import '../models/project_model.dart';

class MarketplaceRepository {
  final MarketplaceApi _api;

  MarketplaceRepository({MarketplaceApi? api}) : _api = api ?? MarketplaceApi();

  /// Wave 4: Pagination-aware fetch.
  /// [limit] controls page size (default 20 for Syria 2G resilience).
  /// [offset] controls cursor position for infinite scroll.
  Future<List<ProjectModel>> fetchProjects({
    int limit = 20,
    int offset = 0,
  }) async {
    final rawProjects = await _api.getProjects(limit: limit, offset: offset);
    return rawProjects.map((json) => ProjectModel.fromJson(json)).toList();
  }
}
