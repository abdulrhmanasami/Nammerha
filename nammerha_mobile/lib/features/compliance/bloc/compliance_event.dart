import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Compliance BLoC — Events (Platinum Standard)
// ═══════════════════════════════════════════════════════════════════════════

abstract class ComplianceEvent extends Equatable {
  const ComplianceEvent();

  @override
  List<Object?> get props => [];
}

/// Load all compliance dashboard data (stats + escrow review queue).
class LoadComplianceDashboard extends ComplianceEvent {}

/// Approve an escrow review by its reference ID.
class ApproveEscrowReview extends ComplianceEvent {
  final String reference;

  const ApproveEscrowReview(this.reference);

  @override
  List<Object?> get props => [reference];
}

/// Flag an escrow review for further investigation.
class FlagEscrowReview extends ComplianceEvent {
  final String reference;

  const FlagEscrowReview(this.reference);

  @override
  List<Object?> get props => [reference];
}
