import 'package:equatable/equatable.dart';

abstract class SupplierEvent extends Equatable {
  const SupplierEvent();

  @override
  List<Object?> get props => [];
}

class LoadDashboardEvent extends SupplierEvent {}

class UpdateOrderStatusEvent extends SupplierEvent {
  final String poId;
  final String newStatus;

  const UpdateOrderStatusEvent({required this.poId, required this.newStatus});

  @override
  List<Object?> get props => [poId, newStatus];
}

class AddCatalogItemEvent extends SupplierEvent {
  final String name;
  final String category;
  final String unit;
  final int price;
  final int minOrder;
  final int leadTime;
  final String? description;

  const AddCatalogItemEvent({
    required this.name,
    required this.category,
    required this.unit,
    required this.price,
    required this.minOrder,
    required this.leadTime,
    this.description,
  });

  @override
  List<Object?> get props => [name, category, unit, price, minOrder, leadTime, description];
}

class UpdateCatalogItemEvent extends SupplierEvent {
  final String itemId;
  final String? name;
  final String? category;
  final String? unit;
  final int? price;
  final int? minOrder;
  final int? leadTime;
  final String? description;

  const UpdateCatalogItemEvent({
    required this.itemId,
    this.name,
    this.category,
    this.unit,
    this.price,
    this.minOrder,
    this.leadTime,
    this.description,
  });

  @override
  List<Object?> get props => [itemId, name, category, unit, price, minOrder, leadTime, description];
}

class DeactivateCatalogItemEvent extends SupplierEvent {
  final String itemId;

  const DeactivateCatalogItemEvent({required this.itemId});

  @override
  List<Object?> get props => [itemId];
}

class ReactivateCatalogItemEvent extends SupplierEvent {
  final String itemId;

  const ReactivateCatalogItemEvent({required this.itemId});

  @override
  List<Object?> get props => [itemId];
}

class LoadAnalyticsEvent extends SupplierEvent {}
