import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';

// SupplierPortalUiCubit — Platinum Standard (Absolute Zero setState)
// Eliminates 6 `setState` calls in `SupplierPortalScreen` for filters and loading.

class SupplierPortalUiState extends Equatable {
  final String orderFilter;
  final String catalogSearch;
  final bool isProcessingOrder;

  const SupplierPortalUiState({
    this.orderFilter = 'all',
    this.catalogSearch = '',
    this.isProcessingOrder = false,
  });

  SupplierPortalUiState copyWith({
    String? orderFilter,
    String? catalogSearch,
    bool? isProcessingOrder,
  }) {
    return SupplierPortalUiState(
      orderFilter: orderFilter ?? this.orderFilter,
      catalogSearch: catalogSearch ?? this.catalogSearch,
      isProcessingOrder: isProcessingOrder ?? this.isProcessingOrder,
    );
  }

  @override
  List<Object?> get props => [orderFilter, catalogSearch, isProcessingOrder];
}

class SupplierPortalUiCubit extends Cubit<SupplierPortalUiState> {
  SupplierPortalUiCubit() : super(const SupplierPortalUiState());

  void setOrderFilter(String filter) => emit(state.copyWith(orderFilter: filter));
  void setCatalogSearch(String search) => emit(state.copyWith(catalogSearch: search));
  void setProcessing(bool isProcessing) => emit(state.copyWith(isProcessingOrder: isProcessing));
}
