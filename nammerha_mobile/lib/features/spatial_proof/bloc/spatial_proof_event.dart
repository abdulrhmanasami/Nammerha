import 'dart:typed_data';
import 'package:equatable/equatable.dart';

abstract class SpatialProofEvent extends Equatable {
  const SpatialProofEvent();

  @override
  List<Object?> get props => [];
}

class SubmitSpatialProofEvent extends SpatialProofEvent {
  final String projectId;
  final String itemId;
  final Uint8List imageBytes;
  final double latitude;
  final double longitude;
  final double accuracy;

  const SubmitSpatialProofEvent({
    required this.projectId,
    required this.itemId,
    required this.imageBytes,
    required this.latitude,
    required this.longitude,
    required this.accuracy,
  });

  @override
  List<Object?> get props => [
        projectId,
        itemId,
        imageBytes,
        latitude,
        longitude,
        accuracy,
      ];
}
