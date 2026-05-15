import 'payment_enums.dart';
import 'contract_milestone.dart';
import 'contract_payment.dart';

/// Service Contract — agreement between a homeowner and a service provider.
///
/// Represents the full lifecycle: draft → active → completed/disputed/cancelled.
/// Contains milestones (payment phases) and payment history.
class ServiceContract {
  final String contractId;
  final String projectId;
  final String homeownerId;
  final String providerId;
  final ProviderType providerType;
  final String? bidId;
  final int totalAgreedAmount; // cents
  final String currency;
  final String status; // draft|active|completed|disputed|cancelled

  // Denormalized display fields (from JOINs)
  final String? projectTitle;
  final String? homeownerName;
  final String? providerName;
  final String? notes;

  // Related data (loaded lazily or eagerly depending on endpoint)
  final List<ContractMilestone> milestones;
  final List<ContractPayment> payments;

  final DateTime createdAt;
  final DateTime updatedAt;

  const ServiceContract({
    required this.contractId,
    required this.projectId,
    required this.homeownerId,
    required this.providerId,
    required this.providerType,
    this.bidId,
    required this.totalAgreedAmount,
    this.currency = 'SYP',
    required this.status,
    this.projectTitle,
    this.homeownerName,
    this.providerName,
    this.notes,
    this.milestones = const [],
    this.payments = const [],
    required this.createdAt,
    required this.updatedAt,
  });

  factory ServiceContract.fromJson(Map<String, dynamic> json) {
    final rawMilestones = json['milestones'] as List<dynamic>?;
    final rawPayments = json['payments'] as List<dynamic>?;

    return ServiceContract(
      contractId: json['contract_id'] as String? ?? '',
      projectId: json['project_id'] as String? ?? '',
      homeownerId: json['homeowner_id'] as String? ?? '',
      providerId: json['provider_id'] as String? ?? '',
      providerType: ProviderType.fromApi(json['provider_type'] as String? ?? 'contractor'),
      bidId: json['bid_id'] as String?,
      totalAgreedAmount: (json['total_agreed_amount'] as num?)?.toInt() ?? 0,
      currency: json['currency'] as String? ?? 'SYP',
      status: json['status'] as String? ?? 'draft',
      projectTitle: json['project_title'] as String?,
      homeownerName: json['homeowner_name'] as String?,
      providerName: json['provider_name'] as String?,
      notes: json['notes'] as String?,
      milestones: rawMilestones
              ?.map((m) => ContractMilestone.fromJson(m as Map<String, dynamic>))
              .toList() ??
          [],
      payments: rawPayments
              ?.map((p) => ContractPayment.fromJson(p as Map<String, dynamic>))
              .toList() ??
          [],
      createdAt: DateTime.tryParse(json['created_at']?.toString() ?? '') ?? DateTime.now(),
      updatedAt: DateTime.tryParse(json['updated_at']?.toString() ?? '') ?? DateTime.now(),
    );
  }

  /// Total amount already paid (completed payments only)
  int get totalPaid => payments
      .where((p) => p.isComplete)
      .fold<int>(0, (sum, p) => sum + p.amount);

  /// Total amount pending confirmation
  int get totalPending => payments
      .where((p) => p.isAwaitingCounterpartyConfirmation)
      .fold<int>(0, (sum, p) => sum + p.amount);

  /// Remaining balance
  int get remainingBalance => totalAgreedAmount - totalPaid;

  /// Payment progress as percentage (0.0 — 1.0)
  double get paymentProgress =>
      totalAgreedAmount > 0 ? (totalPaid / totalAgreedAmount).clamp(0.0, 1.0) : 0.0;

  /// Number of completed milestones
  int get completedMilestoneCount =>
      milestones.where((m) => m.isCompleted).length;

  bool get isActive => status == 'active';
  bool get isCompleted => status == 'completed';
  bool get isDraft => status == 'draft';

  /// i18n key for status
  String get statusI18nKey {
    switch (status) {
      case 'draft':
        return 'contract_draft';
      case 'active':
        return 'contract_active';
      case 'completed':
        return 'contract_completed';
      case 'disputed':
        return 'contract_disputed';
      case 'cancelled':
        return 'contract_cancelled';
      default:
        return 'contract_draft';
    }
  }
}
