// ═══════════════════════════════════════════════════════════════════════════
// OPEN DATA MODELS — GAP-G03 REMEDIATION
// OCDS-compliant data models for transparency feature
// ═══════════════════════════════════════════════════════════════════════════

/// Platform-wide transparency statistics
class OpenDataStats {
  final int totalProjects;
  final int publishedProjects;
  final int totalFunded;
  final int totalFunders;
  final double averageFundedPercentage;

  OpenDataStats({
    required this.totalProjects,
    required this.publishedProjects,
    required this.totalFunded,
    required this.totalFunders,
    required this.averageFundedPercentage,
  });

  factory OpenDataStats.fromJson(Map<String, dynamic> json) => OpenDataStats(
        totalProjects: json['total_projects'] as int? ?? 0,
        publishedProjects: json['published_projects'] as int? ?? 0,
        totalFunded: json['total_funded'] as int? ?? 0,
        totalFunders: json['total_users'] as int? ?? 0, // Backend contract key
        averageFundedPercentage:
            (json['average_funded_percentage'] as num?)?.toDouble() ?? 0.0,
      );
}

/// OCDS-compliant project card for public transparency
class OCDSProjectCard {
  final String projectId;
  final String title;
  final String status;
  final String damageType;
  final String? region;
  final int totalCost;
  final int totalFunded;
  final double fundedPercentage;
  final int itemsCount;
  final String? publishedAt;

  OCDSProjectCard({
    required this.projectId,
    required this.title,
    required this.status,
    required this.damageType,
    this.region,
    required this.totalCost,
    required this.totalFunded,
    required this.fundedPercentage,
    required this.itemsCount,
    this.publishedAt,
  });

  factory OCDSProjectCard.fromJson(Map<String, dynamic> json) =>
      OCDSProjectCard(
        projectId: json['project_id'] as String? ?? '',
        title: json['title'] as String? ?? '',
        status: json['status'] as String? ?? '',
        damageType: json['damage_type'] as String? ?? '',
        region: json['region'] as String?,
        totalCost: json['total_cost'] as int? ?? 0,
        totalFunded: json['total_funded'] as int? ?? 0,
        fundedPercentage:
            (json['funded_percentage'] as num?)?.toDouble() ?? 0.0,
        itemsCount: json['items_count'] as int? ?? 0,
        publishedAt: json['published_at'] as String?,
      );
}
