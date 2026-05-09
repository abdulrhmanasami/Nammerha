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

/// W4 FEATURE: Analytics chart data loaded.
class SupplierAnalyticsLoaded extends SupplierState {
  final List<MonthlyRevenuePoint> analytics;

  const SupplierAnalyticsLoaded(this.analytics);

  @override
  List<Object?> get props => [analytics];
}

/// W4 FEATURE: Analytics load failed — contained within the analytics tab
/// so it doesn't replace the loaded dashboard.
class SupplierAnalyticsError extends SupplierState {
  final String message;

  const SupplierAnalyticsError(this.message);

  @override
  List<Object?> get props => [message];
}
