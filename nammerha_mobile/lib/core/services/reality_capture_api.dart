import '../network/api_client.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// REALITY CAPTURE API — Mirrors backend/src/routes/reality-capture.routes.ts
// ═══════════════════════════════════════════════════════════════════════════════
// GAP-H2 FIX: 360° panoramic capture system for construction site documentation.
// Uses phone's native camera panorama mode for capture, then uploads + registers.
//
// Backend endpoints:
//   POST /:projectId/captures — Submit capture (engineer only)
//   GET  /:projectId/captures — Browse project captures
//   GET  /:projectId/hidden-works — Pre-concrete evidence (Reveal Mode)
//   POST /captures/:captureId/verify — Admin/auditor verification
//   POST /captures/:captureId/annotate — Add annotation
//   GET  /captures/:captureId/annotations — List annotations
//   POST /:projectId/floor-plans — Upload floor plan
//   GET  /:projectId/floor-plans — List floor plans
// ═══════════════════════════════════════════════════════════════════════════════

/// Construction phases matching backend ConstructionPhase type.
enum ConstructionPhase {
  demolition('demolition', 'هدم'),
  foundation('foundation', 'أساسات'),
  structural('structural', 'هيكلي'),
  plumbingPreConcrete('plumbing_pre_concrete', 'سباكة (قبل الصب)'),
  electricalPreConcrete('electrical_pre_concrete', 'كهرباء (قبل الصب)'),
  concretePour('concrete_pour', 'صب خرسانة'),
  masonry('masonry', 'بناء'),
  plastering('plastering', 'لياسة'),
  finishing('finishing', 'تشطيب'),
  finalInspection('final_inspection', 'فحص نهائي');

  final String value;
  final String labelAr;
  const ConstructionPhase(this.value, this.labelAr);
}

/// Capture types matching backend CaptureType.
enum CaptureType {
  photo360('photo_360', 'صورة 360°'),
  video360('video_360', 'فيديو 360°'),
  pointCloud('point_cloud', 'سحابة نقطية'),
  photoStandard('photo_standard', 'صورة عادية');

  final String value;
  final String labelAr;
  const CaptureType(this.value, this.labelAr);
}

class RealityCaptureApi {
  final NammerhaApiClient _api;
  RealityCaptureApi({NammerhaApiClient? api})
      : _api = api ?? NammerhaApiClient.instance;

  /// POST /api/reality-capture/:projectId/captures
  Future<Map<String, dynamic>?> submitCapture({
    required String projectId,
    required String fileUrl,
    required ConstructionPhase constructionPhase,
    CaptureType captureType = CaptureType.photo360,
    String? title,
    String? description,
    String? thumbnailUrl,
    int? fileSizeBytes,
    String? cameraModel,
    double? horizontalFov,
    double? heading,
    double? pitch,
    double? gpsLat,
    double? gpsLng,
    double? gpsAccuracyMeters,
    double? altitudeMeters,
    String? floorPlanId,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/reality-capture/$projectId/captures',
      method: 'POST',
      idempotent: true,
      body: {
        'file_url': fileUrl,
        'construction_phase': constructionPhase.value,
        'capture_type': captureType.value,
        if (title != null) 'title': title,
        if (description != null) 'description': description,
        if (thumbnailUrl != null) 'thumbnail_url': thumbnailUrl,
        if (fileSizeBytes != null) 'file_size_bytes': fileSizeBytes,
        if (cameraModel != null) 'camera_model': cameraModel,
        if (horizontalFov != null) 'horizontal_fov': horizontalFov,
        if (heading != null) 'heading': heading,
        if (pitch != null) 'pitch': pitch,
        if (gpsLat != null) 'gps_lat': gpsLat,
        if (gpsLng != null) 'gps_lng': gpsLng,
        if (gpsAccuracyMeters != null) 'gps_accuracy_meters': gpsAccuracyMeters,
        if (altitudeMeters != null) 'altitude_meters': altitudeMeters,
        if (floorPlanId != null) 'floor_plan_id': floorPlanId,
      },
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data;
  }

  /// GET /api/reality-capture/:projectId/captures
  Future<List<Map<String, dynamic>>> getCaptures(
    String projectId, {
    ConstructionPhase? phase,
    CaptureType? type,
    int limit = 50,
    int offset = 0,
  }) async {
    final qs = StringBuffer('?limit=$limit&offset=$offset');
    if (phase != null) qs.write('&phase=${phase.value}');
    if (type != null) qs.write('&type=${type.value}');
    final response = await _api.request<List<dynamic>>(
      '/reality-capture/$projectId/captures$qs',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/reality-capture/:projectId/hidden-works
  Future<List<Map<String, dynamic>>> getHiddenWorks(String projectId) async {
    final response = await _api.request<List<dynamic>>(
      '/reality-capture/$projectId/hidden-works',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// POST /api/reality-capture/captures/:captureId/annotate
  Future<void> addAnnotation(String captureId, {
    required String note,
    double? posX,
    double? posY,
    String? pinType,
  }) async {
    await _api.request(
      '/reality-capture/captures/$captureId/annotate',
      method: 'POST',
      body: {
        'note': note,
        if (posX != null) 'pos_x': posX,
        if (posY != null) 'pos_y': posY,
        if (pinType != null) 'pin_type': pinType,
      },
    );
  }

  /// GET /api/reality-capture/captures/:captureId/annotations
  Future<List<Map<String, dynamic>>> getAnnotations(String captureId) async {
    final response = await _api.request<List<dynamic>>(
      '/reality-capture/captures/$captureId/annotations',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/reality-capture/:projectId/floor-plans
  Future<List<Map<String, dynamic>>> getFloorPlans(String projectId) async {
    final response = await _api.request<List<dynamic>>(
      '/reality-capture/$projectId/floor-plans',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }
}
