import 'package:equatable/equatable.dart';

// ── Typed Donor Stats ──────────────────────────────────────────────────────
class DonorStatsModel extends Equatable {
  final int totalDonated;
  final int projectsSupported;
  final int itemsFunded;
  final int escrowLocked;
  final int escrowReleased;
  final int impactScore;

  const DonorStatsModel({
    this.totalDonated = 0,
    this.projectsSupported = 0,
    this.itemsFunded = 0,
    this.escrowLocked = 0,
    this.escrowReleased = 0,
    this.impactScore = 0,
  });

  factory DonorStatsModel.fromJson(Map<String, dynamic> json) {
    return DonorStatsModel(
      totalDonated: (json['total_donated'] as num?)?.toInt() ?? 0,
      projectsSupported: (json['projects_supported'] as num?)?.toInt() ?? 0,
      itemsFunded: (json['items_funded'] as num?)?.toInt() ?? 0,
      escrowLocked: (json['escrow_locked'] as num?)?.toInt() ?? 0,
      escrowReleased: (json['escrow_released'] as num?)?.toInt() ?? 0,
      impactScore: (json['impact_score'] as num?)?.toInt() ?? 0,
    );
  }

  @override
  List<Object?> get props => [totalDonated, projectsSupported, itemsFunded, escrowLocked, escrowReleased, impactScore];
}

// ── Typed Donation Entry ───────────────────────────────────────────────────
class DonorDonationModel extends Equatable {
  final String escrowId;
  final String projectTitle;
  final String materialName;
  final int amountLocked;
  final String status;
  final String lockedAt;

  const DonorDonationModel({
    required this.escrowId,
    required this.projectTitle,
    required this.materialName,
    required this.amountLocked,
    required this.status,
    required this.lockedAt,
  });

  factory DonorDonationModel.fromJson(Map<String, dynamic> json) {
    return DonorDonationModel(
      escrowId: json['escrow_id'] as String? ?? '',
      projectTitle: json['project_title'] as String? ?? '',
      materialName: json['material_name'] as String? ?? '',
      amountLocked: (json['amount_locked'] as num?)?.toInt() ?? 0,
      status: json['payment_status'] as String? ?? json['status'] as String? ?? 'unknown',
      lockedAt: json['locked_at'] as String? ?? '',
    );
  }

  @override
  List<Object?> get props => [escrowId, projectTitle, materialName, amountLocked, status, lockedAt];
}

// ── Typed Funded Project ───────────────────────────────────────────────────
class DonorFundedProjectModel extends Equatable {
  final String projectId;
  final String title;
  final String damageType;
  final String? region;
  final String status;
  final int myTotalDonated;
  final double fundedPercentage;
  final int itemsIFunded;

  const DonorFundedProjectModel({
    required this.projectId,
    required this.title,
    required this.damageType,
    this.region,
    required this.status,
    required this.myTotalDonated,
    required this.fundedPercentage,
    required this.itemsIFunded,
  });

  factory DonorFundedProjectModel.fromJson(Map<String, dynamic> json) {
    return DonorFundedProjectModel(
      projectId: json['project_id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      damageType: json['damage_type'] as String? ?? '',
      region: json['region'] as String?,
      status: json['status'] as String? ?? 'unknown',
      myTotalDonated: (json['my_total_donated'] as num?)?.toInt() ?? 0,
      fundedPercentage: (json['funded_percentage'] as num?)?.toDouble() ?? 0.0,
      itemsIFunded: (json['items_i_funded'] as num?)?.toInt() ?? 0,
    );
  }

  @override
  List<Object?> get props => [projectId, title, damageType, region, status, myTotalDonated, fundedPercentage, itemsIFunded];
}

// ── Typed Marketplace Project ──────────────────────────────────────────────
class DonorMarketplaceProjectModel extends Equatable {
  final String projectId;
  final String title;
  final String damageType;
  final String? region;
  final int totalCost;
  final int totalFunded;
  final double fundedPercentage;
  final int itemsCount;

  const DonorMarketplaceProjectModel({
    required this.projectId,
    required this.title,
    required this.damageType,
    this.region,
    required this.totalCost,
    required this.totalFunded,
    required this.fundedPercentage,
    required this.itemsCount,
  });

  factory DonorMarketplaceProjectModel.fromJson(Map<String, dynamic> json) {
    return DonorMarketplaceProjectModel(
      projectId: json['project_id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      damageType: json['damage_type'] as String? ?? '',
      region: json['region'] as String?,
      totalCost: (json['total_cost'] as num?)?.toInt() ?? 0,
      totalFunded: (json['total_funded'] as num?)?.toInt() ?? 0,
      fundedPercentage: (json['funded_percentage'] as num?)?.toDouble() ?? 0.0,
      itemsCount: (json['items_count'] as num?)?.toInt() ?? 0,
    );
  }

  @override
  List<Object?> get props => [projectId, title, damageType, region, totalCost, totalFunded, fundedPercentage, itemsCount];
}

// ── Typed Proof Entry ──────────────────────────────────────────────────────
class DonorProofModel extends Equatable {
  final String proofId;
  final String projectTitle;
  final String? materialName;
  final String? photoUrl;
  final double? gpsLat;
  final double? gpsLng;
  final String? verifiedBy;
  final String? verifiedAt;
  final String? description;

  const DonorProofModel({
    required this.proofId,
    required this.projectTitle,
    this.materialName,
    this.photoUrl,
    this.gpsLat,
    this.gpsLng,
    this.verifiedBy,
    this.verifiedAt,
    this.description,
  });

  factory DonorProofModel.fromJson(Map<String, dynamic> json) {
    return DonorProofModel(
      proofId: json['proof_id'] as String? ?? '',
      projectTitle: json['project_title'] as String? ?? '',
      materialName: json['material_name'] as String?,
      photoUrl: json['photo_url'] as String?,
      gpsLat: (json['gps_lat'] as num?)?.toDouble(),
      gpsLng: (json['gps_lng'] as num?)?.toDouble(),
      verifiedBy: json['verified_by'] as String?,
      verifiedAt: json['verified_at'] as String?,
      description: json['description'] as String?,
    );
  }

  @override
  List<Object?> get props => [proofId, projectTitle, materialName, photoUrl, gpsLat, gpsLng, verifiedBy, verifiedAt, description];
}

// ── Dashboard Aggregate Model ──────────────────────────────────────────────
class DonorDashboardModel extends Equatable {
  final DonorStatsModel stats;
  final List<DonorFundedProjectModel> fundedProjects;
  final List<DonorMarketplaceProjectModel> marketplace;
  final List<DonorDonationModel> donations;
  final List<DonorFundedProjectModel> impact;
  final List<DonorProofModel> proofs;

  const DonorDashboardModel({
    this.stats = const DonorStatsModel(),
    this.fundedProjects = const [],
    this.marketplace = const [],
    this.donations = const [],
    this.impact = const [],
    this.proofs = const [],
  });

  DonorDashboardModel copyWith({
    DonorStatsModel? stats,
    List<DonorFundedProjectModel>? fundedProjects,
    List<DonorMarketplaceProjectModel>? marketplace,
    List<DonorDonationModel>? donations,
    List<DonorFundedProjectModel>? impact,
    List<DonorProofModel>? proofs,
  }) {
    return DonorDashboardModel(
      stats: stats ?? this.stats,
      fundedProjects: fundedProjects ?? this.fundedProjects,
      marketplace: marketplace ?? this.marketplace,
      donations: donations ?? this.donations,
      impact: impact ?? this.impact,
      proofs: proofs ?? this.proofs,
    );
  }

  @override
  List<Object?> get props => [stats, fundedProjects, marketplace, donations, impact, proofs];
}
