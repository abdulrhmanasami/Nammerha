import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/services/api_services.dart';

// ═══════════════════════════════════════════════════════════════════════════
// EPA ORACLE BLOC — GAP-S02 REMEDIATION
// FIDIC 13.8 Economic Price Adjustment calculation state management
// ═══════════════════════════════════════════════════════════════════════════

// ─── Events ─────────────────────────────────────────────────────────────────

abstract class OracleEvent {}

class LoadOraclePrices extends OracleEvent {
  final String? materialCode;
  LoadOraclePrices({this.materialCode});
}

class CalculateEPAAdjustment extends OracleEvent {
  final String projectId;
  final String? milestoneId;
  final Map<String, double> fidicParams;
  final int originalAmount;

  CalculateEPAAdjustment({
    required this.projectId,
    this.milestoneId,
    required this.fidicParams,
    required this.originalAmount,
  });
}

class LoadAdjustmentHistory extends OracleEvent {
  final String projectId;
  LoadAdjustmentHistory(this.projectId);
}

// ─── State ──────────────────────────────────────────────────────────────────

class OracleState {
  final bool isLoading;
  final String? error;
  final List<Map<String, dynamic>> prices;
  final Map<String, dynamic>? calculationResult;
  final List<Map<String, dynamic>> history;

  const OracleState({
    this.isLoading = false,
    this.error,
    this.prices = const [],
    this.calculationResult,
    this.history = const [],
  });

  OracleState copyWith({
    bool? isLoading,
    String? error,
    List<Map<String, dynamic>>? prices,
    Map<String, dynamic>? calculationResult,
    List<Map<String, dynamic>>? history,
  }) {
    return OracleState(
      isLoading: isLoading ?? this.isLoading,
      error: error,
      prices: prices ?? this.prices,
      calculationResult: calculationResult ?? this.calculationResult,
      history: history ?? this.history,
    );
  }
}

// ─── BLoC ────────────────────────────────────────────────────────────────────

class OracleBloc extends Bloc<OracleEvent, OracleState> {
  final EpaOracleApi _api;

  OracleBloc({EpaOracleApi? api})
      : _api = api ?? EpaOracleApi(),
        super(const OracleState()) {
    on<LoadOraclePrices>(_onLoadPrices);
    on<CalculateEPAAdjustment>(_onCalculate);
    on<LoadAdjustmentHistory>(_onLoadHistory);
  }

  Future<void> _onLoadPrices(
    LoadOraclePrices event,
    Emitter<OracleState> emit,
  ) async {
    emit(state.copyWith(isLoading: true));
    try {
      final prices =
          await _api.getPrices(materialCode: event.materialCode);
      emit(state.copyWith(isLoading: false, prices: prices));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  Future<void> _onCalculate(
    CalculateEPAAdjustment event,
    Emitter<OracleState> emit,
  ) async {
    emit(state.copyWith(isLoading: true));
    try {
      final result = await _api.calculateAdjustment(
        projectId: event.projectId,
        milestoneId: event.milestoneId,
        fidicParams: event.fidicParams,
        originalAmount: event.originalAmount,
      );
      emit(state.copyWith(isLoading: false, calculationResult: result));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  Future<void> _onLoadHistory(
    LoadAdjustmentHistory event,
    Emitter<OracleState> emit,
  ) async {
    emit(state.copyWith(isLoading: true));
    try {
      final history = await _api.getHistory(event.projectId);
      emit(state.copyWith(isLoading: false, history: history));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }
}
