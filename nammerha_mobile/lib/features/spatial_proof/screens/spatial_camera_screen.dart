

import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'dart:io';

import '../../../core/theme/semantic_colors.dart';
import '../models/gps_signature.dart';
import '../bloc/spatial_proof_bloc.dart';

class SpatialCameraScreen extends StatefulWidget {
  const SpatialCameraScreen({super.key});

  @override
  State<SpatialCameraScreen> createState() => _SpatialCameraScreenState();
}

class _SpatialCameraScreenState extends State<SpatialCameraScreen> {
  CameraController? _cameraController;
  // ignore: unused_field
  MaplibreMapController? _mapController;
  
  bool _isInitializing = true;
  bool _hasPermissions = false;
  String _errorMessage = '';
  
  Position? _currentPosition;
  GpsSignature? _currentSignature;

  @override
  void initState() {
    super.initState();
    _initializeHardware();
  }

  Future<void> _initializeHardware() async {
    try {
      // 1. Check and Request Permissions (Zero-Silent Failure Protocol)
      final statuses = await [
        Permission.camera,
        Permission.locationWhenInUse,
      ].request();

      if (statuses[Permission.camera] != PermissionStatus.granted ||
          statuses[Permission.locationWhenInUse] != PermissionStatus.granted) {
        setState(() {
          _hasPermissions = false;
          _isInitializing = false;
          _errorMessage = 'Camera and Location permissions are required for Spatial Proofs.';
        });
        return;
      }

      _hasPermissions = true;

      // 2. Initialize Camera
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        throw Exception('No cameras available on this device.');
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

      // 3. Acquire First GPS Lock
      _currentPosition = await Geolocator.getCurrentPosition();
      
      // Update our cryptographic signature
      _updateSignature();

      if (mounted) {
        setState(() {
          _isInitializing = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isInitializing = false;
          _errorMessage = 'Hardware error: \${e.toString()}';
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

  void _onMapCreated(MaplibreMapController controller) {
    _mapController = controller;
  }

  Future<void> _captureSpatialProof() async {
    if (_cameraController == null || !_cameraController!.value.isInitialized) return;
    if (_currentPosition == null) return;
    if (_currentSignature == null) return;

    try {
      // Refresh GPS exactly before snapping
      _currentPosition = await Geolocator.getCurrentPosition();
      _updateSignature();
      
      final xFile = await _cameraController!.takePicture();
      final file = File(xFile.path);
      
      // Dispatch to the genuine BLoC
      if (mounted) {
        context.read<SpatialProofBloc>().add(
          SubmitProofRequested(
             file: file,
             projectId: "current_project_id", // Would come from route args
             itemId: "current_item_id",       // Would come from route args
             signature: _currentSignature!,
          )
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
           SnackBar(
             content: Text('Failed to capture picture: \$e'),
             backgroundColor: context.colors.error,
           ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isInitializing) {
      return Scaffold(
        backgroundColor: context.colors.backgroundPrimary,
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(color: context.colors.primaryBrand),
              const SizedBox(height: 16),
              Text('Securing Hardware Uplink...', style: TextStyle(color: context.colors.textSecondary)),
            ],
          ),
        ),
      );
    }

    if (!_hasPermissions || _errorMessage.isNotEmpty) {
      return Scaffold(
        backgroundColor: context.colors.backgroundPrimary,
        appBar: AppBar(title: const Text('Spatial Guard')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.warning_amber_rounded, size: 64, color: context.colors.error),
                const SizedBox(height: 16),
                Text(
                  _errorMessage,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: context.colors.textPrimary, fontSize: 16),
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _initializeHardware,
                  style: ElevatedButton.styleFrom(backgroundColor: context.colors.primaryBrand),
                  child: const Text('Retry Authorization', style: TextStyle(color: Colors.white)),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: BlocConsumer<SpatialProofBloc, SpatialProofState>(
        listener: (context, state) {
          if (state is SpatialProofSuccess) {
            ScaffoldMessenger.of(context).showSnackBar(
               SnackBar(
                 content: Text('Spatial Proof Secured & Uploaded! Hash: \${_currentSignature!.clientHash.substring(0, 8)}...'),
                 backgroundColor: context.colors.success,
               ),
            );
            // Return to previous screen after success
            Future.delayed(const Duration(seconds: 2), () {
              if (mounted) Navigator.pop(context);
            });
          } else if (state is SpatialProofError) {
             ScaffoldMessenger.of(context).showSnackBar(
               SnackBar(
                 content: Text('Upload failed: \${state.message}'),
                 backgroundColor: context.colors.error,
               ),
            );
          }
        },
        builder: (context, state) {
          final isUploading = state is SpatialProofUploading || state is SpatialProofProcessing;
          return Stack(
            children: [
              // 1. Full Screen Camera View
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
            
          // 2. Picture In Picture Map
          Positioned(
            top: 60,
            right: 16,
            child: Container(
              width: 120,
              height: 160,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: context.colors.glassCard, width: 2),
                boxShadow: const [BoxShadow(color: Colors.black45, blurRadius: 10)],
              ),
              clipBehavior: Clip.antiAlias,
              child: MaplibreMap(
                onMapCreated: _onMapCreated,
                initialCameraPosition: CameraPosition(
                  target: LatLng(_currentPosition!.latitude, _currentPosition!.longitude),
                  zoom: 15.0,
                ),
                styleString: "https://tiles.nammerha.com/styles/basic-preview/style.json",
                myLocationEnabled: true,
                myLocationRenderMode: MyLocationRenderMode.GPS,
                compassEnabled: false,
              ),
            ),
          ),
          
          // 3. Telemetry Overlay
          Positioned(
            top: 60,
            left: 16,
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.black54,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'LAT: \${_currentPosition?.latitude.toStringAsFixed(5)}',
                    style: const TextStyle(color: Colors.greenAccent, fontFamily: 'monospace', fontSize: 12),
                  ),
                  Text(
                    'LNG: \${_currentPosition?.longitude.toStringAsFixed(5)}',
                    style: const TextStyle(color: Colors.greenAccent, fontFamily: 'monospace', fontSize: 12),
                  ),
                  Text(
                    'ACC: ±\${_currentPosition?.accuracy.toStringAsFixed(1)}m',
                    style: const TextStyle(color: Colors.amberAccent, fontFamily: 'monospace', fontSize: 12),
                  ),
                  const SizedBox(height: 4),
                  if (_currentSignature != null)
                    Text(
                      'SIG: \${_currentSignature!.clientHash.substring(0, 16)}',
                      style: const TextStyle(color: Colors.white70, fontFamily: 'monospace', fontSize: 10),
                    ),
                ],
              ),
            ),
          ),

          // 4. Capture Button Area
          Positioned(
            bottom: 30,
            left: 0,
            right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                GestureDetector(
                  onTap: isUploading ? null : _captureSpatialProof,
                  child: Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 4),
                      color: isUploading ? Colors.grey : context.colors.primaryBrand.withAlpha(200),
                    ),
                    child: isUploading 
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Icon(Icons.camera, color: Colors.white, size: 36),
                  ),
                ),
              ],
            ),
          ),
        ],
      );
     }),
    );
  }
}
