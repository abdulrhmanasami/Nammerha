import '../../../core/services/api_services.dart';

class ProjectRepository {
  final MarketplaceApi _api;

  ProjectRepository({MarketplaceApi? api}) : _api = api ?? MarketplaceApi();

  Future<Map<String, dynamic>?> getProject(String projectId) async {
    return await _api.getProject(projectId);
  }

  Future<List<Map<String, dynamic>>> getProjectBOQ(String projectId) async {
    return await _api.getProjectBOQ(projectId);
  }

  /// Fetch projects assigned to the current engineer.
  Future<List<Map<String, dynamic>>> fetchEngineerProjects() async {
    return await _api.getProjects();
  }

  /// Fetch full project details by ID.
  Future<Map<String, dynamic>?> fetchProjectDetails(String projectId) async {
    return await _api.getProject(projectId);
  }

  /// Fetch BOQ items for a project.
  Future<List<Map<String, dynamic>>> fetchProjectBOQ(String projectId) async {
    return await _api.getProjectBOQ(projectId);
  }
}
