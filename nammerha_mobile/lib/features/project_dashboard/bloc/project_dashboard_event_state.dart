import 'package:equatable/equatable.dart';

// ─── Events ────────────────────────────────────────────────────────────────

abstract class ProjectDashboardEvent extends Equatable {
  const ProjectDashboardEvent();

  @override
  List<Object?> get props => [];
}

class LoadProjectDashboard extends ProjectDashboardEvent {
  final String projectId;
  const LoadProjectDashboard(this.projectId);

  @override
  List<Object?> get props => [projectId];
}

class SubmitDailyLog extends ProjectDashboardEvent {
  final String projectId;
  final String description;
  final String? workCompleted;
  final String? issuesEncountered;
  final String? weatherConditions;
  final int? workersOnSite;
  final List<String>? images;

  const SubmitDailyLog({
    required this.projectId,
    required this.description,
    this.workCompleted,
    this.issuesEncountered,
    this.weatherConditions,
    this.workersOnSite,
    this.images,
  });

  @override
  List<Object?> get props => [projectId, description];
}

class CreateApprovalRequest extends ProjectDashboardEvent {
  final String projectId;
  final String title;
  final String? itemId;
  final String? description;
  final String? materialSampleUrl;

  const CreateApprovalRequest({
    required this.projectId,
    required this.title,
    this.itemId,
    this.description,
    this.materialSampleUrl,
  });

  @override
  List<Object?> get props => [projectId, title];
}

class RespondToApproval extends ProjectDashboardEvent {
  final String approvalId;
  final String decision; // 'approved' | 'rejected'
  final String? note;

  const RespondToApproval({
    required this.approvalId,
    required this.decision,
    this.note,
  });

  @override
  List<Object?> get props => [approvalId, decision];
}

// ─── States ────────────────────────────────────────────────────────────────

abstract class ProjectDashboardState extends Equatable {
  const ProjectDashboardState();

  @override
  List<Object?> get props => [];
}

class ProjectDashboardInitial extends ProjectDashboardState {}

class ProjectDashboardLoading extends ProjectDashboardState {}

class ProjectDashboardLoaded extends ProjectDashboardState {
  final Map<String, dynamic> overview;
  final List<Map<String, dynamic>> dailyLogs;

  const ProjectDashboardLoaded({
    required this.overview,
    required this.dailyLogs,
  });

  @override
  List<Object?> get props => [overview, dailyLogs];
}

class DailyLogSubmitting extends ProjectDashboardState {}

class DailyLogSubmitted extends ProjectDashboardState {
  final String message;
  const DailyLogSubmitted(this.message);

  @override
  List<Object?> get props => [message];
}

class ApprovalSubmitting extends ProjectDashboardState {}

class ApprovalSubmitted extends ProjectDashboardState {
  final String message;
  const ApprovalSubmitted(this.message);

  @override
  List<Object?> get props => [message];
}

class ApprovalResponded extends ProjectDashboardState {
  final String decision;
  const ApprovalResponded(this.decision);

  @override
  List<Object?> get props => [decision];
}

class ProjectDashboardError extends ProjectDashboardState {
  final String message;
  const ProjectDashboardError(this.message);

  @override
  List<Object?> get props => [message];
}
