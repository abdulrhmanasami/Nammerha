import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// BidsFetchCubit — Platinum Standard (Absolute Zero setState)
// ═══════════════════════════════════════════════════════════════════════════
// Replaces 4 setState calls in BidsScreen for data loading lifecycle.

class BidsFetchState extends Equatable {
  final bool isLoading;
  final String? error;
  final List<Map<String, dynamic>> bids; // filtered bids
  final List<Map<String, dynamic>> allBids; // raw bids
  final String? activeFilter;
  final String? activeSort;

  const BidsFetchState({
    this.isLoading = true,
    this.error,
    this.bids = const [],
    this.allBids = const [],
    this.activeFilter,
    this.activeSort,
  });

  BidsFetchState copyWith({
    bool? isLoading,
    String? error,
    List<Map<String, dynamic>>? bids,
    List<Map<String, dynamic>>? allBids,
    String? activeFilter,
    String? activeSort,
    bool clearFilter = false,
    bool clearSort = false,
  }) {
    return BidsFetchState(
      isLoading: isLoading ?? this.isLoading,
      error: error,
      bids: bids ?? this.bids,
      allBids: allBids ?? this.allBids,
      activeFilter: clearFilter ? null : (activeFilter ?? this.activeFilter),
      activeSort: clearSort ? null : (activeSort ?? this.activeSort),
    );
  }

  @override
  List<Object?> get props => [isLoading, error, bids, allBids, activeFilter, activeSort];
}

class BidsFetchCubit extends Cubit<BidsFetchState> {
  BidsFetchCubit() : super(const BidsFetchState());

  void setLoading() => emit(const BidsFetchState(isLoading: true));
  
  void setLoaded(List<Map<String, dynamic>> bids) {
    emit(BidsFetchState(isLoading: false, bids: bids, allBids: bids));
  }
  
  void setError(String message) => emit(BidsFetchState(isLoading: false, error: message));

  void applyFilter({String? filter, String? sort}) {
    List<Map<String, dynamic>> filtered = List.from(state.allBids);

    if (filter != null && filter != 'all') {
      filtered = filtered.where((b) {
        final status = (b['status']?.toString() ?? '').toLowerCase();
        return status == filter.toLowerCase();
      }).toList();
    }

    if (sort == 'highest_amount') {
      filtered.sort((a, b) => (b['amount'] as num? ?? 0).compareTo(a['amount'] as num? ?? 0));
    } else if (sort == 'lowest_amount') {
      filtered.sort((a, b) => (a['amount'] as num? ?? 0).compareTo(b['amount'] as num? ?? 0));
    }

    emit(state.copyWith(
      bids: filtered,
      activeFilter: filter == 'all' ? null : filter,
      activeSort: sort,
      clearFilter: filter == 'all',
      clearSort: sort == null,
    ));
  }
}
