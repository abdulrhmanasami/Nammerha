import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/services/reality_capture_api.dart';

// ═══════════════════════════════════════════════════════════════════════════
// CaptureFormCubit — Platinum Standard (Absolute Zero setState)
// ═══════════════════════════════════════════════════════════════════════════
// Manages the form state for the "New Capture" bottom sheet.
// Replaces the legacy StatefulBuilder + setModalState pattern.
//
// P1-003 FIX: Extracts 2 stateful variables (selectedPhase, selectedType)
// into a reactive cubit, eliminating all raw setState in the capture sheet.
// ═══════════════════════════════════════════════════════════════════════════

/// Immutable state for the capture sheet form.
class CaptureFormState extends Equatable {
  final ConstructionPhase phase;
  final CaptureType captureType;

  const CaptureFormState({
    this.phase = ConstructionPhase.foundation,
    this.captureType = CaptureType.photo360,
  });

  CaptureFormState copyWith({
    ConstructionPhase? phase,
    CaptureType? captureType,
  }) {
    return CaptureFormState(
      phase: phase ?? this.phase,
      captureType: captureType ?? this.captureType,
    );
  }

  @override
  List<Object?> get props => [phase, captureType];
}

/// Cubit managing the capture sheet form selections.
class CaptureFormCubit extends Cubit<CaptureFormState> {
  CaptureFormCubit() : super(const CaptureFormState());

  /// Select a construction phase.
  void selectPhase(ConstructionPhase phase) =>
      emit(state.copyWith(phase: phase));

  /// Select a capture type (360°, standard, etc).
  void selectCaptureType(CaptureType type) =>
      emit(state.copyWith(captureType: type));
}
