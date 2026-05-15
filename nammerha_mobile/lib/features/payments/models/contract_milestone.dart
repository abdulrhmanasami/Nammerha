
/// Contract Milestone — a phase of work within a service contract.
///
/// Each milestone has a defined amount (portion of the total contract),
/// a completion status, and optional GPS verification.
class ContractMilestone {
  final String milestoneId;
  final String contractId;
  final String title;
  final String? description;
  final int order;
  final int amount; // cents
  final double percentage;
  final String status; // pending|in_progress|verification|completed|disputed
  final bool gpsVerified;
  final String? spatialProofId;
  final DateTime? completedAt;
  final DateTime createdAt;

  const ContractMilestone({
    required this.milestoneId,
    required this.contractId,
    required this.title,
    this.description,
    required this.order,
    required this.amount,
    required this.percentage,
    required this.status,
    this.gpsVerified = false,
    this.spatialProofId,
    this.completedAt,
    required this.createdAt,
  });

  factory ContractMilestone.fromJson(Map<String, dynamic> json) {
    return ContractMilestone(
      milestoneId: json['milestone_id'] as String? ?? '',
      contractId: json['contract_id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      description: json['description'] as String?,
      order: (json['milestone_order'] as num?)?.toInt() ?? 0,
      amount: (json['amount'] as num?)?.toInt() ?? 0,
      percentage: (json['percentage'] as num?)?.toDouble() ?? 0.0,
      status: json['status'] as String? ?? 'pending',
      gpsVerified: json['gps_verified'] as bool? ?? false,
      spatialProofId: json['spatial_proof_id'] as String?,
      completedAt: json['completed_at'] != null
          ? DateTime.tryParse(json['completed_at'].toString())
          : null,
      createdAt: DateTime.tryParse(json['created_at']?.toString() ?? '') ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
        'milestone_id': milestoneId,
        'contract_id': contractId,
        'title': title,
        'description': description,
        'milestone_order': order,
        'amount': amount,
        'percentage': percentage,
        'status': status,
        'gps_verified': gpsVerified,
        'spatial_proof_id': spatialProofId,
      };

  bool get isPending => status == 'pending';
  bool get isInProgress => status == 'in_progress';
  bool get isAwaitingVerification => status == 'verification';
  bool get isCompleted => status == 'completed';
  bool get isDisputed => status == 'disputed';

  /// Whether this milestone can accept payments
  bool get isPayable => isInProgress || isAwaitingVerification || isCompleted;

  /// i18n key for the status
  String get statusI18nKey {
    switch (status) {
      case 'pending':
        return 'milestone_pending';
      case 'in_progress':
        return 'milestone_in_progress';
      case 'verification':
        return 'milestone_verification';
      case 'completed':
        return 'milestone_completed';
      case 'disputed':
        return 'milestone_disputed';
      default:
        return 'milestone_pending';
    }
  }
}
