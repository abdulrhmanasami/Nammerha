import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../models/boq_item_model.dart';

// ═══════════════════════════════════════════════════════════════════════════
// BOQDetailsCubit — Platinum Standard (Absolute Zero setState)
// ═══════════════════════════════════════════════════════════════════════════

class BOQDetailsState extends Equatable {
  final bool isLoading;
  final String? error;
  final List<BOQItem> items;
  final bool isStale;

  const BOQDetailsState({
    this.isLoading = true, 
    this.error, 
    this.items = const [],
    this.isStale = false,
  });

  @override
  List<Object?> get props => [isLoading, error, items, isStale];
}

class BOQDetailsCubit extends Cubit<BOQDetailsState> {
  BOQDetailsCubit() : super(const BOQDetailsState());

  void setLoaded(List<BOQItem> items, {bool isStale = false}) {
    emit(BOQDetailsState(isLoading: false, items: items, isStale: isStale));
  }
  
  void setError(String message) {
    emit(BOQDetailsState(isLoading: false, error: message));
  }
}
