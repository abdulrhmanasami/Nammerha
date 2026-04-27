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
  final List<MonthlyAmountPoint> donationsByMonth;
  final List<EscrowCase> recentAudit;

  const AdminDashboardLoaded({
    required this.overview,
    required this.projectsByMonth,
    required this.donationsByMonth,
    required this.recentAudit,
  });

  @override
  List<Object?> get props => [overview, projectsByMonth, donationsByMonth, recentAudit];
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

  /// Resilient data loading — partial data renders even if one API fails.
  /// Mirrors web's Promise.allSettled pattern.
  Future<void> _fetchData(Emitter<AdminDashboardState> emit) async {
    try {
      // Fire all requests concurrently
      final results = await Future.wait([
        _api.getStatsOverview().then<Object?>((v) => v).catchError((_) => null),
        _api.getProjectsByMonth().then<Object?>((v) => v).catchError((_) => <MonthlyDataPoint>[]),
        _api.getDonationsByMonth().then<Object?>((v) => v).catchError((_) => <MonthlyAmountPoint>[]),
        _api.getPendingVerifications(limit: 5).then<Object?>((v) => v).catchError((_) => <EscrowCase>[]),
      ]);

      final overview = results[0] as PlatformOverview?;
      if (overview == null) {
        emit(const AdminDashboardError('فشل تحميل إحصائيات المنصة'));
        return;
      }

      emit(AdminDashboardLoaded(
        overview: overview,
        projectsByMonth: results[1] as List<MonthlyDataPoint>,
        donationsByMonth: results[2] as List<MonthlyAmountPoint>,
        recentAudit: results[3] as List<EscrowCase>,
      ));
    } catch (e) {
      emit(AdminDashboardError(e.toString()));
    }
  }
}
