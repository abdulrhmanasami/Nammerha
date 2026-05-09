import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Tradesperson Portal — Typed Domain Models (Platinum Standard)
// ═══════════════════════════════════════════════════════════════════════════
// Replaces raw `Map<String, dynamic>` usage. Every field uses defensive
// JSON parsing to prevent runtime exceptions when backend contracts evolve.
// Field names mirror backend tradesperson.service.ts responses exactly.
// ═══════════════════════════════════════════════════════════════════════════

/// KPI statistics for the tradesperson dashboard header.
/// Mirrors backend TradespersonStats type.
class TradespersonStatsModel extends Equatable {
  final int activeJobs;
  final int completedJobs;
  final int pendingRequests;
  final int activeAssignments;
  final num totalEarnings;
  final double? averageRating;

  const TradespersonStatsModel({
    required this.activeJobs,
    required this.completedJobs,
    required this.pendingRequests,
    required this.activeAssignments,
    required this.totalEarnings,
    this.averageRating,
  });

  factory TradespersonStatsModel.fromJson(Map<String, dynamic> json) {
    return TradespersonStatsModel(
      activeJobs: json['active_jobs'] ?? json['activeJobs'] ?? 0,
      completedJobs: json['completed_jobs'] ?? json['completedJobs'] ?? 0,
      pendingRequests: json['pending_requests'] ?? json['pendingRequests'] ?? 0,
      activeAssignments: json['active_assignments'] ?? json['activeAssignments'] ?? 0,
      totalEarnings: json['total_earnings'] ?? json['totalEarnings'] ?? 0,
      averageRating: json['average_rating'] != null
          ? (json['average_rating'] as num).toDouble()
          : null,
    );
  }

  static const empty = TradespersonStatsModel(
    activeJobs: 0,
    completedJobs: 0,
    pendingRequests: 0,
    activeAssignments: 0,
    totalEarnings: 0,
  );

  @override
  List<Object?> get props => [activeJobs, completedJobs, pendingRequests, activeAssignments, totalEarnings, averageRating];
}

/// Trade profile with rates, specialty, and dynamic score.
/// Mirrors backend TradespersonProfile type.
class TradespersonProfileModel extends Equatable {
  final String userId;
  final String fullName;
  final String? trade;
  final List<String>? secondaryTrades;
  final num? hourlyRate;
  final num? dailyRate;
  final String availability;
  final int? yearsExperience;
  final int completedJobsCount;
  final double? averageRating;
  final double dynamicScore;
  final String? specialty;

  const TradespersonProfileModel({
    required this.userId,
    required this.fullName,
    this.trade,
    this.secondaryTrades,
    this.hourlyRate,
    this.dailyRate,
    required this.availability,
    this.yearsExperience,
    required this.completedJobsCount,
    this.averageRating,
    required this.dynamicScore,
    this.specialty,
  });

  factory TradespersonProfileModel.fromJson(Map<String, dynamic> json) {
    return TradespersonProfileModel(
      userId: (json['user_id'] ?? json['userId'] ?? '').toString(),
      fullName: json['full_name']?.toString() ?? json['fullName']?.toString() ?? '',
      trade: json['trade']?.toString(),
      secondaryTrades: json['secondary_trades'] != null
          ? (json['secondary_trades'] as List<dynamic>).map((e) => e.toString()).toList()
          : null,
      hourlyRate: json['hourly_rate'] ?? json['hourlyRate'],
      dailyRate: json['daily_rate'] ?? json['dailyRate'],
      availability: json['availability']?.toString() ?? 'offline',
      yearsExperience: json['years_experience'] ?? json['yearsExperience'],
      completedJobsCount: json['completed_jobs_count'] ?? json['completedJobsCount'] ?? 0,
      averageRating: json['average_rating'] != null
          ? (json['average_rating'] as num).toDouble()
          : null,
      dynamicScore: (json['dynamic_score'] ?? json['dynamicScore'] ?? 0).toDouble(),
      specialty: json['specialty']?.toString(),
    );
  }

  static const empty = TradespersonProfileModel(
    userId: '',
    fullName: '',
    availability: 'offline',
    completedJobsCount: 0,
    dynamicScore: 0,
  );

  @override
  List<Object?> get props => [userId, fullName, trade, availability, dynamicScore, averageRating, completedJobsCount];
}

/// Homeowner service request (Thumbtack mode).
/// Mirrors backend ServiceRequest type.
class ServiceRequestModel extends Equatable {
  final String requestId;
  final String homeownerName;
  final String tradeNeeded;
  final String title;
  final String? description;
  final String? addressText;
  final String urgency;
  final num? budgetMin;
  final num? budgetMax;
  final String status;
  final String createdAt;

  const ServiceRequestModel({
    required this.requestId,
    required this.homeownerName,
    required this.tradeNeeded,
    required this.title,
    this.description,
    this.addressText,
    required this.urgency,
    this.budgetMin,
    this.budgetMax,
    required this.status,
    required this.createdAt,
  });

  factory ServiceRequestModel.fromJson(Map<String, dynamic> json) {
    return ServiceRequestModel(
      requestId: (json['request_id'] ?? json['requestId'] ?? '').toString(),
      homeownerName: json['homeowner_name']?.toString() ?? json['homeownerName']?.toString() ?? '',
      tradeNeeded: json['trade_needed']?.toString() ?? json['tradeNeeded']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      description: json['description']?.toString(),
      addressText: json['address_text']?.toString() ?? json['addressText']?.toString(),
      urgency: json['urgency']?.toString() ?? 'routine',
      budgetMin: json['budget_min'] ?? json['budgetMin'],
      budgetMax: json['budget_max'] ?? json['budgetMax'],
      status: json['status']?.toString() ?? 'open',
      createdAt: json['created_at']?.toString() ?? json['createdAt']?.toString() ?? '',
    );
  }

  @override
  List<Object?> get props => [requestId, title, status, urgency, createdAt];
}

/// Contractor trade assignment (Subcontractor mode).
/// Mirrors backend TradeAssignment type.
class TradeAssignmentModel extends Equatable {
  final String assignmentId;
  final String contractorName;
  final String projectTitle;
  final String tradeRequired;
  final String scopeDescription;
  final num agreedRate;
  final String rateType;
  final int? estimatedDays;
  final String status;
  final String? startDate;
  final String? endDate;
  final String createdAt;

  const TradeAssignmentModel({
    required this.assignmentId,
    required this.contractorName,
    required this.projectTitle,
    required this.tradeRequired,
    required this.scopeDescription,
    required this.agreedRate,
    required this.rateType,
    this.estimatedDays,
    required this.status,
    this.startDate,
    this.endDate,
    required this.createdAt,
  });

  factory TradeAssignmentModel.fromJson(Map<String, dynamic> json) {
    return TradeAssignmentModel(
      assignmentId: (json['assignment_id'] ?? json['assignmentId'] ?? '').toString(),
      contractorName: json['contractor_name']?.toString() ?? json['contractorName']?.toString() ?? '',
      projectTitle: json['project_title']?.toString() ?? json['projectTitle']?.toString() ?? '',
      tradeRequired: json['trade_required']?.toString() ?? json['tradeRequired']?.toString() ?? '',
      scopeDescription: json['scope_description']?.toString() ?? json['scopeDescription']?.toString() ?? '',
      agreedRate: json['agreed_rate'] ?? json['agreedRate'] ?? 0,
      rateType: json['rate_type']?.toString() ?? json['rateType']?.toString() ?? 'daily',
      estimatedDays: json['estimated_days'] ?? json['estimatedDays'],
      status: json['status']?.toString() ?? 'pending',
      startDate: json['start_date']?.toString() ?? json['startDate']?.toString(),
      endDate: json['end_date']?.toString() ?? json['endDate']?.toString(),
      createdAt: json['created_at']?.toString() ?? json['createdAt']?.toString() ?? '',
    );
  }

  @override
  List<Object?> get props => [assignmentId, projectTitle, status, agreedRate, rateType, createdAt];
}

/// Earnings record from completed work (both modes).
/// Mirrors backend EarningRecord type.
class EarningRecordModel extends Equatable {
  final String sourceType;
  final String sourceId;
  final String title;
  final num amount;
  final String? rateType;
  final String status;
  final String? completedAt;

  const EarningRecordModel({
    required this.sourceType,
    required this.sourceId,
    required this.title,
    required this.amount,
    this.rateType,
    required this.status,
    this.completedAt,
  });

  factory EarningRecordModel.fromJson(Map<String, dynamic> json) {
    return EarningRecordModel(
      sourceType: json['source_type']?.toString() ?? json['sourceType']?.toString() ?? 'assignment',
      sourceId: (json['source_id'] ?? json['sourceId'] ?? '').toString(),
      title: json['title']?.toString() ?? '',
      amount: json['amount'] ?? 0,
      rateType: json['rate_type']?.toString() ?? json['rateType']?.toString(),
      status: json['status']?.toString() ?? '',
      completedAt: json['completed_at']?.toString() ?? json['completedAt']?.toString(),
    );
  }

  @override
  List<Object?> get props => [sourceType, sourceId, title, amount, status, completedAt];
}

/// Aggregated dashboard model — loaded by the repository.
class TradespersonDashboardModel extends Equatable {
  final TradespersonStatsModel stats;
  final TradespersonProfileModel profile;
  final List<ServiceRequestModel> requests;
  final List<TradeAssignmentModel> assignments;
  final List<EarningRecordModel> earnings;
  final String availability;

  const TradespersonDashboardModel({
    this.stats = TradespersonStatsModel.empty,
    this.profile = TradespersonProfileModel.empty,
    this.requests = const [],
    this.assignments = const [],
    this.earnings = const [],
    this.availability = 'offline',
  });

  TradespersonDashboardModel copyWith({
    TradespersonStatsModel? stats,
    TradespersonProfileModel? profile,
    List<ServiceRequestModel>? requests,
    List<TradeAssignmentModel>? assignments,
    List<EarningRecordModel>? earnings,
    String? availability,
  }) {
    return TradespersonDashboardModel(
      stats: stats ?? this.stats,
      profile: profile ?? this.profile,
      requests: requests ?? this.requests,
      assignments: assignments ?? this.assignments,
      earnings: earnings ?? this.earnings,
      availability: availability ?? this.availability,
    );
  }

  @override
  List<Object?> get props => [stats, profile, requests, assignments, earnings, availability];
}
