import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// TransparencyDashboardCubit — Platinum Standard (Absolute Zero setState)
// ═══════════════════════════════════════════════════════════════════════════

class TransparencyDashboardState extends Equatable {
  final bool isLoading;
  final String? error;
  final Map<String, dynamic> projectCard;
  final Map<String, dynamic> ocdsRelease;
  final List<Map<String, dynamic>> ledgerEntries;

  const TransparencyDashboardState({
    this.isLoading = true,
    this.error,
    this.projectCard = const {},
    this.ocdsRelease = const {},
    this.ledgerEntries = const [],
  });

  @override
  List<Object?> get props => [isLoading, error, projectCard, ocdsRelease, ledgerEntries];
}

class TransparencyDashboardCubit extends Cubit<TransparencyDashboardState> {
  TransparencyDashboardCubit() : super(const TransparencyDashboardState());

  void setLoading() => emit(const TransparencyDashboardState(isLoading: true));

  void setLoaded({
    required Map<String, dynamic> projectCard,
    required Map<String, dynamic> ocdsRelease,
    required List<Map<String, dynamic>> ledgerEntries,
  }) {
    emit(TransparencyDashboardState(
      isLoading: false,
      projectCard: projectCard,
      ocdsRelease: ocdsRelease,
      ledgerEntries: ledgerEntries,
    ));
  }

  void setError(String message) => emit(TransparencyDashboardState(isLoading: false, error: message));
}
