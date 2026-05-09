import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Engineer Portal BLoC — Events (Platinum Standard)
// ═══════════════════════════════════════════════════════════════════════════

abstract class EngineerPortalEvent extends Equatable {
  const EngineerPortalEvent();

  @override
  List<Object?> get props => [];
}

/// Load all dashboard data (stats, projects, bids, captures).
/// Dispatched on init and on pull-to-refresh.
class LoadEngineerDashboard extends EngineerPortalEvent {}
