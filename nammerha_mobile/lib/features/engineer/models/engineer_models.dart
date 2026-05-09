import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Engineer Portal — Typed Domain Models (Platinum Standard)
// ═══════════════════════════════════════════════════════════════════════════
// Mirrors ContractorModels pattern: Equatable, defensive JSON parsing,
// static .empty fallback for network resilience.
// ═══════════════════════════════════════════════════════════════════════════

/// KPI statistics for the engineer dashboard header.
class EngineerStatsModel extends Equatable {
  final int assignedProjects;
  final int proofsPending;
  final int proofsVerified;
  final num escrowReleased;
  final int activeBids;
  final int totalBids;

  const EngineerStatsModel({
    required this.assignedProjects,
    required this.proofsPending,
    required this.proofsVerified,
    required this.escrowReleased,
    required this.activeBids,
    required this.totalBids,
  });

  factory EngineerStatsModel.fromJson(Map<String, dynamic> json) {
    return EngineerStatsModel(
      assignedProjects: json['assigned_projects'] ?? json['assignedProjects'] ?? 0,
      proofsPending: json['proofs_pending'] ?? json['proofsPending'] ?? 0,
      proofsVerified: json['proofs_verified'] ?? json['proofsVerified'] ?? 0,
      escrowReleased: json['escrow_released'] ?? json['escrowReleased'] ?? 0,
      activeBids: json['active_bids'] ?? json['activeBids'] ?? 0,
      totalBids: json['total_bids'] ?? json['totalBids'] ?? 0,
    );
  }

  static const empty = EngineerStatsModel(
    assignedProjects: 0,
    proofsPending: 0,
    proofsVerified: 0,
    escrowReleased: 0,
    activeBids: 0,
    totalBids: 0,
  );

  @override
  List<Object?> get props => [assignedProjects, proofsPending, proofsVerified, escrowReleased, activeBids, totalBids];
}

/// A project assigned to the engineer for supervision.
class EngineerProjectModel extends Equatable {
  final String projectId;
  final String title;
  final String region;
  final String status;
  final String phase;
  final int progress;
  final int boqCount;
  final String? nextProofDue;
  final String createdAt;

  const EngineerProjectModel({
    required this.projectId,
    required this.title,
    required this.region,
    required this.status,
    required this.phase,
    required this.progress,
    required this.boqCount,
    this.nextProofDue,
    required this.createdAt,
  });

  factory EngineerProjectModel.fromJson(Map<String, dynamic> json) {
    return EngineerProjectModel(
      projectId: (json['project_id'] ?? json['projectId'] ?? '').toString(),
      title: json['title']?.toString() ?? '',
      region: json['region']?.toString() ?? '',
      status: json['status']?.toString() ?? '',
      phase: json['phase']?.toString() ?? '',
      progress: json['progress'] ?? 0,
      boqCount: json['boq_count'] ?? json['boqCount'] ?? 0,
      nextProofDue: json['next_proof_due']?.toString() ?? json['nextProofDue']?.toString(),
      createdAt: json['created_at']?.toString() ?? json['createdAt']?.toString() ?? '',
    );
  }

  @override
  List<Object?> get props => [projectId, title, region, status, phase, progress, boqCount, createdAt];
}

/// A bid submitted by the engineer.
class EngineerBidModel extends Equatable {
  final String bidId;
  final String projectTitle;
  final int proposedCost;
  final int estimatedDays;
  final String status;
  final String submittedAt;
  final String? coverLetter;

  const EngineerBidModel({
    required this.bidId,
    required this.projectTitle,
    required this.proposedCost,
    required this.estimatedDays,
    required this.status,
    required this.submittedAt,
    this.coverLetter,
  });

  factory EngineerBidModel.fromJson(Map<String, dynamic> json) {
    return EngineerBidModel(
      bidId: (json['bid_id'] ?? json['bidId'] ?? '').toString(),
      projectTitle: json['project_title']?.toString() ?? json['projectTitle']?.toString() ?? '',
      proposedCost: json['proposed_cost'] ?? json['proposedCost'] ?? 0,
      estimatedDays: json['estimated_days'] ?? json['estimatedDays'] ?? 0,
      status: json['status']?.toString() ?? 'pending',
      submittedAt: json['submitted_at']?.toString() ?? json['submittedAt']?.toString() ?? '',
      coverLetter: json['cover_letter']?.toString() ?? json['coverLetter']?.toString(),
    );
  }

  @override
  List<Object?> get props => [bidId, projectTitle, proposedCost, estimatedDays, status, submittedAt];
}

/// A reality capture taken by the engineer.
class EngineerCaptureModel extends Equatable {
  final String captureId;
  final String projectTitle;
  final String captureType;
  final String constructionPhase;
  final String? title;
  final String fileUrl;
  final bool isVerified;
  final String capturedAt;

  const EngineerCaptureModel({
    required this.captureId,
    required this.projectTitle,
    required this.captureType,
    required this.constructionPhase,
    this.title,
    required this.fileUrl,
    required this.isVerified,
    required this.capturedAt,
  });

  factory EngineerCaptureModel.fromJson(Map<String, dynamic> json) {
    return EngineerCaptureModel(
      captureId: (json['capture_id'] ?? json['captureId'] ?? '').toString(),
      projectTitle: json['project_title']?.toString() ?? json['projectTitle']?.toString() ?? '',
      captureType: json['capture_type']?.toString() ?? json['captureType']?.toString() ?? 'photo',
      constructionPhase: json['construction_phase']?.toString() ?? json['constructionPhase']?.toString() ?? '',
      title: json['title']?.toString(),
      fileUrl: json['file_url']?.toString() ?? json['fileUrl']?.toString() ?? '',
      isVerified: json['is_verified'] ?? json['isVerified'] ?? false,
      capturedAt: json['captured_at']?.toString() ?? json['capturedAt']?.toString() ?? '',
    );
  }

  @override
  List<Object?> get props => [captureId, projectTitle, captureType, isVerified, capturedAt];
}

/// Aggregated dashboard model — loaded by the repository in a single call.
class EngineerDashboardModel extends Equatable {
  final EngineerStatsModel stats;
  final List<EngineerProjectModel> projects;
  final List<EngineerBidModel> bids;
  final List<EngineerCaptureModel> captures;

  const EngineerDashboardModel({
    required this.stats,
    required this.projects,
    required this.bids,
    required this.captures,
  });

  static const empty = EngineerDashboardModel(
    stats: EngineerStatsModel.empty,
    projects: [],
    bids: [],
    captures: [],
  );

  @override
  List<Object?> get props => [stats, projects, bids, captures];
}
