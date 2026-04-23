import 'package:equatable/equatable.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';

class DamageReportData extends Equatable {
  final int currentStep;
  final String? damageType;
  final String governorate;
  final String neighborhood;
  final Position? gpsPosition;
  final String description;
  final String addressText;
  final List<XFile> photos;

  const DamageReportData({
    this.currentStep = 0,
    this.damageType,
    this.governorate = '',
    this.neighborhood = '',
    this.gpsPosition,
    this.description = '',
    this.addressText = '',
    this.photos = const [],
  });

  DamageReportData copyWith({
    int? currentStep,
    String? damageType,
    String? governorate,
    String? neighborhood,
    Position? gpsPosition,
    String? description,
    String? addressText,
    List<XFile>? photos,
  }) {
    return DamageReportData(
      currentStep: currentStep ?? this.currentStep,
      damageType: damageType ?? this.damageType,
      governorate: governorate ?? this.governorate,
      neighborhood: neighborhood ?? this.neighborhood,
      gpsPosition: gpsPosition ?? this.gpsPosition,
      description: description ?? this.description,
      addressText: addressText ?? this.addressText,
      photos: photos ?? this.photos,
    );
  }

  bool get canProceed {
    switch (currentStep) {
      case 0:
        return damageType != null;
      case 1:
        return governorate.isNotEmpty && gpsPosition != null;
      case 2:
        return photos.isNotEmpty;
      case 3:
        return description.trim().isNotEmpty;
      default:
        return false;
    }
  }

  @override
  List<Object?> get props => [
        currentStep,
        damageType,
        governorate,
        neighborhood,
        gpsPosition,
        description,
        addressText,
        photos,
      ];
}
