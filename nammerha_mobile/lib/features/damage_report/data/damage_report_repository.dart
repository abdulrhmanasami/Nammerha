import 'package:geolocator/geolocator.dart';
import '../../../core/services/api_services.dart';
import '../../../core/i18n/error_keys.dart';
import '../../../core/i18n/translations.dart';
import '../models/damage_report_data.dart';
import '../widgets/damage_type_selector.dart';

class DamageReportRepository {
  final HomeownerApi _api;

  DamageReportRepository({HomeownerApi? api}) : _api = api ?? HomeownerApi();

  Future<Position> detectGPS() async {
    final permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      throw Exception(ErrorKeys.gpsPermissionRequired);
    }
    final position = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
      ),
    );
    if (position.isMocked) {
      throw Exception('Mock location detected. Please disable fake GPS.');
    }
    return position;
  }

  Future<void> submitReport(DamageReportData data) async {
    final damageLabel = DamageTypeSelector.categories
        .firstWhere((c) => c.key == data.damageType,
            orElse: () => DamageTypeSelector.categories.last)
        .label;
    // P1-001i: Use translation template for locale-aware project title
    final titleTemplate = kTranslations['dr_project_title_template']?['ar'] ?? 'Repair \$1 — \$2';
    final title = titleTemplate.replaceAll('\$1', damageLabel).replaceAll('\$2', data.governorate);

    final addr = data.addressText.isNotEmpty 
        ? '${data.governorate}, ${data.neighborhood}, ${data.addressText}' 
        : '${data.governorate}, ${data.neighborhood}';

    await _api.createProject(
      title: title,
      damageType: data.damageType!,
      description: data.description.isNotEmpty ? data.description : null,
      gpsLat: data.gpsPosition!.latitude,
      gpsLng: data.gpsPosition!.longitude,
      addressText: addr,
    );
  }
}
