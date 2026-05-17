import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/wallet_repository.dart';
import '../models/wallet_model.dart';
import 'wallet_event.dart';
import 'wallet_state.dart';

/// Wave 4: Pagination-aware WalletBloc.
/// Initial load = summary + first 20 transactions.
/// LoadMore = append next 20 transactions, preserving summary stats.
class WalletBloc extends Bloc<WalletEvent, WalletState> {
  final WalletRepository repository;

  WalletBloc({required this.repository}) : super(WalletInitial()) {
    on<LoadWalletEvent>(_onLoadWallet);
    on<LoadMoreTransactionsEvent>(_onLoadMore);
  }

  Future<void> _onLoadWallet(LoadWalletEvent event, Emitter<WalletState> emit) async {
    emit(WalletLoading());
    try {
      final data = await repository.loadWallet(limit: WalletRepository.pageSize, offset: 0);
      emit(WalletLoaded(
        walletData: data,
        hasMore: data.transactions.length >= WalletRepository.pageSize,
      ));
    } catch (e) {
      debugPrint('[Nammerha] bloc/wallet_bloc: $e');
      emit(WalletError(e.toString()));
    }
  }

  /// Wave 4: Infinite scroll — appends next page of transactions.
  /// Summary stats (balance, counts) are preserved from initial load.
  Future<void> _onLoadMore(LoadMoreTransactionsEvent event, Emitter<WalletState> emit) async {
    if (state is! WalletLoaded) return;
    final currentState = state as WalletLoaded;

    // Guard: don't load if already loading or no more pages
    if (currentState.isLoadingMore || !currentState.hasMore) return;

    emit(currentState.copyWith(isLoadingMore: true));

    try {
      final nextPage = await repository.loadMoreTransactions(
        offset: currentState.walletData.transactions.length,
        limit: WalletRepository.pageSize,
      );

      final allTransactions = [
        ...currentState.walletData.transactions,
        ...nextPage,
      ];

      // Create updated wallet data with merged transactions
      // Summary stats remain from initial load (more accurate)
      final updatedData = WalletSummaryModel(
        totalLocked: currentState.walletData.totalLocked,
        lockedCount: currentState.walletData.lockedCount,
        releasedCount: currentState.walletData.releasedCount,
        refundedCount: currentState.walletData.refundedCount,
        transactions: allTransactions,
      );

      emit(currentState.copyWith(
        walletData: updatedData,
        hasMore: nextPage.length >= WalletRepository.pageSize,
        isLoadingMore: false,
      ));
    } catch (e) {
      debugPrint('[Nammerha] bloc/wallet_bloc: $e');
      // Silently fail pagination — keep showing existing data
      emit(currentState.copyWith(isLoadingMore: false));
    }
  }
}
