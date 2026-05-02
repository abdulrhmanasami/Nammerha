import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// CameraHardwareCubit — Platinum Standard (Absolute Zero setState)
// ═══════════════════════════════════════════════════════════════════════════
// Manages hardware initialization state for SpatialCameraScreen:
//   - isInitializing, hasPermissions, errorMessage, currentPosition
// ═══════════════════════════════════════════════════════════════════════════

class CameraHardwareState extends Equatable {
  final bool isInitializing;
  final bool hasPermissions;
  final String errorMessage;
  final double? latitude;
  final double? longitude;
  final double? accuracy;

  const CameraHardwareState({
    this.isInitializing = true,
    this.hasPermissions = false,
    this.errorMessage = '',
    this.latitude,
    this.longitude,
    this.accuracy,
  });

  CameraHardwareState copyWith({
    bool? isInitializing,
    bool? hasPermissions,
    String? errorMessage,
    double? latitude,
    double? longitude,
    double? accuracy,
  }) {
    return CameraHardwareState(
      isInitializing: isInitializing ?? this.isInitializing,
      hasPermissions: hasPermissions ?? this.hasPermissions,
      errorMessage: errorMessage ?? this.errorMessage,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      accuracy: accuracy ?? this.accuracy,
    );
  }

  @override
  List<Object?> get props => [isInitializing, hasPermissions, errorMessage, latitude, longitude, accuracy];
}

class CameraHardwareCubit extends Cubit<CameraHardwareState> {
  CameraHardwareCubit() : super(const CameraHardwareState());

  void setPermissionDenied(String message) =>
      emit(state.copyWith(hasPermissions: false, isInitializing: false, errorMessage: message));

  void setPermissionsGranted() =>
      emit(state.copyWith(hasPermissions: true));

  void setReady({required double lat, required double lng, required double acc}) =>
      emit(state.copyWith(isInitializing: false, latitude: lat, longitude: lng, accuracy: acc));

  void setError(String message) =>
      emit(state.copyWith(isInitializing: false, errorMessage: message));

  void updatePosition({required double lat, required double lng, required double acc}) =>
      emit(state.copyWith(latitude: lat, longitude: lng, accuracy: acc));

  void resetInitializing() =>
      emit(const CameraHardwareState());
}
