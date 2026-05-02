import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// BidsFetchCubit — Platinum Standard (Absolute Zero setState)
// ═══════════════════════════════════════════════════════════════════════════
// Replaces 4 setState calls in BidsScreen for data loading lifecycle.

class BidsFetchState extends Equatable {
  final bool isLoading;
  final String? error;
  final List<Map<String, dynamic>> bids;

  const BidsFetchState({this.isLoading = true, this.error, this.bids = const []});

  BidsFetchState copyWith({bool? isLoading, String? error, List<Map<String, dynamic>>? bids}) {
    return BidsFetchState(
      isLoading: isLoading ?? this.isLoading,
      error: error,
      bids: bids ?? this.bids,
    );
  }

  @override
  List<Object?> get props => [isLoading, error, bids];
}

class BidsFetchCubit extends Cubit<BidsFetchState> {
  BidsFetchCubit() : super(const BidsFetchState());

  void setLoading() => emit(const BidsFetchState(isLoading: true));
  void setLoaded(List<Map<String, dynamic>> bids) => emit(BidsFetchState(isLoading: false, bids: bids));
  void setError(String message) => emit(BidsFetchState(isLoading: false, error: message));
}
