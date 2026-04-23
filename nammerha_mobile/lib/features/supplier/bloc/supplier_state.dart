import 'package:equatable/equatable.dart';
import '../models/supplier_models.dart';

abstract class SupplierState extends Equatable {
  const SupplierState();

  @override
  List<Object?> get props => [];
}

class SupplierInitial extends SupplierState {}

class SupplierLoading extends SupplierState {}

class SupplierLoaded extends SupplierState {
  final SupplierDashboardModel dashboard;

  const SupplierLoaded({required this.dashboard});

  @override
  List<Object?> get props => [dashboard];
}

class SupplierError extends SupplierState {
  final String message;

  const SupplierError(this.message);

  @override
  List<Object?> get props => [message];
}

/// Emitted transiently when an action (like Add Item / Update Status) completes,
/// to allow the UI to show a snackbar or close a modal, before reloading the dashboard.
class SupplierActionSuccess extends SupplierState {
  final String message;
  
  const SupplierActionSuccess(this.message);

  @override
  List<Object?> get props => [message];
}
