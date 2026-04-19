import 'dart:io';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';

import '../data/spatial_proof_repository.dart';
import '../models/gps_signature.dart';

// ─── EVENTS ────────────────────────────────────────────────────────
abstract class SpatialProofEvent extends Equatable {
  const SpatialProofEvent();
  @override
  List<Object?> get props => [];
}

class SubmitProofRequested extends SpatialProofEvent {
  final File file;
  final String projectId;
  final String itemId;
  final GpsSignature signature;

  const SubmitProofRequested({
    required this.file,
    required this.projectId,
    required this.itemId,
    required this.signature,
  });

  @override
  List<Object?> get props => [file, projectId, itemId, signature];
}

class ResetProofState extends SpatialProofEvent {}

// ─── STATES ────────────────────────────────────────────────────────
abstract class SpatialProofState extends Equatable {
  const SpatialProofState();
  @override
  List<Object?> get props => [];
}

class SpatialProofInitial extends SpatialProofState {}
class SpatialProofLoading extends SpatialProofState {}
class SpatialProofUploading extends SpatialProofState {}
class SpatialProofProcessing extends SpatialProofState {}
class SpatialProofSuccess extends SpatialProofState {}
class SpatialProofError extends SpatialProofState {
  final String message;
  const SpatialProofError(this.message);
  @override
  List<Object?> get props => [message];
}

// ─── BLOC ─────────────────────────────────────────────────────────
class SpatialProofBloc extends Bloc<SpatialProofEvent, SpatialProofState> {
  final SpatialProofRepository _repository;

  SpatialProofBloc(this._repository) : super(SpatialProofInitial()) {
    on<SubmitProofRequested>(_onSubmitProofRequested);
    on<ResetProofState>((event, emit) => emit(SpatialProofInitial()));
  }

  Future<void> _onSubmitProofRequested(
    SubmitProofRequested event, 
    Emitter<SpatialProofState> emit,
  ) async {
    emit(SpatialProofUploading());
    try {
      await _repository.submitProof(
        imageFile: event.file,
        projectId: event.projectId,
        itemId: event.itemId,
        signature: event.signature,
      );
      emit(SpatialProofSuccess());
    } catch (e) {
      emit(SpatialProofError(e.toString()));
    }
  }
}
