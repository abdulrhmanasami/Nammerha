import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/network/api_client.dart';
import '../../../core/services/project_dashboard_api.dart';
import 'project_dashboard_event_state.dart';

/// Project Dashboard BLoC — manages daily logs, approvals, and project KPIs.
///
/// This BLoC bridges the mobile app to the per-project management dashboard
/// that was previously web-only (GAP-C6).
class ProjectDashboardBloc
    extends Bloc<ProjectDashboardEvent, ProjectDashboardState> {
  final ProjectDashboardApi _api;

  ProjectDashboardBloc({ProjectDashboardApi? api})
      : _api = api ?? ProjectDashboardApi(),
        super(ProjectDashboardInitial()) {
    on<LoadProjectDashboard>(_onLoad);
    on<SubmitDailyLog>(_onSubmitLog);
    on<CreateApprovalRequest>(_onCreateApproval);
    on<RespondToApproval>(_onRespondToApproval);
  }

  Future<void> _onLoad(
    LoadProjectDashboard event,
    Emitter<ProjectDashboardState> emit,
  ) async {
    emit(ProjectDashboardLoading());
    try {
      final results = await Future.wait([
        _api.getOverview(event.projectId),
        _api.getDailyLogs(event.projectId),
      ]);

      emit(ProjectDashboardLoaded(
        overview: results[0] as Map<String, dynamic>,
        dailyLogs: results[1] as List<Map<String, dynamic>>,
      ));
    } on ApiException catch (e) {
      emit(ProjectDashboardError(e.message));
    } catch (e) {
      emit(ProjectDashboardError('فشل تحميل لوحة المشروع: $e'));
    }
  }

  Future<void> _onSubmitLog(
    SubmitDailyLog event,
    Emitter<ProjectDashboardState> emit,
  ) async {
    emit(DailyLogSubmitting());
    try {
      await _api.submitLog(
        event.projectId,
        description: event.description,
        workCompleted: event.workCompleted,
        issuesEncountered: event.issuesEncountered,
        weatherConditions: event.weatherConditions,
        workersOnSite: event.workersOnSite,
        images: event.images,
      );
      emit(const DailyLogSubmitted('تم إرسال السجل اليومي بنجاح'));
      // Reload dashboard after submission
      add(LoadProjectDashboard(event.projectId));
    } on ApiException catch (e) {
      emit(ProjectDashboardError(e.message));
    } catch (e) {
      emit(ProjectDashboardError('فشل إرسال السجل: $e'));
    }
  }

  Future<void> _onCreateApproval(
    CreateApprovalRequest event,
    Emitter<ProjectDashboardState> emit,
  ) async {
    emit(ApprovalSubmitting());
    try {
      await _api.createApproval(
        event.projectId,
        title: event.title,
        itemId: event.itemId,
        description: event.description,
        materialSampleUrl: event.materialSampleUrl,
      );
      emit(const ApprovalSubmitted('تم إرسال طلب الموافقة بنجاح'));
      add(LoadProjectDashboard(event.projectId));
    } on ApiException catch (e) {
      emit(ProjectDashboardError(e.message));
    } catch (e) {
      emit(ProjectDashboardError('فشل إرسال طلب الموافقة: $e'));
    }
  }

  Future<void> _onRespondToApproval(
    RespondToApproval event,
    Emitter<ProjectDashboardState> emit,
  ) async {
    try {
      await _api.respondToApproval(
        event.approvalId,
        decision: event.decision,
        note: event.note,
      );
      emit(ApprovalResponded(event.decision));
    } on ApiException catch (e) {
      emit(ProjectDashboardError(e.message));
    } catch (e) {
      emit(ProjectDashboardError('فشل الاستجابة لطلب الموافقة: $e'));
    }
  }
}
