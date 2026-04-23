import 'package:geolocator/geolocator.dart';
import '../../../core/services/api_services.dart';
import '../models/damage_report_data.dart';
import '../widgets/damage_type_selector.dart';

class DamageReportRepository {
  final HomeownerApi _api;

  DamageReportRepository({HomeownerApi? api}) : _api = api ?? HomeownerApi();

  Future<Position> detectGPS() async {
    final permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      throw Exception('صلاحية الموقع مطلوبة لتحديد الإحداثيات');
    }
    return await Geolocator.getCurrentPosition(
      desiredAccuracy: LocationAccuracy.high,
    );
  }

  Future<void> submitReport(DamageReportData data) async {
    final damageLabel = DamageTypeSelector.categories
        .firstWhere((c) => c.key == data.damageType,
            orElse: () => DamageTypeSelector.categories.last)
        .label;
    final title = 'إصلاح $damageLabel — ${data.governorate}';

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
