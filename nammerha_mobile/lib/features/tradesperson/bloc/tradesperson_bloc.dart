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
      emit(TradespersonError(state.data, 'Failed to load data'));
      emit(TradespersonLoaded(state.data));
    }
  }

  Future<void> _onLoadProfile(LoadProfileEvent event, Emitter<TradespersonState> emit) async {
    try {
      final updatedData = await repository.loadProfile(state.data);
      emit(TradespersonLoaded(updatedData));
    } catch (e) {
      // C3 FIX: Silent catch eliminated — surface error
      emit(TradespersonError(state.data, 'Failed to load profile'));
      emit(TradespersonLoaded(state.data));
    }
  }

  Future<void> _onUpdateAvailability(UpdateAvailabilityEvent event, Emitter<TradespersonState> emit) async {
    try {
      await repository.updateAvailability(event.availability);
      final updatedData = state.data.copyWith(availability: event.availability);
      emit(TradespersonLoaded(updatedData));
    } catch (e) {
      emit(TradespersonError(state.data, 'Failed to update availability'));
      emit(TradespersonLoaded(state.data));
    }
  }

  Future<void> _onAcceptRequest(AcceptRequestEvent event, Emitter<TradespersonState> emit) async {
    emit(TradespersonLoading(state.data));
    try {
      await repository.acceptRequest(event.requestId);
      emit(ActionSuccess(state.data, 'Task accepted successfully'));
      // Reload requests
      final updatedData = await repository.loadRequests(state.data);
      emit(TradespersonLoaded(updatedData));
    } catch (e) {
      emit(TradespersonError(state.data, 'Failed to accept task'));
      emit(TradespersonLoaded(state.data));
    }
  }

  Future<void> _onRespondAssignment(RespondToAssignmentEvent event, Emitter<TradespersonState> emit) async {
    emit(TradespersonLoading(state.data));
    try {
      await repository.respondToAssignment(event.assignmentId, event.accept);
      emit(ActionSuccess(state.data, event.accept ? 'Task accepted' : 'Task rejected'));
      // Reload assignments
      final updatedData = await repository.loadAssignments(state.data);
      emit(TradespersonLoaded(updatedData));
    } catch (e) {
      emit(TradespersonError(state.data, 'Action failed'));
      emit(TradespersonLoaded(state.data));
    }
  }
}
