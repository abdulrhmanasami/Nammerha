import 'package:equatable/equatable.dart';

class ProjectModel extends Equatable {
  final String id;
  final String title;
  final String damageType;
  final String addressText;
  final double fundedPercentage;
  final num totalEstimatedCost;
  final String status;

  const ProjectModel({
    required this.id,
    required this.title,
    required this.damageType,
    required this.addressText,
    required this.fundedPercentage,
    required this.totalEstimatedCost,
    required this.status,
  });

  factory ProjectModel.fromJson(Map<String, dynamic> json) {
    return ProjectModel(
      id: (json['project_id'] ?? json['projectId'] ?? '').toString(),
      title: json['title']?.toString() ?? 'مشروع بدون عنوان',
      damageType: json['damage_type']?.toString() ?? json['damageType']?.toString() ?? 'غير محدد',
      addressText: json['address_text']?.toString() ?? json['addressText']?.toString() ?? 'العنوان غير مدرج',
      fundedPercentage: (json['funded_percentage'] ?? json['fundedPercentage'] ?? 0.0 as num).toDouble(),
      totalEstimatedCost: json['total_estimated_cost'] ?? json['totalEstimatedCost'] ?? 0,
      status: json['status']?.toString() ?? 'ACTIVE',
    );
  }

  @override
  List<Object?> get props => [
        id,
        title,
        damageType,
        addressText,
        fundedPercentage,
        totalEstimatedCost,
        status,
      ];
}
