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
      } catch (_) {}

      try {
        boqData = await _repository.getProjectBOQ(event.projectId);
      } catch (_) {}
      
      if (projectData == null) {
        emit(const ProjectDetailsError('المشروع غير موجود'));
        return;
      }
      
      emit(ProjectDetailsLoaded(
        project: projectData,
        boqItems: boqData,
        selectedQuantities: const {},
      ));
    } catch (e) {
      emit(const ProjectDetailsError('حدث خطأ في تحميل تفاصيل المشروع'));
    }
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
