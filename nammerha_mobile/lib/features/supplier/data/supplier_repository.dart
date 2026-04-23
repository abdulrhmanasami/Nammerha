import '../../../core/services/api_services.dart';
import '../models/supplier_models.dart';

class SupplierRepository {
  final SupplierApi _api;

  SupplierRepository({SupplierApi? api}) : _api = api ?? SupplierApi();

  /// Loads stats, orders, and catalog independently for resilience.
  Future<SupplierDashboardModel> loadFullDashboard() async {
    Map<String, dynamic> stats = {};
    List<Map<String, dynamic>> rawOrders = [];
    List<Map<String, dynamic>> rawCatalog = [];

    try {
      stats = await _api.getStats();
    } catch (_) {}

    try {
      rawOrders = await _api.getOrders();
    } catch (_) {}

    try {
      rawCatalog = await _api.getCatalog();
    } catch (_) {}

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
