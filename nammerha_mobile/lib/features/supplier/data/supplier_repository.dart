import 'package:flutter/foundation.dart';
import '../../../core/services/api_services.dart';
import '../models/supplier_models.dart';

class SupplierRepository {
  final SupplierApi _api;

  SupplierRepository({SupplierApi? api}) : _api = api ?? SupplierApi();

  /// Loads stats, orders, and catalog independently for resilience.
  /// C5 FIX: Silent catches replaced with diagnostic logging.
  Future<SupplierDashboardModel> loadFullDashboard() async {
    Map<String, dynamic> stats = {};
    List<Map<String, dynamic>> rawOrders = [];
    List<Map<String, dynamic>> rawCatalog = [];

    try {
      stats = await _api.getStats();
    } catch (e) {
      debugPrint('[SupplierRepo] Stats load failed: $e');
    }

    try {
      rawOrders = await _api.getOrders();
    } catch (e) {
      debugPrint('[SupplierRepo] Orders load failed: $e');
    }

    try {
      rawCatalog = await _api.getCatalog();
    } catch (e) {
      debugPrint('[SupplierRepo] Catalog load failed: $e');
    }

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
    String? description,
  }) async {
    await _api.addCatalogItem(
      materialName: name,
      materialCategory: category,
      unit: unit,
      unitPriceGuide: price,
      minimumOrder: minOrder,
      leadTimeDays: leadTime,
      description: description,
    );
  }

  Future<void> updateCatalogItem({
    required String itemId,
    String? name,
    String? category,
    String? unit,
    int? price,
    int? minOrder,
    int? leadTime,
    String? description,
  }) async {
    await _api.updateCatalogItem(
      itemId,
      materialName: name,
      materialCategory: category,
      unit: unit,
      unitPriceGuide: price,
      minimumOrder: minOrder,
      leadTimeDays: leadTime,
      description: description,
    );
  }

  /// C3 FIX: Soft-delete a catalog item.
  Future<void> deactivateCatalogItem(String itemId) async {
    await _api.deactivateItem(itemId);
  }

  /// C3 FIX: Re-enable a previously deactivated catalog item.
  Future<void> reactivateCatalogItem(String itemId) async {
    await _api.reactivateItem(itemId);
  }

  /// W4 FEATURE: Load monthly revenue analytics for chart.
  /// F3 FIX: Was swallowing errors → SupplierAnalyticsError never emitted → retry never shown.
  /// Now rethrows so BLoC can emit SupplierAnalyticsError with retry UI.
  Future<List<MonthlyRevenuePoint>> loadMonthlyAnalytics() async {
    final raw = await _api.getAnalytics();
    return raw.map((e) => MonthlyRevenuePoint.fromJson(e)).toList();
  }
}
