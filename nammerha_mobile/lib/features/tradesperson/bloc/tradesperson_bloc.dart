import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/tradesperson_repository.dart';
import 'tradesperson_event.dart';
import 'tradesperson_state.dart';

class TradespersonBloc extends Bloc<TradespersonEvent, TradespersonState> {
  final TradespersonRepository repository;

  TradespersonBloc({required this.repository}) : super(const TradespersonInitial()) {
    on<LoadTradespersonTabEvent>(_onLoadTab);
    on<UpdateAvailabilityEvent>(_onUpdateAvailability);
    on<AcceptRequestEvent>(_onAcceptRequest);
    on<RespondToAssignmentEvent>(_onRespondAssignment);
    on<LoadProfileEvent>(_onLoadProfile);
  }

  Future<void> _onLoadTab(LoadTradespersonTabEvent event, Emitter<TradespersonState> emit) async {
    emit(TradespersonLoading(state.data));
    try {
      var updatedData = state.data;
      switch (event.tabIndex) {
        case 0:
          updatedData = await repository.loadDashboard();
          break;
        case 1:
          updatedData = await repository.loadRequests(updatedData);
          break;
        case 2:
          updatedData = await repository.loadAssignments(updatedData);
          break;
        case 3:
          updatedData = await repository.loadEarnings(updatedData);
          break;
        case 4:
          updatedData = await repository.loadProfile(updatedData);
          break;
      }
      emit(TradespersonLoaded(updatedData));
    } catch (e) {
      emit(TradespersonError(state.data, 'حدث خطأ أثناء تحميل البيانات'));
      emit(TradespersonLoaded(state.data));
    }
  }

  Future<void> _onLoadProfile(LoadProfileEvent event, Emitter<TradespersonState> emit) async {
    try {
      final updatedData = await repository.loadProfile(state.data);
      emit(TradespersonLoaded(updatedData));
    } catch (_) {}
  }

  Future<void> _onUpdateAvailability(UpdateAvailabilityEvent event, Emitter<TradespersonState> emit) async {
    try {
      await repository.updateAvailability(event.availability);
      final updatedData = state.data.copyWith(availability: event.availability);
      emit(TradespersonLoaded(updatedData));
    } catch (e) {
      emit(TradespersonError(state.data, 'حدث خطأ أثناء تحديث حالة التواجد'));
      emit(TradespersonLoaded(state.data));
    }
  }

  Future<void> _onAcceptRequest(AcceptRequestEvent event, Emitter<TradespersonState> emit) async {
    emit(TradespersonLoading(state.data));
    try {
      await repository.acceptRequest(event.requestId);
      emit(ActionSuccess(state.data, 'تم قبول المهمة بنجاح'));
      // Reload requests
      final updatedData = await repository.loadRequests(state.data);
      emit(TradespersonLoaded(updatedData));
    } catch (e) {
      emit(TradespersonError(state.data, 'فشل قبول المهمة'));
      emit(TradespersonLoaded(state.data));
    }
  }

  Future<void> _onRespondAssignment(RespondToAssignmentEvent event, Emitter<TradespersonState> emit) async {
    emit(TradespersonLoading(state.data));
    try {
      await repository.respondToAssignment(event.assignmentId, event.accept);
      emit(ActionSuccess(state.data, event.accept ? 'تم قبول المهمة' : 'تم رفض المهمة'));
      // Reload assignments
      final updatedData = await repository.loadAssignments(state.data);
      emit(TradespersonLoaded(updatedData));
    } catch (e) {
      emit(TradespersonError(state.data, 'فشل تنفيذ الإجراء'));
      emit(TradespersonLoaded(state.data));
    }
  }
}
