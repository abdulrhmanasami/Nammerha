import 'package:equatable/equatable.dart';
import '../models/damage_report_data.dart';

abstract class DamageReportState extends Equatable {
  final DamageReportData formData;
  const DamageReportState(this.formData);

  @override
  List<Object?> get props => [formData];
}

class DamageReportDraft extends DamageReportState {
  const DamageReportDraft(super.formData);
}

class DamageReportLoading extends DamageReportState {
  final String message;
  const DamageReportLoading(super.formData, {this.message = ''});
  
  @override
  List<Object?> get props => [formData, message];
}

class DamageReportError extends DamageReportState {
  final String error;
  const DamageReportError(super.formData, this.error);

  @override
  List<Object?> get props => [formData, error];
}

class DamageReportSuccess extends DamageReportState {
  const DamageReportSuccess(super.formData);
}

class DamageReportOfflineSaved extends DamageReportState {
  const DamageReportOfflineSaved(super.formData);
}
