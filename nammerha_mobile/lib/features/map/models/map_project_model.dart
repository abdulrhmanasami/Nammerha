import 'package:latlong2/latlong.dart';

// ═══════════════════════════════════════════════════════════════════════════
// MapProjectModel — Strongly-Typed Geospatial Data Contract
// ═══════════════════════════════════════════════════════════════════════════
// Parses a raw API response map (Map<String, dynamic>) into a concrete,
// type-safe struct. Filters out projects with invalid coordinates (0.0/null)
// at the factory level — never lets bad data reach the UI.
// ═══════════════════════════════════════════════════════════════════════════

class MapProjectModel {
  final String projectId;
  final String title;
  final String region;
  final String damageType;
  final String status;
  final double gpsLat;
  final double gpsLng;
  final int fundingGoal;
  final int fundingRaised;
  final double fundingPercent;
  final String? coverImageUrl;

  const MapProjectModel({
    required this.projectId,
    required this.title,
    required this.region,
    required this.damageType,
    required this.status,
    required this.gpsLat,
    required this.gpsLng,
    required this.fundingGoal,
    required this.fundingRaised,
    required this.fundingPercent,
    this.coverImageUrl,
  });

  /// Converts a raw API map into a typed model.
  /// Returns null if GPS coordinates are missing or invalid (0.0).
  static MapProjectModel? tryFromJson(Map<String, dynamic> json) {
    final lat = (json['gps_lat'] as num?)?.toDouble() ?? 0.0;
    final lng = (json['gps_lng'] as num?)?.toDouble() ?? 0.0;

    // Reject projects without valid coordinates — they cannot be plotted.
    if (lat == 0.0 && lng == 0.0) return null;

    final goal = (json['funding_goal'] ?? json['total_estimated_cost'] ?? 0) as num;
    final raised = (json['funding_raised'] ?? json['total_escrow_released'] ?? 0) as num;
    final percent =
        goal > 0 ? ((raised / goal) * 100).clamp(0, 100).toDouble() : 0.0;

    return MapProjectModel(
      projectId: json['project_id']?.toString() ?? json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'مشروع غير معنوَن',
      region: json['region']?.toString() ?? 'غير محدد',
      damageType: json['damage_type']?.toString() ?? '',
      status: json['status']?.toString() ?? 'active',
      gpsLat: lat,
      gpsLng: lng,
      fundingGoal: goal.toInt(),
      fundingRaised: raised.toInt(),
      fundingPercent: percent,
      coverImageUrl: json['cover_image_url'] as String?,
    );
  }

  /// Converts this model to a latlong2 LatLng for use with flutter_map.
  LatLng get latLng => LatLng(gpsLat, gpsLng);

  /// True when the project has a cover image URL.
  bool get hasCover => coverImageUrl != null && coverImageUrl!.isNotEmpty;
}

/// Isolate-safe top-level function to parse the raw project list.
/// Called via Isolate.run() to avoid blocking the UI thread.
List<MapProjectModel> parseMapProjects(List<Map<String, dynamic>> rawList) {
  final result = <MapProjectModel>[];
  for (final item in rawList) {
    final model = MapProjectModel.tryFromJson(item);
    if (model != null && model.projectId.isNotEmpty) {
      result.add(model);
    }
  }
  return result;
}
