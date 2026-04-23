import 'package:equatable/equatable.dart';
import '../models/damage_report_data.dart';

abstract class DamageReportEvent extends Equatable {
  const DamageReportEvent();

  @override
  List<Object?> get props => [];
}

class NextStepEvent extends DamageReportEvent {}
class PrevStepEvent extends DamageReportEvent {}

class UpdateFormDataEvent extends DamageReportEvent {
  final DamageReportData newData;

  const UpdateFormDataEvent(this.newData);

  @override
  List<Object?> get props => [newData];
}

class DetectGPSEvent extends DamageReportEvent {}
class SubmitReportEvent extends DamageReportEvent {}
