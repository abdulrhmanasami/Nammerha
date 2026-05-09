import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/services/api_services.dart';
import '../../donor/models/donor_models.dart';

// ═══════════════════════════════════════════════════════════════════════════
// DONOR PROOF BLOC — GAP-S01 REMEDIATION
// Reactive state management for 421-line donor proof gallery screen
// ═══════════════════════════════════════════════════════════════════════════

// ─── Events ─────────────────────────────────────────────────────────────────

abstract class DonorProofEvent {}

class LoadDonorProofs extends DonorProofEvent {}

class LoadDonorTimeline extends DonorProofEvent {
  final int? limit;
  LoadDonorTimeline({this.limit});
}

class LoadProjectFunding extends DonorProofEvent {
  final String projectId;
  LoadProjectFunding(this.projectId);
}

class DownloadReceipt extends DonorProofEvent {
  final String escrowId;
  DownloadReceipt(this.escrowId);
}

// ─── State ──────────────────────────────────────────────────────────────────

class DonorProofState {
  final bool isLoading;
  final String? error;
  final List<DonorProofModel> proofs;
  final List<Map<String, dynamic>> timeline;
  final Map<String, dynamic>? projectFunding;
  final String? receiptUrl;
  final bool isDownloadingReceipt;

  const DonorProofState({
    this.isLoading = false,
    this.error,
    this.proofs = const [],
    this.timeline = const [],
    this.projectFunding,
    this.receiptUrl,
    this.isDownloadingReceipt = false,
  });

  DonorProofState copyWith({
    bool? isLoading,
    String? error,
    List<DonorProofModel>? proofs,
    List<Map<String, dynamic>>? timeline,
    Map<String, dynamic>? projectFunding,
    String? receiptUrl,
    bool? isDownloadingReceipt,
  }) {
    return DonorProofState(
      isLoading: isLoading ?? this.isLoading,
      error: error,
      proofs: proofs ?? this.proofs,
      timeline: timeline ?? this.timeline,
      projectFunding: projectFunding ?? this.projectFunding,
      receiptUrl: receiptUrl,
      isDownloadingReceipt: isDownloadingReceipt ?? this.isDownloadingReceipt,
    );
  }
}

// ─── BLoC ────────────────────────────────────────────────────────────────────

class DonorProofBloc extends Bloc<DonorProofEvent, DonorProofState> {
  final DonorApi _donorApi;

  DonorProofBloc({DonorApi? donorApi})
      : _donorApi = donorApi ?? DonorApi(),
        super(const DonorProofState()) {
    on<LoadDonorProofs>(_onLoadProofs);
    on<LoadDonorTimeline>(_onLoadTimeline);
    on<LoadProjectFunding>(_onLoadProjectFunding);
    on<DownloadReceipt>(_onDownloadReceipt);
  }

  Future<void> _onLoadProofs(
    LoadDonorProofs event,
    Emitter<DonorProofState> emit,
  ) async {
    emit(state.copyWith(isLoading: true));
    try {
      final proofs = await _donorApi.getProofs();
      emit(state.copyWith(isLoading: false, proofs: proofs));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  Future<void> _onLoadTimeline(
    LoadDonorTimeline event,
    Emitter<DonorProofState> emit,
  ) async {
    emit(state.copyWith(isLoading: true));
    try {
      final timeline = await _donorApi.getTimeline(limit: event.limit);
      emit(state.copyWith(isLoading: false, timeline: timeline));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  Future<void> _onLoadProjectFunding(
    LoadProjectFunding event,
    Emitter<DonorProofState> emit,
  ) async {
    emit(state.copyWith(isLoading: true, error: null));
    try {
      final funding = await _donorApi.getProjectFunding(event.projectId);
      emit(state.copyWith(isLoading: false, projectFunding: funding));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  Future<void> _onDownloadReceipt(
    DownloadReceipt event,
    Emitter<DonorProofState> emit,
  ) async {
    emit(state.copyWith(isDownloadingReceipt: true, error: null, receiptUrl: null));
    try {
      final url = await _donorApi.getReceiptUrl(event.escrowId);
      emit(state.copyWith(isDownloadingReceipt: false, receiptUrl: url));
    } catch (e) {
      emit(state.copyWith(isDownloadingReceipt: false, error: e.toString()));
    }
  }
}
