import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/project_repository.dart';
import '../data/models/project_model.dart';
import 'project_event.dart';
import 'project_state.dart';

class ProjectBloc extends Bloc<ProjectEvent, ProjectState> {
  final ProjectRepository repository;

  ProjectBloc({required this.repository}) : super(ProjectInitial()) {
    on<FetchEngineerProjectsEvent>(_onFetchEngineerProjects);
    on<FetchProjectDetailsEvent>(_onFetchProjectDetails);
  }

  Future<void> _onFetchEngineerProjects(
    FetchEngineerProjectsEvent event,
    Emitter<ProjectState> emit,
  ) async {
    emit(ProjectLoading());
    try {
      final rawProjects = await repository.fetchEngineerProjects();
      final projects = rawProjects.map((json) => ProjectModel.fromJson(json)).toList();
      emit(ProjectLoaded(projects));
    } catch (e) {
      emit(ProjectError(e.toString()));
    }
  }

  Future<void> _onFetchProjectDetails(
    FetchProjectDetailsEvent event,
    Emitter<ProjectState> emit,
  ) async {
    emit(ProjectLoading());
    try {
      final project = await repository.fetchProjectDetails(event.projectId);
      final boqItems = await repository.fetchProjectBOQ(event.projectId);
      emit(ProjectDetailsLoaded(project ?? <String, dynamic>{}, boqItems));
    } catch (e) {
      emit(ProjectError(e.toString()));
    }
  }
}

