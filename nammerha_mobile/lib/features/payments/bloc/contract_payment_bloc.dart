import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/network/api_client.dart';
import '../data/contract_payment_repository.dart';
import 'contract_payment_event.dart';
import 'contract_payment_state.dart';

/// Contract Payment BLoC — manages service contracts, milestones, and payments.
///
/// Handles:
/// - Loading contract list (my contracts as payer or payee)
/// - Loading contract details with milestones + payment history
/// - Creating new contracts (from bid acceptance or direct hire)
/// - Recording payments (Fatora/Cash/Transfer)
/// - Confirming payment receipt (dual-party confirmation)
/// - UI state for payment method and milestone selection
class ContractPaymentBloc extends Bloc<ContractPaymentEvent, ContractPaymentState> {
  final ContractPaymentRepository _repository;

  ContractPaymentBloc({ContractPaymentRepository? repository})
      : _repository = repository ?? ContractPaymentRepository(),
        super(const ContractPaymentInitial()) {
    on<LoadMyContractsEvent>(_onLoadMyContracts);
    on<LoadContractDetailsEvent>(_onLoadContractDetails);
    on<CreateContractEvent>(_onCreateContract);
    on<CreatePaymentEvent>(_onCreatePayment);
    on<ConfirmPaymentEvent>(_onConfirmPayment);
    on<SelectPaymentMethodEvent>(_onSelectPaymentMethod);
    on<SelectMilestoneEvent>(_onSelectMilestone);
    on<UpdateCustomAmountEvent>(_onUpdateCustomAmount);
  }

  Future<void> _onLoadMyContracts(
    LoadMyContractsEvent event,
    Emitter<ContractPaymentState> emit,
  ) async {
    emit(const ContractPaymentLoading());
    try {
      final contracts = await _repository.getMyContracts(
        status: event.statusFilter,
      );
      emit(ContractsListLoaded(contracts));
    } on ApiException catch (e) {
      emit(ContractPaymentError(e.message));
    } catch (e) {
      emit(ContractPaymentError('load_contracts_error'));
    }
  }

  Future<void> _onLoadContractDetails(
    LoadContractDetailsEvent event,
    Emitter<ContractPaymentState> emit,
  ) async {
    emit(const ContractPaymentLoading());
    try {
      final contract = await _repository.getContractDetails(event.contractId);
      emit(ContractDetailsLoaded(contract: contract));
    } on ApiException catch (e) {
      emit(ContractPaymentError(e.message));
    } catch (e) {
      emit(ContractPaymentError('load_contract_error'));
    }
  }

  Future<void> _onCreateContract(
    CreateContractEvent event,
    Emitter<ContractPaymentState> emit,
  ) async {
    emit(const ContractPaymentLoading());
    try {
      final contract = await _repository.createContract(
        projectId: event.projectId,
        providerId: event.providerId,
        providerType: event.providerType,
        totalAgreedAmount: event.totalAgreedAmount,
        bidId: event.bidId,
        notes: event.notes,
        milestones: event.milestones,
      );
      emit(ContractCreated(contract));
    } on ApiException catch (e) {
      emit(ContractPaymentError(e.message));
    } catch (e) {
      emit(ContractPaymentError('create_contract_error'));
    }
  }

  Future<void> _onCreatePayment(
    CreatePaymentEvent event,
    Emitter<ContractPaymentState> emit,
  ) async {
    // Preserve current UI state for re-emission on error
    final currentState = state;
    emit(const ContractPaymentLoading());

    try {
      final payment = await _repository.createPayment(
        contractId: event.contractId,
        amount: event.amount,
        method: event.method,
        milestoneId: event.milestoneId,
        confirmationNote: event.confirmationNote,
        transferReceiptUrl: event.transferReceiptUrl,
      );

      emit(PaymentCreated(
        payment: payment,
        checkoutUrl: payment.fatoraCheckoutUrl,
      ));

      // Auto-reload contract details to refresh payment list
      final contract = await _repository.getContractDetails(event.contractId);
      emit(ContractDetailsLoaded(contract: contract));
    } on ApiException catch (e) {
      emit(ContractPaymentError(e.message));
      // Re-emit previous state so UI doesn't get stuck
      if (currentState is ContractDetailsLoaded) {
        emit(currentState);
      }
    } catch (e) {
      emit(ContractPaymentError('create_payment_error'));
      if (currentState is ContractDetailsLoaded) {
        emit(currentState);
      }
    }
  }

  Future<void> _onConfirmPayment(
    ConfirmPaymentEvent event,
    Emitter<ContractPaymentState> emit,
  ) async {
    final currentState = state;
    emit(const ContractPaymentLoading());

    try {
      final payment = await _repository.confirmPayment(
        paymentId: event.paymentId,
        note: event.note,
      );

      emit(PaymentConfirmed(payment));

      // Auto-reload contract details
      final contract = await _repository.getContractDetails(event.contractId);
      emit(ContractDetailsLoaded(contract: contract));
    } on ApiException catch (e) {
      emit(ContractPaymentError(e.message));
      if (currentState is ContractDetailsLoaded) {
        emit(currentState);
      }
    } catch (e) {
      emit(ContractPaymentError('confirm_payment_error'));
      if (currentState is ContractDetailsLoaded) {
        emit(currentState);
      }
    }
  }

  void _onSelectPaymentMethod(
    SelectPaymentMethodEvent event,
    Emitter<ContractPaymentState> emit,
  ) {
    if (state is ContractDetailsLoaded) {
      emit((state as ContractDetailsLoaded).copyWith(
        selectedMethod: event.method,
      ));
    }
  }

  void _onSelectMilestone(
    SelectMilestoneEvent event,
    Emitter<ContractPaymentState> emit,
  ) {
    if (state is ContractDetailsLoaded) {
      final current = state as ContractDetailsLoaded;
      if (event.milestoneId == null) {
        emit(current.copyWith(clearMilestone: true));
      } else {
        emit(current.copyWith(selectedMilestoneId: event.milestoneId));
      }
    }
  }

  void _onUpdateCustomAmount(
    UpdateCustomAmountEvent event,
    Emitter<ContractPaymentState> emit,
  ) {
    if (state is ContractDetailsLoaded) {
      emit((state as ContractDetailsLoaded).copyWith(
        customAmount: event.amount,
      ));
    }
  }
}
