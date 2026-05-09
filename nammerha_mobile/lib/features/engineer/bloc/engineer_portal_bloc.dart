import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/engineer_repository.dart';
import 'engineer_portal_event.dart';
import 'engineer_portal_state.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Engineer Portal BLoC — Business Logic (Platinum Standard)
// ═══════════════════════════════════════════════════════════════════════════
// Follows the ContractorBloc pattern: events → repository → states.
// ═══════════════════════════════════════════════════════════════════════════

class EngineerPortalBloc extends Bloc<EngineerPortalEvent, EngineerPortalState> {
  final EngineerRepository repository;

  EngineerPortalBloc({required this.repository}) : super(EngineerPortalInitial()) {
    on<LoadEngineerDashboard>(_onLoadDashboard);
  }

  Future<void> _onLoadDashboard(
    LoadEngineerDashboard event,
    Emitter<EngineerPortalState> emit,
  ) async {
    emit(EngineerPortalLoading());
    try {
      final dashboard = await repository.loadFullDashboard();
      emit(EngineerPortalLoaded(dashboard: dashboard));
    } catch (e) {
      emit(EngineerPortalError(e.toString()));
    }
  }
}
