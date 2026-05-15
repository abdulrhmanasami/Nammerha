import '../models/service_contract.dart';
import '../models/contract_payment.dart';
import '../models/payment_enums.dart';

/// States for ContractPaymentBloc
sealed class ContractPaymentState {
  const ContractPaymentState();
}

/// Initial state
class ContractPaymentInitial extends ContractPaymentState {
  const ContractPaymentInitial();
}

/// Loading contracts list or contract details
class ContractPaymentLoading extends ContractPaymentState {
  const ContractPaymentLoading();
}

/// Contracts list loaded successfully
class ContractsListLoaded extends ContractPaymentState {
  final List<ServiceContract> contracts;
  const ContractsListLoaded(this.contracts);
}

/// Single contract details loaded (with milestones + payments)
class ContractDetailsLoaded extends ContractPaymentState {
  final ServiceContract contract;
  final PaymentMethod selectedMethod;
  final String? selectedMilestoneId;
  final int? customAmount;

  const ContractDetailsLoaded({
    required this.contract,
    this.selectedMethod = PaymentMethod.cash,
    this.selectedMilestoneId,
    this.customAmount,
  });

  ContractDetailsLoaded copyWith({
    ServiceContract? contract,
    PaymentMethod? selectedMethod,
    String? selectedMilestoneId,
    int? customAmount,
    bool clearMilestone = false,
    bool clearAmount = false,
  }) {
    return ContractDetailsLoaded(
      contract: contract ?? this.contract,
      selectedMethod: selectedMethod ?? this.selectedMethod,
      selectedMilestoneId: clearMilestone ? null : (selectedMilestoneId ?? this.selectedMilestoneId),
      customAmount: clearAmount ? null : (customAmount ?? this.customAmount),
    );
  }
}

/// Payment was created successfully
class PaymentCreated extends ContractPaymentState {
  final ContractPayment payment;
  /// Non-null for Fatora payments — redirect URL
  final String? checkoutUrl;

  const PaymentCreated({
    required this.payment,
    this.checkoutUrl,
  });
}

/// Payment was confirmed by counterparty
class PaymentConfirmed extends ContractPaymentState {
  final ContractPayment payment;
  const PaymentConfirmed(this.payment);
}

/// Contract was created successfully
class ContractCreated extends ContractPaymentState {
  final ServiceContract contract;
  const ContractCreated(this.contract);
}

/// Error state
class ContractPaymentError extends ContractPaymentState {
  final String message;
  const ContractPaymentError(this.message);
}
