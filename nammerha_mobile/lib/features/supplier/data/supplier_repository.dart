import '../../../core/services/api_services.dart';
import '../models/supplier_models.dart';

class SupplierRepository {
  final SupplierApi _api;

  SupplierRepository({SupplierApi? api}) : _api = api ?? SupplierApi();

  /// Loads stats, orders, and catalog simultaneously.
  Future<SupplierDashboardModel> loadFullDashboard() async {
    final results = await Future.wait([
      _api.getStats(),
      _api.getOrders(),
      _api.getCatalog(),
    ]);

    final stats = results[0] as Map<String, dynamic>;
    final rawOrders = (results[1] as List).cast<Map<String, dynamic>>();
    final rawCatalog = (results[2] as List).cast<Map<String, dynamic>>();

    final orders = rawOrders.map((e) => SupplierOrderModel.fromJson(e)).toList();
    final catalog = rawCatalog.map((e) => SupplierItemModel.fromJson(e)).toList();

    return SupplierDashboardModel(
      pendingOrders: stats['pending_orders'] ?? 0,
      wonContracts: stats['won_contracts'] ?? 0,
      inTransit: stats['in_transit'] ?? 0,
      totalRevenue: stats['total_revenue'] ?? 0,
      orders: orders,
      catalog: catalog,
    );
  }

  Future<void> updateOrderStatus(String poId, String newStatus) async {
    await _api.updateOrderStatus(poId, newStatus);
  }

  Future<void> addCatalogItem({
    required String name,
    required String category,
    required String unit,
    required int price,
    required int minOrder,
    required int leadTime,
  }) async {
    await _api.addCatalogItem(
      materialName: name,
      materialCategory: category,
      unit: unit,
      unitPriceGuide: price,
      minimumOrder: minOrder,
      leadTimeDays: leadTime,
    );
  }
}
