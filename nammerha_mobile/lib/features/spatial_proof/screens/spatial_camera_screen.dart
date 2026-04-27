import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'dart:math' as math;
import 'dart:isolate';

import '../../../core/theme/semantic_colors.dart';
import '../models/gps_signature.dart';
import '../bloc/spatial_proof_bloc.dart';
import '../bloc/spatial_proof_event.dart';
import '../bloc/spatial_proof_state.dart';

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
    return BlocProvider(
      create: (context) => SpatialProofBloc(),
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

  bool _isInitializing = true;
  bool _hasPermissions = false;
  String _errorMessage = '';

  Position? _currentPosition;
  GpsSignature? _currentSignature; // Visual only

  @override
  void initState() {
    super.initState();
    _initializeHardware();
  }

  Future<void> _initializeHardware() async {
    try {
      final statuses = await [
        Permission.camera,
        Permission.locationWhenInUse,
      ].request();

      if (statuses[Permission.camera] != PermissionStatus.granted ||
          statuses[Permission.locationWhenInUse] != PermissionStatus.granted) {
        setState(() {
          _hasPermissions = false;
          _isInitializing = false;
          _errorMessage = 'صلاحيات الكاميرا والموقع مطلوبة للإثبات المكاني.';
        });
        return;
      }

      _hasPermissions = true;

      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        throw Exception('لا توجد كاميرا متاحة.');
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

      await _cameraController!.initialize();
      _currentPosition = await Geolocator.getCurrentPosition();
      _updateSignature();

      if (mounted) {
        setState(() => _isInitializing = false);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isInitializing = false;
          _errorMessage = 'خطأ في التهيئة: ${e.toString()}';
        });
      }
    }
  }

  void _updateSignature() {
    if (_currentPosition == null) return;
    _currentSignature = GpsSignature(
      latitude: _currentPosition!.latitude,
      longitude: _currentPosition!.longitude,
      accuracy: _currentPosition!.accuracy,
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
    if (_currentPosition == null) return;
    
    final localColors = context.colors;

    try {
      // 1. Refresh precise location
      _currentPosition = await Geolocator.getCurrentPosition();
      _updateSignature();
      setState(() {}); // Update HUD

      // 2. Take physical picture
      final xFile = await _cameraController!.takePicture();
      final bytes = await xFile.readAsBytes();

      if (!mounted) return;

      // PLATINUM UPGRADE: Background Isolate Haversine Check
      if (widget.targetLat != null && widget.targetLng != null && widget.targetLat != 0.0) {
        setState(() {}); // Show loading
        
        final distance = await Isolate.run(() => _haversineDistance({
          'lat1': _currentPosition!.latitude,
          'lng1': _currentPosition!.longitude,
          'lat2': widget.targetLat!,
          'lng2': widget.targetLng!,
        }));

        if (distance > 150) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('أنت بعيد عن موقع المشروع بمسافة ${distance.toInt()} متر. الحد الأقصى هو 150 متر.'),
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
          latitude: _currentPosition!.latitude,
          longitude: _currentPosition!.longitude,
          accuracy: _currentPosition!.accuracy,
        ),
      );

    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('فشل الالتقاط: $e'),
            backgroundColor: localColors.error,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    if (_isInitializing) {
      return Scaffold(
        backgroundColor: colors.backgroundPrimary,
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(color: colors.primaryBrand),
              const SizedBox(height: 16),
              Text('جارِ تأمين الاتصال بالأجهزة...', style: TextStyle(color: colors.textSecondary)),
            ],
          ),
        ),
      );
    }

    if (!_hasPermissions || _errorMessage.isNotEmpty) {
      return Scaffold(
        backgroundColor: colors.backgroundPrimary,
        appBar: AppBar(title: const Text('الحارس المكاني')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.warning_amber_rounded, size: 64, color: colors.error),
                const SizedBox(height: 16),
                Text(_errorMessage, textAlign: TextAlign.center, style: TextStyle(color: colors.textPrimary, fontSize: 16)),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _initializeHardware,
                  child: const Text('إعادة المحاولة'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return BlocConsumer<SpatialProofBloc, SpatialProofState>(
      listener: (context, state) {
        if (state is SpatialProofSuccess) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('✅ تم تشفير ورفع الإثبات المكاني بنجاح!'),
              backgroundColor: colors.success,
            ),
          );
          Navigator.pop(context); // Close camera successfully
        } else if (state is SpatialProofError) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('خطأ: ${state.message}'),
              backgroundColor: colors.error,
            ),
          );
        }
      },
      builder: (context, state) {
        final isCapturing = state is SpatialProofLoading;

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

              // GPS Telemetry Overlay
              PositionedDirectional(
                top: 60,
                start: 16,
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'خط العرض: ${_currentPosition?.latitude.toStringAsFixed(5)}',
                        style: TextStyle(color: colors.success, fontFamily: 'monospace', fontSize: 12),
                      ),
                      Text(
                        'خط الطول: ${_currentPosition?.longitude.toStringAsFixed(5)}',
                        style: TextStyle(color: colors.success, fontFamily: 'monospace', fontSize: 12),
                      ),
                      Text(
                        'الدقة: ±${_currentPosition?.accuracy.toStringAsFixed(1)}م',
                        style: TextStyle(color: colors.warning, fontFamily: 'monospace', fontSize: 12),
                      ),
                      if (_currentSignature != null)
                        Text(
                          'التوقيع الأساسي مُؤمّن',
                          style: TextStyle(color: colors.textSubtle, fontFamily: 'monospace', fontSize: 10),
                        ),
                    ],
                  ),
                ),
              ),

              // Map Placeholder (PiP)
              PositionedDirectional(
                top: 60,
                end: 16,
                child: Container(
                  width: 100,
                  height: 130,
                  decoration: BoxDecoration(
                    color: colors.backgroundSecondary,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Colors.white30, width: 2),
                    boxShadow: const [BoxShadow(color: Colors.black45, blurRadius: 10)],
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.map_rounded, color: colors.primaryBrand, size: 32),
                      const SizedBox(height: 4),
                      Text('خريطة', style: TextStyle(fontSize: 10, color: colors.textSecondary)),
                    ],
                  ),
                ),
              ),

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
                        GestureDetector(
                          onTap: isCapturing ? null : _captureSpatialProof,
                          child: Container(
                            width: 76,
                            height: 76,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white, width: 4),
                              color: isCapturing ? Colors.grey : colors.primaryBrand.withAlpha(200),
                            ),
                            child: isCapturing
                                ? const Padding(
                                    padding: EdgeInsets.all(20),
                                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                                  )
                                : const Icon(Icons.camera_rounded, color: Colors.white, size: 36),
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

