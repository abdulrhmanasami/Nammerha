import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/escrow_repository.dart';
import 'escrow_event.dart';
import 'escrow_state.dart';

class EscrowBloc extends Bloc<EscrowEvent, EscrowState> {
  final EscrowRepository repository;

  EscrowBloc({required this.repository}) : super(EscrowInitial()) {
    on<FetchEscrowSummaryEvent>(_onFetchEscrowSummary);
    on<FetchDonorDonationsEvent>(_onFetchDonorDonations);
  }

  Future<void> _onFetchEscrowSummary(
    FetchEscrowSummaryEvent event,
    Emitter<EscrowState> emit,
  ) async {
    emit(EscrowLoading());
    try {
      final summary = await repository.fetchDonorEscrowSummary();
      emit(EscrowSummaryLoaded(summary));
    } catch (e) {
      emit(EscrowError(e.toString()));
    }
  }

  Future<void> _onFetchDonorDonations(
    FetchDonorDonationsEvent event,
    Emitter<EscrowState> emit,
  ) async {
    emit(EscrowLoading());
    try {
      final donations = await repository.fetchDonorDonations(
        limit: event.limit,
        offset: event.offset,
      );
      emit(DonorDonationsLoaded(donations));
    } catch (e) {
      emit(EscrowError(e.toString()));
    }
  }
}
