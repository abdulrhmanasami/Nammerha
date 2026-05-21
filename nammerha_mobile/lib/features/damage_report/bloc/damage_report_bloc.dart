import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:geolocator/geolocator.dart';
import '../data/damage_report_repository.dart';
import '../../../core/i18n/error_keys.dart';
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
    emit(DamageReportLoading(state.formData, message: 'msg_detecting_gps'));
    try {
      final position = await repository.detectGPS();
      final newData = state.formData.copyWith(gpsPosition: position);
      emit(DamageReportDraft(newData));
    } on LocationServiceDisabledException {
      // HIGH-MOB-005 FIX: Specific error key for GPS service disabled.
      emit(DamageReportError(state.formData, ErrorKeys.gpsPermissionRequired));
      // CRIT-MOB-001 FIX: Do NOT re-emit DamageReportDraft here.
      // The BlocConsumer.listener shows the SnackBar, and the user's next
      // interaction (editing form, tapping retry) transitions back naturally.
    } catch (e) {
      // HIGH-MOB-005 FIX: Classify exception — permission denied vs network.
      // PREVIOUS: e.toString() leaked "PlatformException(PERMISSION_DENIED, ...)"
      final errorKey = e.toString().contains(ErrorKeys.gpsPermissionRequired)
          ? ErrorKeys.gpsPermissionRequired
          : ErrorKeys.network;
      emit(DamageReportError(state.formData, errorKey));
      // CRIT-MOB-001 FIX: Terminal state — no immediate DamageReportDraft re-emit.
    }
  }

  Future<void> _onSubmitReport(SubmitReportEvent event, Emitter<DamageReportState> emit) async {
    emit(DamageReportLoading(state.formData, message: 'msg_submitting_report'));
    try {
      await repository.submitReport(state.formData);
      emit(DamageReportSuccess(state.formData));
    } catch (e) {
      emit(DamageReportError(state.formData, ErrorKeys.damageReportFailed));
      // CRIT-MOB-001 FIX: Terminal state — no immediate DamageReportDraft re-emit.
      // The listener shows the SnackBar. The user retries by tapping Submit again,
      // which fires a new SubmitReportEvent and transitions Draft → Loading → ...
    }
  }
}
