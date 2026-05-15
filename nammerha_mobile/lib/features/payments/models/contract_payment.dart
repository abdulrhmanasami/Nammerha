import 'payment_enums.dart';

/// Contract Payment — a single payment record within a service contract.
///
/// Supports 3 payment methods:
/// - Fatora (digital gateway with redirect URL)
/// - Cash (dual-party confirmation)
/// - Bank Transfer (dual-party confirmation + optional receipt)
class ContractPayment {
  final String paymentId;
  final String contractId;
  final String? milestoneId;
  final String payerId;
  final String payeeId;
  final String? payerName;
  final String? payeeName;
  final int amount; // cents
  final String currency;
  final PaymentMethod method;
  final PaymentStatus status;

  // Fatora-specific
  final String? fatoraReference;
  final String? fatoraCheckoutUrl;

  // Cash/Transfer evidence
  final String? transferReceiptUrl;
  final String? confirmationNote;

  // Dual confirmation timestamps
  final DateTime? payerConfirmedAt;
  final DateTime? payeeConfirmedAt;
  final DateTime? completedAt;

  final DateTime createdAt;

  const ContractPayment({
    required this.paymentId,
    required this.contractId,
    this.milestoneId,
    required this.payerId,
    required this.payeeId,
    this.payerName,
    this.payeeName,
    required this.amount,
    this.currency = 'SYP',
    required this.method,
    required this.status,
    this.fatoraReference,
    this.fatoraCheckoutUrl,
    this.transferReceiptUrl,
    this.confirmationNote,
    this.payerConfirmedAt,
    this.payeeConfirmedAt,
    this.completedAt,
    required this.createdAt,
  });

  factory ContractPayment.fromJson(Map<String, dynamic> json) {
    return ContractPayment(
      paymentId: json['payment_id'] as String? ?? '',
      contractId: json['contract_id'] as String? ?? '',
      milestoneId: json['milestone_id'] as String?,
      payerId: json['payer_id'] as String? ?? '',
      payeeId: json['payee_id'] as String? ?? '',
      payerName: json['payer_name'] as String?,
      payeeName: json['payee_name'] as String?,
      amount: (json['amount'] as num?)?.toInt() ?? 0,
      currency: json['currency'] as String? ?? 'SYP',
      method: PaymentMethod.fromApi(json['payment_method'] as String? ?? 'cash'),
      status: PaymentStatus.fromApi(json['status'] as String? ?? 'pending'),
      fatoraReference: json['fatora_reference'] as String?,
      fatoraCheckoutUrl: json['fatora_checkout_url'] as String?,
      transferReceiptUrl: json['transfer_receipt_url'] as String?,
      confirmationNote: json['confirmation_note'] as String?,
      payerConfirmedAt: json['payer_confirmed_at'] != null
          ? DateTime.tryParse(json['payer_confirmed_at'].toString())
          : null,
      payeeConfirmedAt: json['payee_confirmed_at'] != null
          ? DateTime.tryParse(json['payee_confirmed_at'].toString())
          : null,
      completedAt: json['completed_at'] != null
          ? DateTime.tryParse(json['completed_at'].toString())
          : null,
      createdAt: DateTime.tryParse(json['created_at']?.toString() ?? '') ?? DateTime.now(),
    );
  }

  /// Whether this payment is waiting for the other party's confirmation
  bool get isAwaitingCounterpartyConfirmation =>
      status == PaymentStatus.payerConfirmed || status == PaymentStatus.payeeConfirmed;

  /// Whether this payment is fully completed
  bool get isComplete => status == PaymentStatus.completed;

  /// Whether this payment can be confirmed by the given user
  bool canBeConfirmedBy(String userId) {
    if (status == PaymentStatus.pending) {
      // Either party can initiate confirmation
      return userId == payerId || userId == payeeId;
    }
    if (status == PaymentStatus.payerConfirmed) {
      // Only payee can confirm now
      return userId == payeeId;
    }
    if (status == PaymentStatus.payeeConfirmed) {
      // Only payer can confirm now
      return userId == payerId;
    }
    return false;
  }
}
