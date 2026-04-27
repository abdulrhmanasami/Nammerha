import '../../../core/network/api_client.dart';
import '../../project/data/models/project_model.dart';
import '../models/marketplace_filter_model.dart';

class SearchRepository {
  final NammerhaApiClient _apiClient;

  SearchRepository({NammerhaApiClient? apiClient})
      : _apiClient = apiClient ?? NammerhaApiClient.instance;

  static const String _marketplaceQuery = '''
    query Marketplace(\$filters: MarketplaceFilters) {
      marketplace(filters: \$filters) {
        items {
          id
          title
          description
          status
          fundedPercentage
          totalBudget
          images
          gpsLat
          gpsLng
          address
        }
        totalCount
      }
    }
  ''';

  Future<List<ProjectModel>> searchProjects({
    MarketplaceFilters? filters,
  }) async {
    try {
      final data = await _apiClient.graphql(
        query: _marketplaceQuery,
        variables: {
          if (filters != null) 'filters': filters.toJson(),
        },
        operationName: 'Marketplace',
      );

      final items = data['marketplace']['items'] as List<dynamic>;
      return items.map((e) => ProjectModel.fromJson(e as Map<String, dynamic>)).toList();
    } catch (e) {
      throw ApiException('فشل في جلب المشاريع: \$e');
    }
  }
}
