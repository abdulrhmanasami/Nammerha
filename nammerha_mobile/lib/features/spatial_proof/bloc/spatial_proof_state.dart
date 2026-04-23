import 'package:equatable/equatable.dart';

abstract class SpatialProofState extends Equatable {
  const SpatialProofState();

  @override
  List<Object?> get props => [];
}

class SpatialProofInitial extends SpatialProofState {}

class SpatialProofLoading extends SpatialProofState {
  final String statusMessage;

  const SpatialProofLoading(this.statusMessage);

  @override
  List<Object?> get props => [statusMessage];
}

/// Success state — enriched with backend proof metadata.
///
/// [clientHash] — Client-computed SHA-256 composite hash
/// [proofId] — Backend-assigned proof UUID (empty if REST fallback)
/// [verificationStatus] — Initial status: SUBMITTED → (admin) → VERIFIED
class SpatialProofSuccess extends SpatialProofState {
  final String clientHash;
  final String proofId;
  final String verificationStatus;

  const SpatialProofSuccess({
    required this.clientHash,
    this.proofId = '',
    this.verificationStatus = 'SUBMITTED',
  });

  @override
  List<Object?> get props => [clientHash, proofId, verificationStatus];
}

class SpatialProofError extends SpatialProofState {
  final String message;

  const SpatialProofError(this.message);

  @override
  List<Object?> get props => [message];
}
