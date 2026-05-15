import '../models/payment_enums.dart';

/// Events for ContractPaymentBloc
sealed class ContractPaymentEvent {
  const ContractPaymentEvent();
}

/// Load the list of contracts for the current user
class LoadMyContractsEvent extends ContractPaymentEvent {
  final String? statusFilter;
  const LoadMyContractsEvent({this.statusFilter});
}

/// Load full contract details (milestones + payments)
class LoadContractDetailsEvent extends ContractPaymentEvent {
  final String contractId;
  const LoadContractDetailsEvent(this.contractId);
}

/// Create a new service contract
class CreateContractEvent extends ContractPaymentEvent {
  final String projectId;
  final String providerId;
  final ProviderType providerType;
  final int totalAgreedAmount;
  final String? bidId;
  final String? notes;
  final List<Map<String, dynamic>>? milestones;

  const CreateContractEvent({
    required this.projectId,
    required this.providerId,
    required this.providerType,
    required this.totalAgreedAmount,
    this.bidId,
    this.notes,
    this.milestones,
  });
}

/// Record a new payment on a contract
class CreatePaymentEvent extends ContractPaymentEvent {
  final String contractId;
  final int amount;
  final PaymentMethod method;
  final String? milestoneId;
  final String? confirmationNote;
  final String? transferReceiptUrl;

  const CreatePaymentEvent({
    required this.contractId,
    required this.amount,
    required this.method,
    this.milestoneId,
    this.confirmationNote,
    this.transferReceiptUrl,
  });
}

/// Confirm receipt of a cash/transfer payment (counterparty)
class ConfirmPaymentEvent extends ContractPaymentEvent {
  final String paymentId;
  final String contractId; // for refreshing
  final String? note;

  const ConfirmPaymentEvent({
    required this.paymentId,
    required this.contractId,
    this.note,
  });
}

/// Select payment method in the UI
class SelectPaymentMethodEvent extends ContractPaymentEvent {
  final PaymentMethod method;
  const SelectPaymentMethodEvent(this.method);
}

/// Select a milestone in the UI
class SelectMilestoneEvent extends ContractPaymentEvent {
  final String? milestoneId;
  const SelectMilestoneEvent(this.milestoneId);
}

/// Update custom amount input
class UpdateCustomAmountEvent extends ContractPaymentEvent {
  final int amount;
  const UpdateCustomAmountEvent(this.amount);
}
