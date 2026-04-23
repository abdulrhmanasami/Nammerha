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

  const SupplierItemModel({
    required this.id,
    required this.name,
    required this.category,
    required this.unit,
    required this.unitPriceGuide,
    required this.minOrderQty,
    required this.leadTimeDays,
    required this.isActive,
  });

  factory SupplierItemModel.fromJson(Map<String, dynamic> json) {
    return SupplierItemModel(
      id: (json['item_id'] ?? json['itemId'] ?? '').toString(),
      name: json['material_name']?.toString() ?? 'مادة غير مسماة',
      category: json['material_category']?.toString() ?? 'غير محدد',
      unit: json['unit']?.toString() ?? 'قطعة',
      unitPriceGuide: json['unit_price_guide'] ?? json['unitPriceGuide'] ?? 0,
      minOrderQty: json['min_order_qty'] ?? json['minOrderQty'] ?? 1,
      leadTimeDays: json['lead_time_days'] ?? json['leadTimeDays'] ?? 7,
      isActive: json['is_active'] ?? json['isActive'] ?? true,
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
      materialName: json['material_name']?.toString() ?? 'مادة مبهمة',
      projectTitle: json['project_title']?.toString() ?? 'طلب مباشر',
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
