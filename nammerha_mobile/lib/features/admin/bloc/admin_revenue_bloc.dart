import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../api/admin_api.dart';
import '../models/admin_models.dart';

// ─── Events ─────────────────────────────────────────────────────────────────

abstract class AdminRevenueEvent extends Equatable {
  const AdminRevenueEvent();
  @override
  List<Object?> get props => [];
}

class LoadRevenueDashboard extends AdminRevenueEvent {}

// ─── States ─────────────────────────────────────────────────────────────────

abstract class AdminRevenueState extends Equatable {
  const AdminRevenueState();
  @override
  List<Object?> get props => [];
}

class AdminRevenueInitial extends AdminRevenueState {}
class AdminRevenueLoading extends AdminRevenueState {}

class AdminRevenueLoaded extends AdminRevenueState {
  final RevenueSummary summary;
  final List<CommissionTier> tiers;
  final List<CommissionEntry> commissions;
  final List<TipEntry> tips;

  const AdminRevenueLoaded({
    required this.summary,
    required this.tiers,
    required this.commissions,
    required this.tips,
  });

  @override
  List<Object?> get props => [summary, tiers, commissions, tips];
}

class AdminRevenueError extends AdminRevenueState {
  final String message;
  const AdminRevenueError(this.message);
  @override
  List<Object?> get props => [message];
}

// ─── BLoC ───────────────────────────────────────────────────────────────────

class AdminRevenueBloc extends Bloc<AdminRevenueEvent, AdminRevenueState> {
  final AdminApi _api;

  AdminRevenueBloc({AdminApi? api})
      : _api = api ?? AdminApi(),
        super(AdminRevenueInitial()) {
    on<LoadRevenueDashboard>(_onLoad);
  }

  Future<void> _onLoad(LoadRevenueDashboard event, Emitter<AdminRevenueState> emit) async {
    emit(AdminRevenueLoading());
    try {
      final results = await Future.wait([
        _api.getRevenueSummary(),
        _api.getCommissionTiers(),
        _api.getRecentCommissions(),
        _api.getRecentTips(),
      ]);
      emit(AdminRevenueLoaded(
        summary: results[0] as RevenueSummary,
        tiers: results[1] as List<CommissionTier>,
        commissions: results[2] as List<CommissionEntry>,
        tips: results[3] as List<TipEntry>,
      ));
    } catch (e) {
      emit(AdminRevenueError(e.toString()));
    }
  }
}
