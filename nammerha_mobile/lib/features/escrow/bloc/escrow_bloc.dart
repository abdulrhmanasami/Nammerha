import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/escrow_repository.dart';
import 'escrow_event.dart';
import 'escrow_state.dart';

class EscrowBloc extends Bloc<EscrowEvent, EscrowState> {
  final EscrowRepository repository;

  EscrowBloc({required this.repository}) : super(EscrowInitial()) {
    on<FetchEscrowSummaryEvent>(_onFetchEscrowSummary);
    on<FetchEscrowTransactionsEvent>(_onFetchEscrowTransactions);
  }

  Future<void> _onFetchEscrowSummary(
    FetchEscrowSummaryEvent event,
    Emitter<EscrowState> emit,
  ) async {
    emit(EscrowLoading());
    try {
      final summary = await repository.fetchEscrowSummary();
      if (isClosed) return;
      emit(EscrowSummaryLoaded(summary));
    } catch (e) {
      if (isClosed) return;
      emit(EscrowError(e.toString()));
    }
  }

  Future<void> _onFetchEscrowTransactions(
    FetchEscrowTransactionsEvent event,
    Emitter<EscrowState> emit,
  ) async {
    emit(EscrowLoading());
    try {
      final transactions = await repository.fetchEscrowTransactions(
        limit: event.limit,
        offset: event.offset,
      );
      if (isClosed) return;
      emit(EscrowTransactionsLoaded(transactions));
    } catch (e) {
      if (isClosed) return;
      emit(EscrowError(e.toString()));
    }
  }
}
