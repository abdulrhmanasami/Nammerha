import 'package:equatable/equatable.dart';

class SupplierItemModel extends Equatable {
  final String id;
  final String name;
  final String category;
  final String unit;
  final num unitPriceGuide;
  final int minOrderQty;
  final int leadTimeDays;
  final bool isActive;
  final String? description;

  const SupplierItemModel({
    required this.id,
    required this.name,
    required this.category,
    required this.unit,
    required this.unitPriceGuide,
    required this.minOrderQty,
    required this.leadTimeDays,
    required this.isActive,
    this.description,
  });

  factory SupplierItemModel.fromJson(Map<String, dynamic> json) {
    return SupplierItemModel(
      id: (json['catalog_id'] ?? json['item_id'] ?? json['itemId'] ?? '').toString(),
      name: json['material_name']?.toString() ?? 'Unnamed material',
      category: json['material_category']?.toString() ?? 'General',
      unit: json['unit']?.toString() ?? 'piece',
      unitPriceGuide: json['unit_price_guide'] ?? json['unitPriceGuide'] ?? 0,
      minOrderQty: json['min_order_qty'] ?? json['minOrderQty'] ?? 1,
      leadTimeDays: json['lead_time_days'] ?? json['leadTimeDays'] ?? 7,
      isActive: json['is_active'] ?? json['isActive'] ?? true,
      description: json['description']?.toString(),
    );
  }

  @override
  List<Object?> get props => [
        id,
        name,
        category,
        unit,
        unitPriceGuide,
        minOrderQty,
        leadTimeDays,
        isActive,
        description,
      ];
}

class SupplierOrderModel extends Equatable {
  final String id;
  final String poNumber;
  final String status;
  final String materialName;
  final String projectTitle;
  final int quantity;
  final String unit;
  final num amount;

  const SupplierOrderModel({
    required this.id,
    required this.poNumber,
    required this.status,
    required this.materialName,
    required this.projectTitle,
    required this.quantity,
    required this.unit,
    required this.amount,
  });

  factory SupplierOrderModel.fromJson(Map<String, dynamic> json) {
    return SupplierOrderModel(
      id: (json['po_id'] ?? json['poId'] ?? '').toString(),
      poNumber: json['po_number']?.toString() ?? 'PO-????',
      status: json['status']?.toString() ?? 'pending',
      materialName: json['material_name']?.toString() ?? 'Unknown material',
      projectTitle: json['project_title']?.toString() ?? 'Direct order',
      quantity: json['quantity'] ?? 0,
      unit: json['unit']?.toString() ?? '',
      amount: json['amount'] ?? 0,
    );
  }

  @override
  List<Object?> get props => [
        id,
        poNumber,
        status,
        materialName,
        projectTitle,
        quantity,
        unit,
        amount,
      ];
}

class SupplierDashboardModel extends Equatable {
  final int pendingOrders;
  final int wonContracts;
  final int inTransit;
  final num totalRevenue;
  final List<SupplierOrderModel> orders;
  final List<SupplierItemModel> catalog;

  const SupplierDashboardModel({
    required this.pendingOrders,
    required this.wonContracts,
    required this.inTransit,
    required this.totalRevenue,
    required this.orders,
    required this.catalog,
  });

  @override
  List<Object?> get props => [
        pendingOrders,
        wonContracts,
        inTransit,
        totalRevenue,
        orders,
        catalog,
      ];
}

/// W4 FEATURE: Monthly data point for revenue analytics chart.
class MonthlyRevenuePoint extends Equatable {
  final String month;      // ISO date: "2026-01-01T00:00:00.000Z"
  final int orderCount;
  final int revenue;       // cents

  const MonthlyRevenuePoint({
    required this.month,
    required this.orderCount,
    required this.revenue,
  });

  factory MonthlyRevenuePoint.fromJson(Map<String, dynamic> json) {
    return MonthlyRevenuePoint(
      month: json['month']?.toString() ?? '',
      orderCount: json['order_count'] ?? 0,
      revenue: json['revenue'] ?? 0,
    );
  }

  /// Short month label. Supports Arabic (default) and English.
  String monthLabel({String locale = 'ar'}) {
    try {
      final date = DateTime.parse(month);
      const monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
      const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return locale == 'ar' ? monthsAr[date.month - 1] : monthsEn[date.month - 1];
    } catch (_) {
      return month;
    }
  }

  @override
  List<Object?> get props => [month, orderCount, revenue];
}
