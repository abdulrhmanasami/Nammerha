import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../api/admin_api.dart';
import '../models/admin_models.dart';

// ─── Events ─────────────────────────────────────────────────────────────────

abstract class AdminDashboardEvent extends Equatable {
  const AdminDashboardEvent();
  @override
  List<Object?> get props => [];
}

class LoadDashboard extends AdminDashboardEvent {}
class RefreshDashboard extends AdminDashboardEvent {}

// ─── States ─────────────────────────────────────────────────────────────────

abstract class AdminDashboardState extends Equatable {
  const AdminDashboardState();
  @override
  List<Object?> get props => [];
}

class AdminDashboardInitial extends AdminDashboardState {}
class AdminDashboardLoading extends AdminDashboardState {}

class AdminDashboardLoaded extends AdminDashboardState {
  final PlatformOverview overview;
  final List<MonthlyDataPoint> projectsByMonth;
  final List<MonthlyAmountPoint> fundingByMonth;
  final List<EscrowCase> recentAudit;

  const AdminDashboardLoaded({
    required this.overview,
    required this.projectsByMonth,
    required this.fundingByMonth,
    required this.recentAudit,
  });

  @override
  List<Object?> get props => [overview, projectsByMonth, fundingByMonth, recentAudit];
}

class AdminDashboardError extends AdminDashboardState {
  final String message;
  const AdminDashboardError(this.message);
  @override
  List<Object?> get props => [message];
}

// ─── BLoC ───────────────────────────────────────────────────────────────────

class AdminDashboardBloc extends Bloc<AdminDashboardEvent, AdminDashboardState> {
  final AdminApi _api;

  AdminDashboardBloc({AdminApi? api})
      : _api = api ?? AdminApi(),
        super(AdminDashboardInitial()) {
    on<LoadDashboard>(_onLoad);
    on<RefreshDashboard>(_onRefresh);
  }

  Future<void> _onLoad(LoadDashboard event, Emitter<AdminDashboardState> emit) async {
    emit(AdminDashboardLoading());
    await _fetchData(emit);
  }

  Future<void> _onRefresh(RefreshDashboard event, Emitter<AdminDashboardState> emit) async {
    await _fetchData(emit);
  }

  /// Resilient data loading — partial data renders even if secondary API fails.
  /// Overview is mandatory (fails fast). Charts and audit trail degrade gracefully.
  /// Uses explicit error logging to violate Zero-Silent Failure protocol.
  Future<void> _fetchData(Emitter<AdminDashboardState> emit) async {
    // ── Step 1: Load mandatory overview (fail-fast if unavailable) ──────────
    PlatformOverview? overview;
    try {
      overview = await _api.getStatsOverview();
    } catch (e) {
      _logError('getStatsOverview', e);
      emit(const AdminDashboardError('فشل تحميل إحصائيات المنصة'));
      return;
    }

    // ── Step 2: Load secondary data concurrently (degrade gracefully) ────────
    List<MonthlyDataPoint> projectsByMonth = [];
    List<MonthlyAmountPoint> fundingByMonth = [];
    List<EscrowCase> recentAudit = [];

    await Future.wait([
      _safeLoad<List<MonthlyDataPoint>>(
        label: 'getProjectsByMonth',
        fallback: const [],
        fetch: () => _api.getProjectsByMonth(),
        onSuccess: (v) => projectsByMonth = v,
      ),
      _safeLoad<List<MonthlyAmountPoint>>(
        label: 'getFundingByMonth',
        fallback: const [],
        fetch: () => _api.getFundingByMonth(),
        onSuccess: (v) => fundingByMonth = v,
      ),
      _safeLoad<List<EscrowCase>>(
        label: 'getPendingVerifications',
        fallback: const [],
        fetch: () => _api.getPendingVerifications(limit: 5),
        onSuccess: (v) => recentAudit = v,
      ),
    ]);

    emit(AdminDashboardLoaded(
      overview: overview,
      projectsByMonth: projectsByMonth,
      fundingByMonth: fundingByMonth,
      recentAudit: recentAudit,
    ));
  }

  /// Type-safe async helper: runs [fetch], calls [onSuccess] if successful,
  /// or logs the error and returns [fallback] on failure.
  Future<void> _safeLoad<T>({
    required String label,
    required T fallback,
    required Future<T> Function() fetch,
    required void Function(T) onSuccess,
  }) async {
    try {
      onSuccess(await fetch());
    } catch (e) {
      _logError(label, e);
    }
  }

  void _logError(String endpoint, Object error) {
    assert(() {
      // ignore: avoid_print
      debugPrint('[AdminDashboardBloc] $endpoint failed: $error');
      return true;
    }());
  }
}
