import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/supplier_repository.dart';
import 'supplier_event.dart';
import 'supplier_state.dart';

class SupplierBloc extends Bloc<SupplierEvent, SupplierState> {
  final SupplierRepository repository;

  SupplierBloc({required this.repository}) : super(SupplierInitial()) {
    on<LoadDashboardEvent>(_onLoadDashboard);
    on<UpdateOrderStatusEvent>(_onUpdateOrderStatus);
    on<AddCatalogItemEvent>(_onAddCatalogItem);
    on<UpdateCatalogItemEvent>(_onUpdateCatalogItem);
    on<DeactivateCatalogItemEvent>(_onDeactivateCatalogItem);
    on<ReactivateCatalogItemEvent>(_onReactivateCatalogItem);
    on<LoadAnalyticsEvent>(_onLoadAnalytics);
  }

  Future<void> _onLoadDashboard(
    LoadDashboardEvent event,
    Emitter<SupplierState> emit,
  ) async {
    emit(SupplierLoading());
    try {
      final dashboard = await repository.loadFullDashboard();
      emit(SupplierLoaded(dashboard: dashboard));
    } catch (e) {
      emit(SupplierError(e.toString()));
    }
  }

  Future<void> _onUpdateOrderStatus(
    UpdateOrderStatusEvent event,
    Emitter<SupplierState> emit,
  ) async {
    try {
      await repository.updateOrderStatus(event.poId, event.newStatus);
      emit(const SupplierActionSuccess('sp_msg_order_updated'));
      add(LoadDashboardEvent());
    } catch (e) {
      emit(SupplierError('sp_msg_order_failed|${e.toString()}'));
    }
  }

  Future<void> _onAddCatalogItem(
    AddCatalogItemEvent event,
    Emitter<SupplierState> emit,
  ) async {
    try {
      await repository.addCatalogItem(
        name: event.name,
        category: event.category,
        unit: event.unit,
        price: event.price,
        minOrder: event.minOrder,
        leadTime: event.leadTime,
        description: event.description,
      );
      emit(const SupplierActionSuccess('sp_msg_item_added'));
      add(LoadDashboardEvent());
    } catch (e) {
      emit(SupplierError('sp_msg_item_add_failed|${e.toString()}'));
    }
  }

  /// C2 FIX: Handle catalog item editing.
  Future<void> _onUpdateCatalogItem(
    UpdateCatalogItemEvent event,
    Emitter<SupplierState> emit,
  ) async {
    try {
      await repository.updateCatalogItem(
        itemId: event.itemId,
        name: event.name,
        category: event.category,
        unit: event.unit,
        price: event.price,
        minOrder: event.minOrder,
        leadTime: event.leadTime,
        description: event.description,
      );
      emit(const SupplierActionSuccess('sp_msg_item_updated'));
      add(LoadDashboardEvent());
    } catch (e) {
      emit(SupplierError('sp_msg_item_update_failed|${e.toString()}'));
    }
  }

  /// C3 FIX: Soft-delete a catalog item.
  Future<void> _onDeactivateCatalogItem(
    DeactivateCatalogItemEvent event,
    Emitter<SupplierState> emit,
  ) async {
    try {
      await repository.deactivateCatalogItem(event.itemId);
      emit(const SupplierActionSuccess('sp_msg_item_removed'));
      add(LoadDashboardEvent());
    } catch (e) {
      emit(SupplierError('sp_msg_item_remove_failed|${e.toString()}'));
    }
  }

  /// C3 FIX: Re-enable a deactivated catalog item.
  Future<void> _onReactivateCatalogItem(
    ReactivateCatalogItemEvent event,
    Emitter<SupplierState> emit,
  ) async {
    try {
      await repository.reactivateCatalogItem(event.itemId);
      emit(const SupplierActionSuccess('sp_msg_item_reactivated'));
      add(LoadDashboardEvent());
    } catch (e) {
      emit(SupplierError('sp_msg_item_reactivate_failed|${e.toString()}'));
    }
  }

  /// W4 FEATURE: Load monthly revenue analytics.
  Future<void> _onLoadAnalytics(
    LoadAnalyticsEvent event,
    Emitter<SupplierState> emit,
  ) async {
    try {
      final analytics = await repository.loadMonthlyAnalytics();
      emit(SupplierAnalyticsLoaded(analytics));
    } catch (e) {
      emit(SupplierAnalyticsError('sp_msg_analytics_failed|${e.toString()}'));
    }
  }
}
