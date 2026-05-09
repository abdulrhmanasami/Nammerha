import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Contractor Portal — Typed Domain Models (Platinum Standard)
// ═══════════════════════════════════════════════════════════════════════════
// Replaces raw `Map<String, dynamic>` usage in the old setState screen.
// Every field uses defensive JSON parsing to prevent runtime exceptions
// when backend contracts evolve.
// ═══════════════════════════════════════════════════════════════════════════

/// KPI statistics for the contractor dashboard header.
class ContractorStatsModel extends Equatable {
  final int activeProjects;
  final int pendingBids;
  final int wonBids;
  final num totalEscrowReceived;
  final int totalBids;
  final double bidWinRate;

  const ContractorStatsModel({
    required this.activeProjects,
    required this.pendingBids,
    required this.wonBids,
    required this.totalEscrowReceived,
    required this.totalBids,
    required this.bidWinRate,
  });

  factory ContractorStatsModel.fromJson(Map<String, dynamic> json) {
    return ContractorStatsModel(
      // New backend keys → old keys as fallback
      activeProjects: json['active_projects'] ?? json['assigned_projects'] ?? 0,
      pendingBids: json['pending_bids'] ?? json['active_bids'] ?? 0,
      wonBids: json['won_bids'] ?? json['completed_projects'] ?? 0,
      totalEscrowReceived: json['total_escrow_received'] ?? json['total_earnings'] ?? 0,
      totalBids: json['total_bids'] ?? 0,
      bidWinRate: (json['bid_win_rate'] ?? 0).toDouble(),
    );
  }

  /// Fallback instance for when the API call fails — prevents null propagation.
  static const empty = ContractorStatsModel(
    activeProjects: 0,
    pendingBids: 0,
    wonBids: 0,
    totalEscrowReceived: 0,
    totalBids: 0,
    bidWinRate: 0.0,
  );

  @override
  List<Object?> get props => [activeProjects, pendingBids, wonBids, totalEscrowReceived, totalBids, bidWinRate];
}

/// A project assigned to or available for the contractor.
class ContractorProjectModel extends Equatable {
  final String projectId;
  final String title;
  final String region;
  final String damageType;
  final String status;
  final String phase;
  final int progress;
  final num totalEstimatedCost;
  final int boqCount;
  final int bidCount;

  const ContractorProjectModel({
    required this.projectId,
    required this.title,
    required this.region,
    required this.damageType,
    required this.status,
    required this.phase,
    required this.progress,
    required this.totalEstimatedCost,
    required this.boqCount,
    required this.bidCount,
  });

  factory ContractorProjectModel.fromJson(Map<String, dynamic> json) {
    return ContractorProjectModel(
      projectId: (json['project_id'] ?? json['projectId'] ?? '').toString(),
      title: json['title']?.toString() ?? '',
      region: json['region']?.toString() ?? '',
      damageType: json['damage_type']?.toString() ?? json['damageType']?.toString() ?? '',
      status: json['status']?.toString() ?? '',
      phase: json['phase']?.toString() ?? '',
      progress: json['progress'] ?? 0,
      totalEstimatedCost: json['total_estimated_cost'] ?? json['totalEstimatedCost'] ?? 0,
      boqCount: json['boq_count'] ?? json['boqCount'] ?? 0,
      bidCount: json['bid_count'] ?? json['bidCount'] ?? 0,
    );
  }

  @override
  List<Object?> get props => [
        projectId, title, region, damageType, status,
        phase, progress, totalEstimatedCost, boqCount, bidCount,
      ];
}

/// A bid submitted by the contractor.
class ContractorBidModel extends Equatable {
  final String bidId;
  final String projectTitle;
  final int proposedCost;
  final int estimatedDays;
  final String status;
  final String createdAt;
  final String? coverLetter;

  const ContractorBidModel({
    required this.bidId,
    required this.projectTitle,
    required this.proposedCost,
    required this.estimatedDays,
    required this.status,
    required this.createdAt,
    this.coverLetter,
  });

  factory ContractorBidModel.fromJson(Map<String, dynamic> json) {
    return ContractorBidModel(
      bidId: (json['bid_id'] ?? json['bidId'] ?? '').toString(),
      projectTitle: json['project_title']?.toString() ?? json['projectTitle']?.toString() ?? '',
      proposedCost: json['proposed_cost'] ?? json['proposedCost'] ?? 0,
      estimatedDays: json['estimated_days'] ?? json['estimatedDays'] ?? 0,
      status: json['status']?.toString() ?? 'pending',
      createdAt: json['created_at']?.toString() ?? json['createdAt']?.toString() ?? '',
      coverLetter: json['cover_letter']?.toString() ?? json['coverLetter']?.toString(),
    );
  }

  @override
  List<Object?> get props => [bidId, projectTitle, proposedCost, estimatedDays, status, createdAt];
}

/// A payment entry for the contractor.
class ContractorPaymentModel extends Equatable {
  final String paymentId;
  final String projectTitle;
  final num amount;
  final String status;
  final String createdAt;

  const ContractorPaymentModel({
    required this.paymentId,
    required this.projectTitle,
    required this.amount,
    required this.status,
    required this.createdAt,
  });

  factory ContractorPaymentModel.fromJson(Map<String, dynamic> json) {
    return ContractorPaymentModel(
      paymentId: (json['transaction_id'] ?? json['payment_id'] ?? json['paymentId'] ?? '').toString(),
      projectTitle: json['project_title']?.toString() ?? json['projectTitle']?.toString() ?? '',
      amount: json['amount'] ?? 0,
      status: json['transaction_type']?.toString() ?? json['status']?.toString() ?? '',
      createdAt: json['created_at']?.toString() ?? json['createdAt']?.toString() ?? '',
    );
  }

  @override
  List<Object?> get props => [paymentId, projectTitle, amount, status, createdAt];
}

/// Aggregated dashboard model — loaded by the repository in a single call.
class ContractorDashboardModel extends Equatable {
  final ContractorStatsModel stats;
  final List<ContractorProjectModel> projects;
  final List<ContractorProjectModel> marketplace;
  final List<ContractorBidModel> bids;
  final List<ContractorPaymentModel> payments;

  const ContractorDashboardModel({
    required this.stats,
    required this.projects,
    required this.marketplace,
    required this.bids,
    required this.payments,
  });

  static const empty = ContractorDashboardModel(
    stats: ContractorStatsModel.empty,
    projects: [],
    marketplace: [],
    bids: [],
    payments: [],
  );

  @override
  List<Object?> get props => [stats, projects, marketplace, bids, payments];
}
