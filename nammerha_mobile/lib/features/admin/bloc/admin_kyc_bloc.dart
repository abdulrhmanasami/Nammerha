import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../api/admin_api.dart';
import '../models/admin_models.dart';
import '../../../core/i18n/error_keys.dart';

// ─── Events ─────────────────────────────────────────────────────────────────

abstract class AdminKycEvent extends Equatable {
  const AdminKycEvent();
  @override
  List<Object?> get props => [];
}

class LoadKycQueue extends AdminKycEvent {
  final String? statusFilter;
  const LoadKycQueue({this.statusFilter});
  @override
  List<Object?> get props => [statusFilter];
}

class UpdateKycDecision extends AdminKycEvent {
  final String userId;
  final String decision; // 'verified' | 'rejected'
  final String? reason;
  const UpdateKycDecision({required this.userId, required this.decision, this.reason});
  @override
  List<Object?> get props => [userId, decision, reason];
}

// ─── States ─────────────────────────────────────────────────────────────────

abstract class AdminKycState extends Equatable {
  const AdminKycState();
  @override
  List<Object?> get props => [];
}

class AdminKycInitial extends AdminKycState {}
class AdminKycLoading extends AdminKycState {}

class AdminKycLoaded extends AdminKycState {
  final List<KycEntry> entries;
  final KycStats stats;
  final String? activeFilter;

  const AdminKycLoaded({
    required this.entries,
    required this.stats,
    this.activeFilter,
  });

  @override
  List<Object?> get props => [entries, stats, activeFilter];
}

class AdminKycDecisionSuccess extends AdminKycState {
  final String message;
  const AdminKycDecisionSuccess(this.message);
  @override
  List<Object?> get props => [message];
}

class AdminKycError extends AdminKycState {
  final String message;
  const AdminKycError(this.message);
  @override
  List<Object?> get props => [message];
}

// ─── BLoC ───────────────────────────────────────────────────────────────────

class AdminKycBloc extends Bloc<AdminKycEvent, AdminKycState> {
  final AdminApi _api;
  String? _lastFilter;

  AdminKycBloc({AdminApi? api})
      : _api = api ?? AdminApi(),
        super(AdminKycInitial()) {
    on<LoadKycQueue>(_onLoadQueue);
    on<UpdateKycDecision>(_onDecision);
  }

  Future<void> _onLoadQueue(LoadKycQueue event, Emitter<AdminKycState> emit) async {
    emit(AdminKycLoading());
    _lastFilter = event.statusFilter;
    try {
      final results = await Future.wait([
        _api.getKycQueue(status: event.statusFilter),
        _api.getKycStats(),
      ]);
      emit(AdminKycLoaded(
        entries: results[0] as List<KycEntry>,
        stats: results[1] as KycStats,
        activeFilter: event.statusFilter,
      ));
    } catch (e) {
      emit(AdminKycError(e.toString()));
    }
  }

  Future<void> _onDecision(UpdateKycDecision event, Emitter<AdminKycState> emit) async {
    try {
      final result = await _api.updateKycStatus(
        userId: event.userId,
        decision: event.decision,
        reason: event.reason,
      );
      final actionLabel = event.decision == 'verified' ? ErrorKeys.kycVerified : ErrorKeys.kycRejected;
      final name = result['full_name'] as String? ?? '';
      emit(AdminKycDecisionSuccess('$actionLabel: $name'));
      // Reload with same filter
      add(LoadKycQueue(statusFilter: _lastFilter));
    } catch (e) {
      emit(AdminKycError(e.toString()));
    }
  }
}
