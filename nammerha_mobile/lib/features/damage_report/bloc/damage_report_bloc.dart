import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/damage_report_repository.dart';
import '../models/damage_report_data.dart';
import 'damage_report_event.dart';
import 'damage_report_state.dart';

class DamageReportBloc extends Bloc<DamageReportEvent, DamageReportState> {
  final DamageReportRepository repository;

  DamageReportBloc({required this.repository}) : super(const DamageReportDraft(DamageReportData())) {
    on<NextStepEvent>(_onNextStep);
    on<PrevStepEvent>(_onPrevStep);
    on<UpdateFormDataEvent>(_onUpdateForm);
    on<DetectGPSEvent>(_onDetectGPS);
    on<SubmitReportEvent>(_onSubmitReport);
  }

  void _onNextStep(NextStepEvent event, Emitter<DamageReportState> emit) {
    if (state.formData.currentStep < 3) {
      final newData = state.formData.copyWith(currentStep: state.formData.currentStep + 1);
      emit(DamageReportDraft(newData));
    }
  }

  void _onPrevStep(PrevStepEvent event, Emitter<DamageReportState> emit) {
    if (state.formData.currentStep > 0) {
      final newData = state.formData.copyWith(currentStep: state.formData.currentStep - 1);
      emit(DamageReportDraft(newData));
    }
  }

  void _onUpdateForm(UpdateFormDataEvent event, Emitter<DamageReportState> emit) {
    emit(DamageReportDraft(event.newData));
  }

  Future<void> _onDetectGPS(DetectGPSEvent event, Emitter<DamageReportState> emit) async {
    emit(DamageReportLoading(state.formData, message: 'جاري تحديد الموقع...'));
    try {
      final position = await repository.detectGPS();
      final newData = state.formData.copyWith(gpsPosition: position);
      emit(DamageReportDraft(newData));
    } catch (e) {
      emit(DamageReportError(state.formData, e.toString()));
      // Reset back to draft after emitting error so user can rectify
      emit(DamageReportDraft(state.formData));
    }
  }

  Future<void> _onSubmitReport(SubmitReportEvent event, Emitter<DamageReportState> emit) async {
    emit(DamageReportLoading(state.formData, message: 'جاري إرسال التقرير...'));
    try {
      await repository.submitReport(state.formData);
      emit(DamageReportSuccess(state.formData));
    } catch (e) {
      emit(DamageReportError(state.formData, 'فشل الإرسال: ${e.toString()}'));
      // Reset back to draft
      emit(DamageReportDraft(state.formData));
    }
  }
}
