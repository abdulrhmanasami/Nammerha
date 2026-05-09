import 'package:equatable/equatable.dart';
import '../models/engineer_models.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Engineer Portal BLoC — States (Platinum Standard)
// ═══════════════════════════════════════════════════════════════════════════

abstract class EngineerPortalState extends Equatable {
  const EngineerPortalState();

  @override
  List<Object?> get props => [];
}

class EngineerPortalInitial extends EngineerPortalState {}

class EngineerPortalLoading extends EngineerPortalState {}

class EngineerPortalLoaded extends EngineerPortalState {
  final EngineerDashboardModel dashboard;

  const EngineerPortalLoaded({required this.dashboard});

  @override
  List<Object?> get props => [dashboard];
}

class EngineerPortalError extends EngineerPortalState {
  final String message;

  const EngineerPortalError(this.message);

  @override
  List<Object?> get props => [message];
}
