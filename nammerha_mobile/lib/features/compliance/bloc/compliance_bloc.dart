import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/compliance_repository.dart';
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
      emit(const ComplianceActionSuccess('تمت الموافقة على تحرير الضمان بنجاح.'));
      // Reload to reflect the change
      add(LoadComplianceDashboard());
    } catch (e) {
      emit(ComplianceError('فشلت الموافقة: ${e.toString()}'));
    }
  }

  Future<void> _onFlagReview(
    FlagEscrowReview event,
    Emitter<ComplianceState> emit,
  ) async {
    try {
      await repository.flagReview(event.reference);
      emit(const ComplianceActionSuccess('تم الإبلاغ عن المراجعة للتحقيق.'));
      add(LoadComplianceDashboard());
    } catch (e) {
      emit(ComplianceError('فشل الإبلاغ: ${e.toString()}'));
    }
  }
}
