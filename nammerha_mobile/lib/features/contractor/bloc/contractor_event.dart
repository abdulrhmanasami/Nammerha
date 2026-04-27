import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Contractor BLoC — Events (Platinum Standard)
// ═══════════════════════════════════════════════════════════════════════════

abstract class ContractorEvent extends Equatable {
  const ContractorEvent();

  @override
  List<Object?> get props => [];
}

/// Load all dashboard data (stats, projects, marketplace, bids, payments).
/// Dispatched on init and on pull-to-refresh.
class LoadContractorDashboard extends ContractorEvent {}

/// Submit a competitive bid for a project.
class SubmitContractorBid extends ContractorEvent {
  final String projectId;
  final int proposedCost;
  final int estimatedDays;
  final String? coverLetter;

  const SubmitContractorBid({
    required this.projectId,
    required this.proposedCost,
    required this.estimatedDays,
    this.coverLetter,
  });

  @override
  List<Object?> get props => [projectId, proposedCost, estimatedDays, coverLetter];
}
