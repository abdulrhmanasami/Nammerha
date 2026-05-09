import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/homeowner_repository.dart';
import 'homeowner_event.dart';
import 'homeowner_state.dart';

class HomeownerBloc extends Bloc<HomeownerEvent, HomeownerState> {
  final HomeownerRepository repository;

  HomeownerBloc({required this.repository}) : super(const HomeownerInitial()) {
    on<LoadHomeownerTabEvent>(_onLoadTab);
    on<RespondToApprovalEvent>(_onRespondApproval);
    on<CancelServiceRequestEvent>(_onCancelServiceRequest);
  }

  Future<void> _onLoadTab(LoadHomeownerTabEvent event, Emitter<HomeownerState> emit) async {
    emit(HomeownerLoading(state.data));
    try {
      var updatedData = state.data;
      switch (event.tabIndex) {
        case 0:
          updatedData = await repository.loadDashboard();
          break;
        case 1:
          updatedData = await repository.loadProjects(updatedData);
          break;
        case 2:
          updatedData = await repository.loadServiceRequests(updatedData);
          break;
        case 3:
          updatedData = await repository.loadApprovals(updatedData);
          break;
        case 4:
          updatedData = await repository.loadEscrow(updatedData);
          break;
      }
      emit(HomeownerLoaded(updatedData));
    } catch (e) {
      // M2 FIX: Error message uses generic key — will be localized via i18n
      emit(HomeownerError(state.data, 'Failed to load data'));
    }
  }

  Future<void> _onRespondApproval(RespondToApprovalEvent event, Emitter<HomeownerState> emit) async {
    emit(HomeownerLoading(state.data));
    try {
      await repository.respondToApproval(event.approvalId, event.decision);
      emit(ApprovalResponseSuccess(state.data));
      // Reload approvals and dashboard to reflect changes
      var updatedData = await repository.loadApprovals(state.data);
      updatedData = await repository.loadDashboard();
      emit(HomeownerLoaded(updatedData));
    } catch (e) {
      emit(HomeownerError(state.data, 'Action failed — please try again'));
      emit(HomeownerLoaded(state.data)); // Fallback
    }
  }

  // C4 FIX: Cancel service request handler
  Future<void> _onCancelServiceRequest(CancelServiceRequestEvent event, Emitter<HomeownerState> emit) async {
    emit(HomeownerLoading(state.data));
    try {
      await repository.cancelServiceRequest(event.requestId);
      // Reload service requests + stats to reflect cancellation
      var updatedData = await repository.loadServiceRequests(state.data);
      updatedData = await repository.loadDashboard();
      emit(HomeownerLoaded(updatedData));
    } catch (e) {
      emit(HomeownerError(state.data, 'Cancel failed — please try again'));
      emit(HomeownerLoaded(state.data));
    }
  }
}
