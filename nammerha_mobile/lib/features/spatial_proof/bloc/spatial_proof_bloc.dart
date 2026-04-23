import 'dart:convert';
import 'dart:isolate';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/spatial_proof_repository.dart';
import 'spatial_proof_event.dart';
import 'spatial_proof_state.dart';

/// Top-level function to run inside an isolate to prevent UI jank.
/// Calculates a composite SHA-256 hash ensuring that both the physical image bytes
/// and the spatial coordinates are cryptographically bound together.
String _computePlatinumHash(Map<String, dynamic> params) {
  final imageBytes = params['bytes'] as Uint8List;
  final lat = params['lat'] as double;
  final lng = params['lng'] as double;
  final timestamp = params['timestamp'] as String;

  // 1. Heavy computation: Hash the physical 4K image bytes
  final imageHash = sha256.convert(imageBytes).toString();

  // 2. Composite binding: Bind the metadata with the image hash
  final payload = '${lat.toStringAsFixed(6)}_${lng.toStringAsFixed(6)}_${timestamp}_${imageHash}_nammerha_salt_2026';
  
  return sha256.convert(utf8.encode(payload)).toString();
}

/// Spatial Proof BLoC — GraphQL-powered field camera controller.
///
/// Pipeline:
///   1. Isolate-offloaded SHA-256 composite hash (image + GPS + timestamp)
///   2. GraphQL `requestUploadUrl` → pre-signed S3 URL
///   3. Direct S3 PUT upload (no server proxy)
///   4. GraphQL `submitSpatialProof` → metadata registration
///
/// The BLoC owns the crypto computation; the repository owns the network I/O.
/// This separation ensures the UI thread is never blocked by either.
class SpatialProofBloc extends Bloc<SpatialProofEvent, SpatialProofState> {
  final SpatialProofRepository _repository;

  SpatialProofBloc({SpatialProofRepository? repository})
      : _repository = repository ?? SpatialProofRepository(),
        super(SpatialProofInitial()) {
    on<SubmitSpatialProofEvent>(_onSubmitSpatialProof);
  }

  Future<void> _onSubmitSpatialProof(
    SubmitSpatialProofEvent event,
    Emitter<SpatialProofState> emit,
  ) async {
    emit(const SpatialProofLoading('جارِ تشفير الإثبات المكاني...'));

    try {
      final timestamp = DateTime.now().toIso8601String();

      // Ensure 60fps integrity: off-load crypto to background thread
      final clientHash = await Isolate.run(() => _computePlatinumHash({
        'bytes': event.imageBytes,
        'lat': event.latitude,
        'lng': event.longitude,
        'timestamp': timestamp,
      }));

      emit(const SpatialProofLoading('جارِ تأمين الرفع إلى السحابة...'));

      // Dispatch to GraphQL-powered repository
      final result = await _repository.uploadAndSubmitProof(
        projectId: event.projectId,
        itemId: event.itemId,
        imageBytes: event.imageBytes,
        lat: event.latitude,
        lng: event.longitude,
        accuracy: event.accuracy,
        clientHash: clientHash,
      );

      emit(SpatialProofSuccess(
        clientHash: clientHash,
        proofId: result.proofId,
        verificationStatus: result.verificationStatus,
      ));

    } catch (e) {
      emit(SpatialProofError(e.toString()));
    }
  }
}
