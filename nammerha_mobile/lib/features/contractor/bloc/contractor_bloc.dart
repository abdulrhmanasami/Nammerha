import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/contractor_repository.dart';
import '../../../core/i18n/error_keys.dart';
import 'contractor_event.dart';
import 'contractor_state.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Contractor BLoC — Business Logic (Platinum Standard)
// ═══════════════════════════════════════════════════════════════════════════
// Replaces the raw setState + silent catch pattern in contractor_portal_screen.
// Follows the SupplierBloc pattern exactly: events → repository → states.
// ═══════════════════════════════════════════════════════════════════════════

class ContractorBloc extends Bloc<ContractorEvent, ContractorState> {
  final ContractorRepository repository;

  ContractorBloc({required this.repository}) : super(ContractorInitial()) {
    on<LoadContractorDashboard>(_onLoadDashboard);
    on<SubmitContractorBid>(_onSubmitBid);
  }

  Future<void> _onLoadDashboard(
    LoadContractorDashboard event,
    Emitter<ContractorState> emit,
  ) async {
    // PLAT-UX FIX: Prevent UI Wipeout on RefreshIndicator trigger
    if (state is! ContractorLoaded) {
      emit(ContractorLoading());
    }
    try {
      final dashboard = await repository.loadFullDashboard();
      if (isClosed) return;
      emit(ContractorLoaded(dashboard: dashboard));
    } catch (e) {
      debugPrint('[Nammerha] bloc/contractor_bloc: $e');
      if (isClosed) return;
      emit(ContractorError(e.toString()));
    }
  }

  Future<void> _onSubmitBid(
    SubmitContractorBid event,
    Emitter<ContractorState> emit,
  ) async {
    try {
      await repository.submitBid(
        projectId: event.projectId,
        proposedCost: event.proposedCost,
        estimatedDays: event.estimatedDays,
        coverLetter: event.coverLetter,
      );
      if (isClosed) return;
      emit(const ContractorActionSuccess(ErrorKeys.bidSubmitted));
      // Reload dashboard to reflect the new bid
      add(LoadContractorDashboard());
    } catch (e) {
      debugPrint('[Nammerha] bloc/contractor_bloc: $e');
      if (isClosed) return;
      emit(ContractorError(ErrorKeys.bidFailed));
    }
  }
}
