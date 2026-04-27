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
  final int assignedProjects;
  final int activeBids;
  final int completedProjects;
  final num totalEarnings;

  const ContractorStatsModel({
    required this.assignedProjects,
    required this.activeBids,
    required this.completedProjects,
    required this.totalEarnings,
  });

  factory ContractorStatsModel.fromJson(Map<String, dynamic> json) {
    return ContractorStatsModel(
      assignedProjects: json['assigned_projects'] ?? json['assignedProjects'] ?? 0,
      activeBids: json['active_bids'] ?? json['activeBids'] ?? 0,
      completedProjects: json['completed_projects'] ?? json['completedProjects'] ?? 0,
      totalEarnings: json['total_earnings'] ?? json['totalEarnings'] ?? 0,
    );
  }

  /// Fallback instance for when the API call fails — prevents null propagation.
  static const empty = ContractorStatsModel(
    assignedProjects: 0,
    activeBids: 0,
    completedProjects: 0,
    totalEarnings: 0,
  );

  @override
  List<Object?> get props => [assignedProjects, activeBids, completedProjects, totalEarnings];
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
      paymentId: (json['payment_id'] ?? json['paymentId'] ?? '').toString(),
      projectTitle: json['project_title']?.toString() ?? json['projectTitle']?.toString() ?? '',
      amount: json['amount'] ?? 0,
      status: json['status']?.toString() ?? '',
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
