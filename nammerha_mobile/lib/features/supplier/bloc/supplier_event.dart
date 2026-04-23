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

  const AddCatalogItemEvent({
    required this.name,
    required this.category,
    required this.unit,
    required this.price,
    required this.minOrder,
    required this.leadTime,
  });

  @override
  List<Object?> get props => [name, category, unit, price, minOrder, leadTime];
}
