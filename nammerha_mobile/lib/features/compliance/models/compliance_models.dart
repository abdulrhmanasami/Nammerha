import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Compliance Dashboard — Typed Domain Models (Platinum Standard)
// ═══════════════════════════════════════════════════════════════════════════
// NEW: Compliance was completely missing from the mobile app.
// ═══════════════════════════════════════════════════════════════════════════

/// Dashboard KPIs for the compliance officer.
class ComplianceStatsModel extends Equatable {
  final int totalAudited;
  final int pendingReviews;
  final int flaggedIssues;
  final int resolvedThisMonth;
  final double complianceRate;
  final double spatialAccuracy;

  const ComplianceStatsModel({
    required this.totalAudited,
    required this.pendingReviews,
    required this.flaggedIssues,
    required this.resolvedThisMonth,
    required this.complianceRate,
    required this.spatialAccuracy,
  });

  factory ComplianceStatsModel.fromJson(Map<String, dynamic> json) {
    return ComplianceStatsModel(
      totalAudited: json['total_audited'] ?? json['totalAudited'] ?? 0,
      pendingReviews: json['pending_reviews'] ?? json['pendingReviews'] ?? 0,
      flaggedIssues: json['flagged_issues'] ?? json['flaggedIssues'] ?? 0,
      resolvedThisMonth: json['resolved_this_month'] ?? json['resolvedThisMonth'] ?? 0,
      complianceRate: _toDouble(json['compliance_rate'] ?? json['complianceRate']),
      spatialAccuracy: _toDouble(json['spatial_accuracy'] ?? json['spatialAccuracy']),
    );
  }

  static const empty = ComplianceStatsModel(
    totalAudited: 0,
    pendingReviews: 0,
    flaggedIssues: 0,
    resolvedThisMonth: 0,
    complianceRate: 0.0,
    spatialAccuracy: 0.0,
  );

  @override
  List<Object?> get props => [
        totalAudited, pendingReviews, flaggedIssues,
        resolvedThisMonth, complianceRate, spatialAccuracy,
      ];
}

/// A single escrow review item in the compliance queue.
class EscrowReviewModel extends Equatable {
  final String reference;
  final String projectTitle;
  final String materialName;
  final num amount;
  final String status;
  final String proofImageUrl;
  final double? gpsLat;
  final double? gpsLng;
  final double? gpsAccuracy;
  final String submittedAt;
  final String? verifiedBy;

  const EscrowReviewModel({
    required this.reference,
    required this.projectTitle,
    required this.materialName,
    required this.amount,
    required this.status,
    required this.proofImageUrl,
    this.gpsLat,
    this.gpsLng,
    this.gpsAccuracy,
    required this.submittedAt,
    this.verifiedBy,
  });

  factory EscrowReviewModel.fromJson(Map<String, dynamic> json) {
    return EscrowReviewModel(
      reference: (json['reference'] ?? json['proof_id'] ?? '').toString(),
      projectTitle: json['project_title']?.toString() ?? '',
      materialName: json['material_name']?.toString() ?? '',
      amount: json['amount'] ?? 0,
      status: json['status']?.toString() ?? 'pending',
      proofImageUrl: json['proof_image_url']?.toString() ?? json['photo_url']?.toString() ?? '',
      gpsLat: _toDoubleOrNull(json['gps_lat']),
      gpsLng: _toDoubleOrNull(json['gps_lng']),
      gpsAccuracy: _toDoubleOrNull(json['gps_accuracy_meters']),
      submittedAt: json['submitted_at']?.toString() ?? json['created_at']?.toString() ?? '',
      verifiedBy: json['verified_by']?.toString(),
    );
  }

  @override
  List<Object?> get props => [reference, status, amount];
}

/// Aggregated dashboard model for the compliance screen.
class ComplianceDashboardModel extends Equatable {
  final ComplianceStatsModel stats;
  final List<EscrowReviewModel> reviews;

  const ComplianceDashboardModel({
    required this.stats,
    required this.reviews,
  });

  static const empty = ComplianceDashboardModel(
    stats: ComplianceStatsModel.empty,
    reviews: [],
  );

  @override
  List<Object?> get props => [stats, reviews];
}

// ─── Numeric Helpers ────────────────────────────────────────────────────

double _toDouble(dynamic value) {
  if (value == null) return 0.0;
  if (value is double) return value;
  if (value is int) return value.toDouble();
  return double.tryParse(value.toString()) ?? 0.0;
}

double? _toDoubleOrNull(dynamic value) {
  if (value == null) return null;
  return _toDouble(value);
}
