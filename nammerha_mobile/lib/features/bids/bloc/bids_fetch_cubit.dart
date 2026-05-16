import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';

import '../../../core/services/api_services.dart';
import '../../../core/network/api_client.dart';
import '../../../core/utils/error_localizer.dart';
import '../../../core/i18n/error_keys.dart';
import '../models/bid_model.dart';

// ═══════════════════════════════════════════════════════════════════════════
// BidsFetchCubit — Platinum Standard (P1-002 Architectural Purity)
// ═══════════════════════════════════════════════════════════════════════════
// OWNS the data lifecycle: fetch → parse → filter → sort.
// Widget is now a pure presentation layer with zero API awareness.
// Uses typed BidModel instead of raw Map<String, dynamic>.
// ═══════════════════════════════════════════════════════════════════════════

// ─── State ──────────────────────────────────────────────────────────────────

class BidsFetchState extends Equatable {
  final bool isLoading;
  final String? error;
  final List<BidModel> bids;       // filtered + sorted bids for display
  final List<BidModel> allBids;    // raw bids from API
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
    List<BidModel>? bids,
    List<BidModel>? allBids,
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

// ─── Cubit ──────────────────────────────────────────────────────────────────

class BidsFetchCubit extends Cubit<BidsFetchState> {
  final EngineerApi _engineerApi;

  BidsFetchCubit({EngineerApi? engineerApi})
      : _engineerApi = engineerApi ?? EngineerApi(),
        super(const BidsFetchState());

  /// Fetches bids from the API. Owns the full data lifecycle.
  Future<void> fetchBids() async {
    emit(const BidsFetchState(isLoading: true));
    try {
      final rawBids = await _engineerApi.getBids();
      final models = rawBids.map((json) => BidModel.fromJson(json)).toList();
      emit(BidsFetchState(isLoading: false, bids: models, allBids: models));
    } on ApiException catch (e) {
      emit(BidsFetchState(isLoading: false, error: localizeApiError(e.message)));
    } catch (e) {
      emit(BidsFetchState(isLoading: false, error: ErrorKeys.loadBids));
    }
  }

  /// Applies filter and/or sort to the cached allBids list.
  void applyFilter({String? filter, String? sort}) {
    List<BidModel> filtered = List.from(state.allBids);

    if (filter != null && filter != 'all') {
      filtered = filtered.where((b) => b.normalizedStatus == filter.toLowerCase()).toList();
    }

    if (sort == 'highest_amount') {
      filtered.sort((a, b) => b.proposedCost.compareTo(a.proposedCost));
    } else if (sort == 'lowest_amount') {
      filtered.sort((a, b) => a.proposedCost.compareTo(b.proposedCost));
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
