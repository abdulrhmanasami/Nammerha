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
      emit(const SupplierActionSuccess('تم تحديث حالة الطلب بنجاح.'));
      // Reload dashboard immediately
      add(LoadDashboardEvent());
    } catch (e) {
      emit(SupplierError('فشل التحديث: ${e.toString()}'));
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
      );
      emit(const SupplierActionSuccess('تمت إضافة المادة للكتالوج بنجاح.'));
      // Reload dashboard immediately
      add(LoadDashboardEvent());
    } catch (e) {
      emit(SupplierError('فشل الإضافة: ${e.toString()}'));
    }
  }
}
