import '../../../core/services/api_services.dart';
import '../models/project_model.dart';

class MarketplaceRepository {
  final MarketplaceApi _api;

  MarketplaceRepository({MarketplaceApi? api}) : _api = api ?? MarketplaceApi();

  Future<List<ProjectModel>> fetchProjects() async {
    final rawProjects = await _api.getProjects();
    return rawProjects.map((json) => ProjectModel.fromJson(json)).toList();
  }
}
