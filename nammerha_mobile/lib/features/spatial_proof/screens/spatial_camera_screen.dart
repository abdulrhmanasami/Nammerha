import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'dart:async';
import 'dart:math' as math;
import 'dart:isolate';
import '../../../core/utils/haptics.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/theme/semantic_colors.dart';
import '../models/gps_signature.dart';
import '../bloc/spatial_proof_bloc.dart';
import '../bloc/spatial_proof_event.dart';
import '../bloc/spatial_proof_state.dart';
import '../bloc/camera_hardware_cubit.dart';
import '../../../core/i18n/t.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

class SpatialCameraScreen extends StatelessWidget {
  final String projectId;
  final String itemId;
  final double? targetLat;
  final double? targetLng;

  const SpatialCameraScreen({
    super.key,
    required this.projectId,
    required this.itemId,
    this.targetLat,
    this.targetLng,
  });

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider(create: (context) => SpatialProofBloc()),
        BlocProvider(create: (context) => CameraHardwareCubit()),
      ],
      child: _SpatialCameraView(
        projectId: projectId,
        itemId: itemId,
        targetLat: targetLat,
        targetLng: targetLng,
      ),
    );
  }
}

class _SpatialCameraView extends StatefulWidget {
  final String projectId;
  final String itemId;
  final double? targetLat;
  final double? targetLng;

  const _SpatialCameraView({
    required this.projectId,
    required this.itemId,
    this.targetLat,
    this.targetLng,
  });

  @override
  State<_SpatialCameraView> createState() => _SpatialCameraViewState();
}

class _SpatialCameraViewState extends State<_SpatialCameraView> {
  CameraController? _cameraController;
  GpsSignature? _currentSignature; // Visual only

  @override
  void initState() {
    super.initState();
    _initializeHardware();
  }

  Future<void> _initializeHardware() async {
    final hwCubit = context.read<CameraHardwareCubit>();
    hwCubit.resetInitializing();
    try {
      final statuses = await [
        Permission.camera,
        Permission.locationWhenInUse,
      ].request();

      if (statuses[Permission.camera] != PermissionStatus.granted ||
          statuses[Permission.locationWhenInUse] != PermissionStatus.granted) {
        if (!mounted) return;
        hwCubit.setPermissionDenied(context.tr('sc_perm_required'));
        return;
      }

      hwCubit.setPermissionsGranted();

      // AUD-009 FIX: Timeout on camera discovery (15s).
      // On slow 2G devices, availableCameras() can hang indefinitely.
      final cameras = await availableCameras()
          .timeout(const Duration(seconds: 15),
              onTimeout: () => throw TimeoutException('Camera timeout'));
      if (!mounted) return;
      if (cameras.isEmpty) {
        throw Exception(context.tr('no_camera_available'));
      }

      final backCamera = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );

      _cameraController = CameraController(
        backCamera,
        ResolutionPreset.high,
        enableAudio: false,
      );

      // AUD-009 FIX: Timeout on camera initialization (15s).
      await _cameraController!.initialize()
          .timeout(const Duration(seconds: 15),
              onTimeout: () => throw TimeoutException('Camera init timeout'));

      // AUD-009 FIX: Timeout on GPS acquisition (10s).
      // Cold GPS start on older devices can take 30s+ without timeout.
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(timeLimit: Duration(seconds: 10)),
      );
      
      // PLATINUM UX FIX: Mock Location Spoofing Detection
      if (position.isMocked) {
        throw Exception('تم رصد تطبيق تزييف للموقع (Fake GPS). يُرجى إيقافه فوراً.');
      }

      _updateSignatureFromPosition(position);

      if (mounted) {
        hwCubit.setReady(lat: position.latitude, lng: position.longitude, acc: position.accuracy);
      }
    } on TimeoutException catch (e) {
      if (mounted) {
        hwCubit.setError(e.message ?? context.tr('sc_init_timeout_generic'));
      }
    } catch (e) {
      if (mounted) {
        hwCubit.setError(context.tr('sc_init_error').replaceAll('\$1', e.toString()));
      }
    }
  }

  void _updateSignatureFromPosition(Position position) {
    _currentSignature = GpsSignature(
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      timestamp: DateTime.now(),
    );
  }

  @override
  void dispose() {
    _cameraController?.dispose();
    super.dispose();
  }

  Future<void> _captureSpatialProof() async {
    if (_cameraController == null || !_cameraController!.value.isInitialized) return;
    final cubit = context.read<CameraHardwareCubit>();
    final hwState = cubit.state;
    if (hwState.latitude == null) return;
    
    final localColors = context.colors;

    try {
      Haptics.heavy();
      // 1. Refresh precise location
      final position = await Geolocator.getCurrentPosition();
      
      // PLATINUM UX FIX: Mock Location Spoofing Detection
      if (position.isMocked) {
        throw Exception('تم رصد تطبيق تزييف للموقع (Fake GPS). يُرجى إيقافه فوراً.');
      }

      // PLATINUM UX FIX: Silent GPS Drift Prevention
      if (position.accuracy > 25.0) {
        throw Exception('دقة الـ GPS ضعيفة جداً (${position.accuracy.toStringAsFixed(1)}m). يرجى التوجه لمكان مكشوف.');
      }

      _updateSignatureFromPosition(position);
      cubit.updatePosition(
        lat: position.latitude, lng: position.longitude, acc: position.accuracy,
      );

      // 2. Take physical picture
      final xFile = await _cameraController!.takePicture();
      final bytes = await xFile.readAsBytes();

      if (!mounted) return;

      // PLATINUM UPGRADE: Background Isolate Haversine Check
      if (widget.targetLat != null && widget.targetLng != null && widget.targetLat != 0.0) {
        final distance = await Isolate.run(() => _haversineDistance({
          'lat1': position.latitude,
          'lng1': position.longitude,
          'lat2': widget.targetLat!,
          'lng2': widget.targetLng!,
        }));

        if (distance > 150) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(context.tr('sc_distance_warning').replaceAll('\$1', '${distance.toInt()}')),
                backgroundColor: localColors.error,
              ),
            );
          }
          return; // Block submission
        }
      }

      if (!mounted) return;

      // 3. Dispatch to Isolate-powered BLoC
      context.read<SpatialProofBloc>().add(
        SubmitSpatialProofEvent(
          projectId: widget.projectId,
          itemId: widget.itemId,
          imageBytes: bytes,
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy: position.accuracy,
        ),
      );

    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.tr('sc_capture_failed').replaceAll('\$1', '$e')),
            backgroundColor: localColors.error,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return BlocBuilder<CameraHardwareCubit, CameraHardwareState>(
      builder: (context, hwState) {
        if (hwState.isInitializing) {
          return Scaffold(
            backgroundColor: colors.backgroundPrimary,
            body: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  NammerhaShimmerLoader(colors: colors, isList: false),
                  const SizedBox(height: 16),
                  Text(context.tr('sc_initializing'), style: TextStyle(color: colors.textSecondary)),
                ],
              ),
            ),
          );
        }

        if (!hwState.hasPermissions || hwState.errorMessage.isNotEmpty) {
          return Scaffold(
            backgroundColor: colors.backgroundPrimary,
            appBar: AppBar(title: Text(context.tr('spatial_guardian'))),
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(PhosphorIconsRegular.shieldSlash, size: 64, color: colors.error),
                    const SizedBox(height: 16),
                    Text(hwState.errorMessage, textAlign: TextAlign.center, style: TextStyle(color: colors.textPrimary, fontSize: 16)),
                    const SizedBox(height: 24),
                    ElevatedButton(
                      onPressed: _initializeHardware,
                      child: Text(context.tr('retry')),
                    ),
                  ],
                ),
              ),
            ),
          );
        }

        return BlocConsumer<SpatialProofBloc, SpatialProofState>(
      
        buildWhen: (previous, current) => current is! SpatialProofSuccess,listener: (context, state) {
        if (state is SpatialProofSuccess) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(context.tr('sc_proof_success')),
              backgroundColor: colors.success,
            ),
          );
          Navigator.pop(context); // Close camera successfully
        } else if (state is SpatialProofError) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(context.tr('sc_error_prefix').replaceAll('\$1', state.message)),
              backgroundColor: colors.error,
            ),
          );
        }
      },
      builder: (context, state) {
        final isCapturing = state is SpatialProofLoading;
        final isGpsPoor = hwState.accuracy != null && hwState.accuracy! > 25.0;

        return Scaffold(
          backgroundColor: Colors.black,
          body: Stack(
            children: [
              // Camera Preview
              if (_cameraController != null && _cameraController!.value.isInitialized)
                SizedBox.expand(
                  child: FittedBox(
                    fit: BoxFit.cover,
                    child: SizedBox(
                      width: _cameraController!.value.previewSize?.height ?? 1,
                      height: _cameraController!.value.previewSize?.width ?? 1,
                      child: CameraPreview(_cameraController!),
                    ),
                  ),
                ),

              // GPS Telemetry Overlay & Graceful Degradation UI
              PositionedDirectional(
                top: 60,
                start: 16,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            context.tr('sc_latitude').replaceAll('\$1', '${hwState.latitude?.toStringAsFixed(5)}'),
                            style: TextStyle(color: colors.success, fontFamily: 'monospace', fontSize: 12),
                          ),
                          Text(
                            context.tr('sc_longitude').replaceAll('\$1', '${hwState.longitude?.toStringAsFixed(5)}'),
                            style: TextStyle(color: colors.success, fontFamily: 'monospace', fontSize: 12),
                          ),
                          Text(
                            context.tr('sc_accuracy').replaceAll('\$1', '${hwState.accuracy?.toStringAsFixed(1)}'),
                            style: TextStyle(
                              color: (hwState.accuracy ?? 0) > 20 ? colors.warning : colors.success, 
                              fontFamily: 'monospace', 
                              fontSize: 12
                            ),
                          ),
                          if (_currentSignature != null)
                            Text(
                              context.tr('sc_signature_secured'),
                              style: TextStyle(color: colors.textSubtle, fontFamily: 'monospace', fontSize: 10),
                            ),
                        ],
                      ),
                    ),
                    // UX PLATINUM FIX: Graceful GPS Degradation UI
                    if (hwState.accuracy != null && hwState.accuracy! > 20)
                      Container(
                        margin: const EdgeInsets.only(top: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: colors.warning.withAlpha(40),
                          border: Border.all(color: colors.warning.withAlpha(100)),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(PhosphorIconsRegular.warningCircle, color: colors.warning, size: 16),
                            const SizedBox(width: 8),
                            Text(
                              context.tr('sc_gps_degraded'),
                              style: TextStyle(color: colors.warning, fontSize: 12, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                      ).animate().fade(duration: 300.ms).slideX(begin: -0.1, duration: 300.ms),
                  ],
                ),
              ),

              // AUD-008 FIX: Dead map PiP placeholder REMOVED.
              // Previous: 100×130px container showed ⚠️ warning icon + "Map" text.
              // This was a non-functional placeholder that wasted viewport space
              // and displayed a trust-eroding warning icon on the camera screen.
              // Real minimap can be added in a future phase if needed.

              // Capture Button & Loading State
              PositionedDirectional(
                bottom: 40,
                start: 0,
                end: 0,
                child: Column(
                  children: [
                    if (isCapturing) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          color: Colors.black87,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          state.statusMessage,
                          style: TextStyle(color: colors.success, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        // AUD-020 FIX: Semantics for screen readers.
                        // Without this, VoiceOver announces "Button" with no context.
                        Semantics(
                          label: context.tr('capture_spatial_proof'),
                          button: true,
                          enabled: !isCapturing && !isGpsPoor,
                          child: GestureDetector(
                            onTap: (isCapturing || isGpsPoor) ? () {
                               if (isGpsPoor) {
                                 ScaffoldMessenger.of(context).showSnackBar(
                                   SnackBar(
                                     content: const Text('دقة الـ GPS ضعيفة. يرجى التوجه لمكان مكشوف.'),
                                     backgroundColor: colors.warning,
                                   ),
                                 );
                               }
                            } : _captureSpatialProof,
                            child: Container(
                              width: 76,
                              height: 76,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(color: isGpsPoor ? colors.warning : Colors.white, width: 4),
                                color: isCapturing 
                                    ? Colors.grey 
                                    : isGpsPoor 
                                        ? colors.warning.withAlpha(100) 
                                        : colors.primaryBrand.withAlpha(200),
                              ),
                              child: isCapturing
                                  ? Padding(
                                      padding: const EdgeInsets.all(20),
                                      child: Icon(PhosphorIconsRegular.spinnerGap, color: Colors.white, size: 36).animate(onPlay: (c) => c.repeat()).rotate(duration: 1.seconds),
                                    )
                                  : Icon(isGpsPoor ? PhosphorIconsRegular.warningCircle : PhosphorIconsRegular.camera, color: Colors.white, size: 36),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
      },
    );
  }
}

// ─── BACKGROUND ISOLATE FUNCTION ───
// Calculates GPS distance accurately without blocking the 60fps UI thread.
double _haversineDistance(Map<String, double> args) {
  final lat1 = args['lat1']!;
  final lng1 = args['lng1']!;
  final lat2 = args['lat2']!;
  final lng2 = args['lng2']!;

  const R = 6371e3; // Earth radius in meters
  final dLat = (lat2 - lat1) * math.pi / 180;
  final dLng = (lng2 - lng1) * math.pi / 180;

  final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(lat1 * math.pi / 180) * math.cos(lat2 * math.pi / 180) *
      math.sin(dLng / 2) * math.sin(dLng / 2);

  final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  return R * c;
}

