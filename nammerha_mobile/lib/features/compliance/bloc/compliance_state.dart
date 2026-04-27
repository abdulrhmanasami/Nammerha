import 'package:equatable/equatable.dart';
import '../models/compliance_models.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Compliance BLoC — States (Platinum Standard)
// ═══════════════════════════════════════════════════════════════════════════

abstract class ComplianceState extends Equatable {
  const ComplianceState();

  @override
  List<Object?> get props => [];
}

class ComplianceInitial extends ComplianceState {}

class ComplianceLoading extends ComplianceState {}

class ComplianceLoaded extends ComplianceState {
  final ComplianceDashboardModel dashboard;

  const ComplianceLoaded({required this.dashboard});

  @override
  List<Object?> get props => [dashboard];
}

class ComplianceError extends ComplianceState {
  final String message;

  const ComplianceError(this.message);

  @override
  List<Object?> get props => [message];
}

/// Transient state emitted after approve/flag actions.
class ComplianceActionSuccess extends ComplianceState {
  final String message;

  const ComplianceActionSuccess(this.message);

  @override
  List<Object?> get props => [message];
}
