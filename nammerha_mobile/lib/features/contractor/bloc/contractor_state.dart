import 'package:equatable/equatable.dart';
import '../models/contractor_models.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Contractor BLoC — States (Platinum Standard)
// ═══════════════════════════════════════════════════════════════════════════

abstract class ContractorState extends Equatable {
  const ContractorState();

  @override
  List<Object?> get props => [];
}

/// Initial state before any data is loaded.
class ContractorInitial extends ContractorState {}

/// Dashboard data is being loaded.
class ContractorLoading extends ContractorState {}

/// Dashboard data is fully loaded and ready for display.
class ContractorLoaded extends ContractorState {
  final ContractorDashboardModel dashboard;

  const ContractorLoaded({required this.dashboard});

  @override
  List<Object?> get props => [dashboard];
}

/// A fatal error occurred that prevents rendering the dashboard.
class ContractorError extends ContractorState {
  final String message;

  const ContractorError(this.message);

  @override
  List<Object?> get props => [message];
}

/// Transient state emitted after a successful action (e.g., bid submitted).
/// The UI uses BlocListener to show a snackbar, then the BLoC reloads data.
class ContractorActionSuccess extends ContractorState {
  final String message;

  const ContractorActionSuccess(this.message);

  @override
  List<Object?> get props => [message];
}
