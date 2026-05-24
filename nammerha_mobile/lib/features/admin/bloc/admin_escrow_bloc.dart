import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:bloc_concurrency/bloc_concurrency.dart';
import '../api/admin_api.dart';
import '../models/admin_models.dart';
import '../../../core/i18n/error_keys.dart';

// ─── Events ─────────────────────────────────────────────────────────────────

abstract class AdminEscrowEvent extends Equatable {
  const AdminEscrowEvent();
  @override
  List<Object?> get props => [];
}

class LoadPendingCases extends AdminEscrowEvent {}

class ReleaseEscrow extends AdminEscrowEvent {
  final String proofId;
  final String itemId;
  const ReleaseEscrow({required this.proofId, required this.itemId});
  @override
  List<Object?> get props => [proofId, itemId];
}

class FlagDiscrepancy extends AdminEscrowEvent {
  final String proofId;
  final String reason;
  const FlagDiscrepancy({required this.proofId, required this.reason});
  @override
  List<Object?> get props => [proofId, reason];
}

// ─── States ─────────────────────────────────────────────────────────────────

abstract class AdminEscrowState extends Equatable {
  const AdminEscrowState();
  @override
  List<Object?> get props => [];
}

class AdminEscrowInitial extends AdminEscrowState {}
class AdminEscrowLoading extends AdminEscrowState {}

class AdminEscrowCasesLoaded extends AdminEscrowState {
  final List<EscrowCase> cases;
  const AdminEscrowCasesLoaded(this.cases);
  @override
  List<Object?> get props => [cases];
}

class AdminEscrowActionSuccess extends AdminEscrowState {
  final String message;
  const AdminEscrowActionSuccess(this.message);
  @override
  List<Object?> get props => [message];
}

class AdminEscrowError extends AdminEscrowState {
  final String message;
  const AdminEscrowError(this.message);
  @override
  List<Object?> get props => [message];
}

// ─── BLoC ───────────────────────────────────────────────────────────────────

class AdminEscrowBloc extends Bloc<AdminEscrowEvent, AdminEscrowState> {
  final AdminApi _api;

  AdminEscrowBloc({AdminApi? api})
      : _api = api ?? AdminApi(),
        super(AdminEscrowInitial()) {
    on<LoadPendingCases>(_onLoadCases);
    on<ReleaseEscrow>(
      _onRelease,
      transformer: droppable(), // UXA-007 FIX: Prevent double-spend from concurrent taps
    );
    on<FlagDiscrepancy>(_onFlag);
  }

  Future<void> _onLoadCases(LoadPendingCases event, Emitter<AdminEscrowState> emit) async {
    emit(AdminEscrowLoading());
    try {
      final cases = await _api.getPendingVerifications();
      emit(AdminEscrowCasesLoaded(cases));
    } catch (e) {
      emit(AdminEscrowError(e.toString()));
    }
  }

  Future<void> _onRelease(ReleaseEscrow event, Emitter<AdminEscrowState> emit) async {
    emit(AdminEscrowLoading());
    try {
      final result = await _api.releaseEscrow(proofId: event.proofId, itemId: event.itemId);
      final message = result['message'] as String? ?? ErrorKeys.escrowReleaseSuccess;
      emit(AdminEscrowActionSuccess(message));
      // Reload cases after action
      add(LoadPendingCases());
    } catch (e) {
      emit(AdminEscrowError(e.toString()));
    }
  }

  Future<void> _onFlag(FlagDiscrepancy event, Emitter<AdminEscrowState> emit) async {
    try {
      await _api.flagDiscrepancy(proofId: event.proofId, reason: event.reason);
      emit(const AdminEscrowActionSuccess('err_discrepancy_flagged'));
      add(LoadPendingCases());
    } catch (e) {
      emit(AdminEscrowError(e.toString()));
    }
  }
}
