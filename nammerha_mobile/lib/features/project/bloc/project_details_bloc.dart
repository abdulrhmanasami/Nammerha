import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/project_repository.dart';
import 'project_details_event.dart';
import 'project_details_state.dart';

class ProjectDetailsBloc extends Bloc<ProjectDetailsEvent, ProjectDetailsState> {
  final ProjectRepository _repository;

  ProjectDetailsBloc({ProjectRepository? repository})
      : _repository = repository ?? ProjectRepository(),
        super(ProjectDetailsInitial()) {
    on<LoadProjectDetailsRequested>(_onLoadProjectDetails);
    on<PreHydrateProjectRequested>(_onPreHydrateProject);
    on<UpdateBOQQuantityRequested>(_onUpdateBOQQuantity);
    on<ClearBOQSelectionsRequested>(_onClearBOQSelections);
  }

  Future<void> _onLoadProjectDetails(
      LoadProjectDetailsRequested event, Emitter<ProjectDetailsState> emit) async {
    emit(ProjectDetailsLoading());
    try {
      // Load independently — BOQ failure should not prevent viewing the project
      Map<String, dynamic>? projectData;
      List<Map<String, dynamic>> boqData = [];

      try {
        projectData = await _repository.getProject(event.projectId);
      } catch (e) {
      debugPrint('[Nammerha] bloc/project_details_bloc: $e');
    }

      try {
        boqData = await _repository.getProjectBOQ(event.projectId);
      } catch (e) {
      debugPrint('[Nammerha] bloc/project_details_bloc: $e');
    }
      
      if (projectData == null) {
        emit(const ProjectDetailsError('err_project_not_found'));
        return;
      }
      
      emit(ProjectDetailsLoaded(
        project: projectData,
        boqItems: boqData,
        selectedQuantities: const {},
      ));
    } catch (e) {
      debugPrint('[Nammerha] bloc/project_details_bloc: $e');
      emit(const ProjectDetailsError('err_project_details_load'));
    }
  }

  Future<void> _onPreHydrateProject(
      PreHydrateProjectRequested event, Emitter<ProjectDetailsState> emit) async {
    // 1. Inject payload immediately into state (WSOD Prevention)
    emit(ProjectDetailsLoaded(
      project: {
        'id': event.projectId,
        'project_title': event.payload['project_title'] ?? event.payload['title'] ?? '...',
        'total_estimated_cost': event.payload['amount'] ?? event.payload['total_amount'] ?? 0,
        // Fill defaults for UI safety
        'funded_percentage': 0.0,
        'description': '...',
        'address_text': '...',
        'damage_type': '...',
      },
      boqItems: const [],
      selectedQuantities: const {},
    ));

    // 2. Background Sync
    add(LoadProjectDetailsRequested(event.projectId));
  }

  void _onUpdateBOQQuantity(
      UpdateBOQQuantityRequested event, Emitter<ProjectDetailsState> emit) {
    if (state is ProjectDetailsLoaded) {
      final currentState = state as ProjectDetailsLoaded;
      
      // Update quantities map immutably
      final newQuantities = Map<String, int>.from(currentState.selectedQuantities);
      if (event.quantity <= 0) {
        newQuantities.remove(event.itemId);
      } else {
        newQuantities[event.itemId] = event.quantity;
      }
      
      emit(currentState.copyWith(selectedQuantities: newQuantities));
    }
  }

  void _onClearBOQSelections(
      ClearBOQSelectionsRequested event, Emitter<ProjectDetailsState> emit) {
    if (state is ProjectDetailsLoaded) {
      final currentState = state as ProjectDetailsLoaded;
      emit(currentState.copyWith(selectedQuantities: const {}));
    }
  }
}
