class ProjectModel {
  final String projectId;
  final String title;
  final int totalEstimatedCost;
  final double fundedPercentage;
  final String status;
  final int pendingProofs;

  const ProjectModel({
    required this.projectId,
    required this.title,
    required this.totalEstimatedCost,
    required this.fundedPercentage,
    required this.status,
    required this.pendingProofs,
  });

  factory ProjectModel.fromJson(Map<String, dynamic> json) {
    return ProjectModel(
      projectId: json['projectId'] ?? json['id'] ?? '',
      title: json['title'] ?? '',
      totalEstimatedCost: (json['totalEstimatedCost'] ?? 0).toInt(),
      fundedPercentage: (json['fundedPercentage'] ?? 0).toDouble(),
      status: json['status'] ?? 'قيد التنفيذ',
      pendingProofs: (json['pendingProofs'] ?? 0).toInt(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'projectId': projectId,
      'title': title,
      'totalEstimatedCost': totalEstimatedCost,
      'fundedPercentage': fundedPercentage,
      'status': status,
      'pendingProofs': pendingProofs,
    };
  }
}
