import 'package:equatable/equatable.dart';

// ─── Stats ─────────────────────────────────────────────────────────────────
class HomeownerStatsModel extends Equatable {
  final int activeProjects;
  final int completedProjects;
  final int pendingApprovals;
  final int activeServiceRequests;
  final int totalInvested;
  final int totalBidsReceived;

  const HomeownerStatsModel({
    this.activeProjects = 0,
    this.completedProjects = 0,
    this.pendingApprovals = 0,
    this.activeServiceRequests = 0,
    this.totalInvested = 0,
    this.totalBidsReceived = 0,
  });

  factory HomeownerStatsModel.fromJson(Map<String, dynamic> json) {
    return HomeownerStatsModel(
      activeProjects: (json['active_projects'] as num?)?.toInt() ?? 0,
      completedProjects: (json['completed_projects'] as num?)?.toInt() ?? 0,
      pendingApprovals: (json['pending_approvals'] as num?)?.toInt() ?? 0,
      activeServiceRequests:
          (json['active_service_requests'] as num?)?.toInt() ?? 0,
      totalInvested: (json['total_invested'] as num?)?.toInt() ?? 0,
      totalBidsReceived: (json['total_bids_received'] as num?)?.toInt() ?? 0,
    );
  }

  @override
  List<Object?> get props => [
        activeProjects,
        completedProjects,
        pendingApprovals,
        activeServiceRequests,
        totalInvested,
        totalBidsReceived,
      ];
}

// ─── Project ───────────────────────────────────────────────────────────────
class HomeownerProjectModel extends Equatable {
  final String projectId;
  final String title;
  final String damageType;
  final String status;
  final String? region;
  final String? engineerName;
  final String? contractorName;
  final int bidCount;
  final int totalBoqCost;
  final String createdAt;

  const HomeownerProjectModel({
    required this.projectId,
    required this.title,
    required this.damageType,
    required this.status,
    this.region,
    this.engineerName,
    this.contractorName,
    this.bidCount = 0,
    this.totalBoqCost = 0,
    required this.createdAt,
  });

  factory HomeownerProjectModel.fromJson(Map<String, dynamic> json) {
    return HomeownerProjectModel(
      projectId: json['project_id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      damageType: json['damage_type'] as String? ?? '',
      status: json['status'] as String? ?? '',
      region: json['region'] as String?,
      engineerName: json['engineer_name'] as String?,
      contractorName: json['contractor_name'] as String?,
      bidCount: (json['bid_count'] as num?)?.toInt() ?? 0,
      totalBoqCost: (json['total_boq_cost'] as num?)?.toInt() ?? 0,
      createdAt: json['created_at']?.toString() ?? '',
    );
  }

  @override
  List<Object?> get props => [
        projectId,
        title,
        damageType,
        status,
        region,
        engineerName,
        contractorName,
        bidCount,
        totalBoqCost,
        createdAt,
      ];
}

// ─── Service Request ───────────────────────────────────────────────────────
class HomeownerServiceRequestModel extends Equatable {
  final String requestId;
  final String tradeNeeded;
  final String title;
  final String? description;
  final String? addressText;
  final String urgency;
  final int? budgetMin;
  final int? budgetMax;
  final String status;
  final String? tradespersonName;
  final String? tradespersonTrade;
  final String createdAt;
  final String? matchedAt;

  const HomeownerServiceRequestModel({
    required this.requestId,
    required this.tradeNeeded,
    required this.title,
    this.description,
    this.addressText,
    this.urgency = 'routine',
    this.budgetMin,
    this.budgetMax,
    required this.status,
    this.tradespersonName,
    this.tradespersonTrade,
    required this.createdAt,
    this.matchedAt,
  });

  factory HomeownerServiceRequestModel.fromJson(Map<String, dynamic> json) {
    return HomeownerServiceRequestModel(
      requestId: json['request_id'] as String? ?? '',
      tradeNeeded: json['trade_needed'] as String? ?? '',
      title: json['title'] as String? ?? '',
      description: json['description'] as String?,
      addressText: json['address_text'] as String?,
      urgency: json['urgency'] as String? ?? 'routine',
      budgetMin: (json['budget_min'] as num?)?.toInt(),
      budgetMax: (json['budget_max'] as num?)?.toInt(),
      status: json['status'] as String? ?? '',
      tradespersonName: json['tradesperson_name'] as String?,
      tradespersonTrade: json['tradesperson_trade'] as String?,
      createdAt: json['created_at']?.toString() ?? '',
      matchedAt: json['matched_at']?.toString(),
    );
  }

  @override
  List<Object?> get props => [
        requestId,
        tradeNeeded,
        title,
        description,
        addressText,
        urgency,
        budgetMin,
        budgetMax,
        status,
        tradespersonName,
        tradespersonTrade,
        createdAt,
        matchedAt,
      ];
}

// ─── Approval ──────────────────────────────────────────────────────────────
class HomeownerApprovalModel extends Equatable {
  final String approvalId;
  final String projectId;
  final String projectTitle;
  final String title;
  final String? description;
  final String engineerName;
  final String status;
  final String createdAt;

  const HomeownerApprovalModel({
    required this.approvalId,
    required this.projectId,
    required this.projectTitle,
    required this.title,
    this.description,
    required this.engineerName,
    required this.status,
    required this.createdAt,
  });

  factory HomeownerApprovalModel.fromJson(Map<String, dynamic> json) {
    return HomeownerApprovalModel(
      approvalId: json['approval_id'] as String? ?? '',
      projectId: json['project_id'] as String? ?? '',
      projectTitle: json['project_title'] as String? ?? '',
      title: json['title'] as String? ?? '',
      description: json['description'] as String?,
      engineerName: json['engineer_name'] as String? ?? '',
      status: json['status'] as String? ?? '',
      createdAt: json['created_at']?.toString() ?? '',
    );
  }

  @override
  List<Object?> get props => [
        approvalId,
        projectId,
        projectTitle,
        title,
        description,
        engineerName,
        status,
        createdAt,
      ];
}

// ─── Escrow ────────────────────────────────────────────────────────────────
class HomeownerEscrowModel extends Equatable {
  final int totalDeposited;
  final int totalReleased;
  final int heldInEscrow;
  final int projectsWithEscrow;

  const HomeownerEscrowModel({
    this.totalDeposited = 0,
    this.totalReleased = 0,
    this.heldInEscrow = 0,
    this.projectsWithEscrow = 0,
  });

  factory HomeownerEscrowModel.fromJson(Map<String, dynamic> json) {
    return HomeownerEscrowModel(
      totalDeposited: (json['total_deposited'] as num?)?.toInt() ?? 0,
      totalReleased: (json['total_released'] as num?)?.toInt() ?? 0,
      heldInEscrow: (json['held_in_escrow'] as num?)?.toInt() ?? 0,
      projectsWithEscrow:
          (json['projects_with_escrow'] as num?)?.toInt() ?? 0,
    );
  }

  @override
  List<Object?> get props => [
        totalDeposited,
        totalReleased,
        heldInEscrow,
        projectsWithEscrow,
      ];
}

// ─── Composite Dashboard Model ─────────────────────────────────────────────
class HomeownerDashboardModel extends Equatable {
  final HomeownerStatsModel stats;
  final List<HomeownerProjectModel> projects;
  final List<HomeownerServiceRequestModel> serviceRequests;
  final List<HomeownerApprovalModel> approvals;
  final HomeownerEscrowModel escrow;

  const HomeownerDashboardModel({
    this.stats = const HomeownerStatsModel(),
    this.projects = const [],
    this.serviceRequests = const [],
    this.approvals = const [],
    this.escrow = const HomeownerEscrowModel(),
  });

  HomeownerDashboardModel copyWith({
    HomeownerStatsModel? stats,
    List<HomeownerProjectModel>? projects,
    List<HomeownerServiceRequestModel>? serviceRequests,
    List<HomeownerApprovalModel>? approvals,
    HomeownerEscrowModel? escrow,
  }) {
    return HomeownerDashboardModel(
      stats: stats ?? this.stats,
      projects: projects ?? this.projects,
      serviceRequests: serviceRequests ?? this.serviceRequests,
      approvals: approvals ?? this.approvals,
      escrow: escrow ?? this.escrow,
    );
  }

  @override
  List<Object?> get props =>
      [stats, projects, serviceRequests, approvals, escrow];
}
