import '../../../core/services/api_services.dart';
import '../../../core/network/api_client.dart';
import '../models/boq_models.dart';

class BoqRepository {
  final MarketplaceApi _marketplaceApi;
  final NammerhaApiClient _apiClient;

  BoqRepository({MarketplaceApi? marketplaceApi, NammerhaApiClient? apiClient})
      : _marketplaceApi = marketplaceApi ?? MarketplaceApi(),
        _apiClient = apiClient ?? NammerhaApiClient.instance;

  Future<List<BoqItemModel>> loadExistingBOQ(String projectId) async {
    final boqData = await _marketplaceApi.getProjectBOQ(projectId);
    final List<BoqItemModel> items = [];
    
    for (final item in boqData) {
      items.add(BoqItemModel(
        materialName: item['material_name']?.toString() ?? '',
        category: item['material_category']?.toString() ?? 'general',
        unit: item['unit']?.toString() ?? 'piece',
        unitPrice: (item['unit_price'] as num?)?.toInt() ?? 0,
        quantity: (item['required_quantity'] as num?)?.toInt() ?? 1,
        oraclePrice: (item['oracle_reference_price'] as num?)?.toInt(),
      ));
    }
    return items;
  }

  Future<void> publishBOQ(String projectId, List<BoqItemModel> items) async {
    final futures = items.map((item) => _apiClient.request(
          '/projects/$projectId/boq',
          method: 'POST',
          idempotent: true,
          body: {
            'material_name': item.materialName,
            'material_category': item.category,
            'unit': item.unit,
            'unit_price': item.unitPrice,
            'required_quantity': item.quantity,
          },
        ));

    await Future.wait(futures);

    await _apiClient.request(
      '/projects/$projectId/publish',
      method: 'POST',
      idempotent: true,
    );
  }
}
