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

  const BOQDetailsState({this.isLoading = true, this.error, this.items = const []});

  @override
  List<Object?> get props => [isLoading, error, items];
}

class BOQDetailsCubit extends Cubit<BOQDetailsState> {
  BOQDetailsCubit() : super(const BOQDetailsState());

  void setLoaded(List<BOQItem> items) => emit(BOQDetailsState(isLoading: false, items: items));
  void setError(String message) => emit(BOQDetailsState(isLoading: false, error: message));
}
