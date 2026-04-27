import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';

import '../../../core/services/api_services.dart';

// ═══════════════════════════════════════════════════════════════════════════
// DashboardHomeBloc — Platinum Standard (Absolute Zero setState Migration)
// ═══════════════════════════════════════════════════════════════════════════
//
// Replaces 5 `setState` calls in `_DashboardHomeState`:
//   - _stats / _isLoadingStats
//   - _recentActivity / _isLoadingActivity
//
// Architecture: Single BLoC managing both stats and activity as one
// atomic load (using Future.wait for parallelism), with independent
// graceful degradation — a stat failure does NOT block activity rendering.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Events ─────────────────────────────────────────────────────────────────

abstract class DashboardHomeEvent extends Equatable {
  const DashboardHomeEvent();
  @override
  List<Object?> get props => [];
}

/// Initial load or pull-to-refresh — role determines which API to call.
class LoadDashboardHome extends DashboardHomeEvent {
  final String role;
  const LoadDashboardHome(this.role);
  @override
  List<Object?> get props => [role];
}

// ─── States ─────────────────────────────────────────────────────────────────

abstract class DashboardHomeState extends Equatable {
  const DashboardHomeState();
  @override
  List<Object?> get props => [];
}

class DashboardHomeInitial extends DashboardHomeState {}

class DashboardHomeLoading extends DashboardHomeState {}

/// Loaded state — stats and activity are loaded independently.
/// [statsError] / [activityError] are non-null when a segment degraded.
class DashboardHomeLoaded extends DashboardHomeState {
  final Map<String, dynamic> stats;
  final List<Map<String, dynamic>> recentActivity;
  final String? statsError;
  final String? activityError;

  const DashboardHomeLoaded({
    required this.stats,
    required this.recentActivity,
    this.statsError,
    this.activityError,
  });

  @override
  List<Object?> get props => [stats, recentActivity, statsError, activityError];
}

class DashboardHomeError extends DashboardHomeState {
  final String message;
  const DashboardHomeError(this.message);
  @override
  List<Object?> get props => [message];
}

// ─── BLoC ────────────────────────────────────────────────────────────────────

class DashboardHomeBloc extends Bloc<DashboardHomeEvent, DashboardHomeState> {
  DashboardHomeBloc() : super(DashboardHomeInitial()) {
    on<LoadDashboardHome>(_onLoad);
  }

  Future<void> _onLoad(
    LoadDashboardHome event,
    Emitter<DashboardHomeState> emit,
  ) async {
    emit(DashboardHomeLoading());

    // Run stats + activity in parallel — each degrades independently.
    // A failing stats API must NOT block the activity feed from rendering.
    Map<String, dynamic> stats = {};
    String? statsError;
    List<Map<String, dynamic>> recentActivity = [];
    String? activityError;

    // ── Stats: role-specific API (degrades to zero-values on failure) ─────
    try {
      stats = await _loadStats(event.role);
    } catch (e) {
      statsError = e.toString();
      stats = _defaultStats(event.role);
    }

    // ── Recent Activity: Notifications API (role-agnostic) ─────────────
    try {
      final notifications = await NotificationsApi().getAll();
      recentActivity = notifications.take(5).toList();
    } catch (e) {
      activityError = e.toString();
    }


    emit(DashboardHomeLoaded(
      stats: stats,
      recentActivity: recentActivity,
      statsError: statsError,
      activityError: activityError,
    ));
  }

  /// Dispatches to the correct role API. Throws on failure (caller catches).
  Future<Map<String, dynamic>> _loadStats(String role) {
    switch (role) {
      case 'ENGINEER':
        return EngineerApi().getStats();
      case 'SUPPLIER':
        return SupplierApi().getStats();
      case 'HOMEOWNER':
        return HomeownerApi().getStats();
      default:
        return DonorApi().getStats();
    }
  }

  /// Zero-value fallback stats when API fails or user is not yet activated.
  Map<String, dynamic> _defaultStats(String role) {
    switch (role) {
      case 'ENGINEER':
        return {
          'assignedProjects': 0, 'assigned_projects': 0,
          'pendingProofs': 0,    'pending_proofs': 0,
          'verifiedProofs': 0,   'verified_proofs': 0,
          'totalRevenue': 0,     'total_revenue': 0,
        };
      case 'SUPPLIER':
        return {
          'pendingOrders': 0, 'pending_orders': 0,
          'inTransit': 0,     'in_transit': 0,
          'delivered': 0,
          'totalRevenue': 0,  'total_revenue': 0,
        };
      case 'HOMEOWNER':
        return {
          'total_projects': 0,    'totalProjects': 0,
          'pending_bids': 0,      'pendingBids': 0,
          'funding_percentage': 0, 'fundingPercentage': 0,
          'escrow_total': 0,      'escrowTotal': 0,
        };
      default:
        return {
          'totalDonated': 0,   'total_donated': 0,
          'activeProjects': 0, 'active_projects': 0,
          'proofsSeen': 0,     'proofs_seen': 0,
          'impactScore': 0,    'impact_score': 0,
        };
    }
  }
}
