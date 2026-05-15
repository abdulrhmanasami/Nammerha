import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/compliance_repository.dart';
import '../../../core/i18n/error_keys.dart';
import 'compliance_event.dart';
import 'compliance_state.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Compliance BLoC — Business Logic (Platinum Standard)
// ═══════════════════════════════════════════════════════════════════════════

class ComplianceBloc extends Bloc<ComplianceEvent, ComplianceState> {
  final ComplianceRepository repository;

  ComplianceBloc({required this.repository}) : super(ComplianceInitial()) {
    on<LoadComplianceDashboard>(_onLoadDashboard);
    on<ApproveEscrowReview>(_onApproveReview);
    on<FlagEscrowReview>(_onFlagReview);
    on<RunSdnCheckEvent>(_onRunSdnCheck);
  }

  Future<void> _onRunSdnCheck(
    RunSdnCheckEvent event,
    Emitter<ComplianceState> emit,
  ) async {
    final currentState = state;
    emit(ComplianceLoading());
    try {
      // محاكاة الاتصال بـ OFAC / SDN
      await Future.delayed(const Duration(seconds: 2));
      emit(const ComplianceActionSuccess(ErrorKeys.complianceClear));
      
      // العودة للحالة السابقة إن أمكن
      if (currentState is ComplianceLoaded) {
        emit(currentState);
      } else {
        add(LoadComplianceDashboard());
      }
    } catch (e) {
      emit(ComplianceError(ErrorKeys.complianceScanFailed));
    }
  }

  Future<void> _onLoadDashboard(
    LoadComplianceDashboard event,
    Emitter<ComplianceState> emit,
  ) async {
    emit(ComplianceLoading());
    try {
      final dashboard = await repository.loadDashboard();
      emit(ComplianceLoaded(dashboard: dashboard));
    } catch (e) {
      emit(ComplianceError(e.toString()));
    }
  }

  Future<void> _onApproveReview(
    ApproveEscrowReview event,
    Emitter<ComplianceState> emit,
  ) async {
    try {
      await repository.approveReview(event.reference);
      emit(const ComplianceActionSuccess(ErrorKeys.escrowReleaseSuccess));
      // Reload to reflect the change
      add(LoadComplianceDashboard());
    } catch (e) {
      emit(ComplianceError(ErrorKeys.complianceApprovalFailed));
    }
  }

  Future<void> _onFlagReview(
    FlagEscrowReview event,
    Emitter<ComplianceState> emit,
  ) async {
    try {
      await repository.flagReview(event.reference);
      emit(const ComplianceActionSuccess('msg_compliance_flagged'));
      add(LoadComplianceDashboard());
    } catch (e) {
      emit(ComplianceError(ErrorKeys.complianceReportFailed));
    }
  }
}
