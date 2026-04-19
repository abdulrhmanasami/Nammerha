import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:nammerha_mobile/features/escrow/bloc/escrow_event.dart';
import 'package:nammerha_mobile/features/escrow/bloc/escrow_state.dart';
import 'package:nammerha_mobile/features/escrow/data/escrow_repository.dart';

class EscrowBloc extends Bloc<EscrowEvent, EscrowState> {
  final EscrowRepository _repository;

  EscrowBloc({required EscrowRepository repository})
      : _repository = repository,
        super(EscrowInitial()) {
    on<InitiateDonationEvent>(_onInitiateDonation);
    on<LoadEscrowSummaryEvent>(_onLoadEscrowSummary);
  }

  Future<void> _onInitiateDonation(
    InitiateDonationEvent event,
    Emitter<EscrowState> emit,
  ) async {
    emit(EscrowLoading());
    try {
      final response = await _repository.createDonation(
        items: event.items,
        paymentMethod: event.paymentMethod,
        returnUrl: event.returnUrl,
      );

      final checkoutUrl = response['checkoutUrl'];
      final intentId = response['intentId'];
      final clientSecret = response['clientSecret'];

      if ((checkoutUrl != null && checkoutUrl.isNotEmpty) || (clientSecret != null && clientSecret.isNotEmpty)) {
        emit(EscrowCheckoutReady(
          checkoutUrl: checkoutUrl, 
          intentId: intentId ?? '',
          clientSecret: clientSecret,
        ));
      } else {
        emit(const EscrowError('Failed to generate secure checkout link.'));
      }
    } catch (e) {
      emit(EscrowError(e.toString()));
    }
  }

  Future<void> _onLoadEscrowSummary(
    LoadEscrowSummaryEvent event,
    Emitter<EscrowState> emit,
  ) async {
    emit(EscrowLoading());
    try {
      final summary = await _repository.getDonorEscrowSummary();
      emit(EscrowSummaryLoaded(summary: summary));
    } catch (e) {
      emit(EscrowError(e.toString()));
    }
  }
}
