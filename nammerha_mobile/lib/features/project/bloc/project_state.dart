import 'package:equatable/equatable.dart';
import '../data/models/project_model.dart';

abstract class ProjectState extends Equatable {
  const ProjectState();

  @override
  List<Object> get props => [];
}

class ProjectInitial extends ProjectState {}

class ProjectLoading extends ProjectState {}

class ProjectLoaded extends ProjectState {
  final List<ProjectModel> projects;

  const ProjectLoaded(this.projects);

  @override
  List<Object> get props => [projects];
}

class ProjectDetailsLoaded extends ProjectState {
  final Map<String, dynamic> project;
  final List<Map<String, dynamic>> boqItems;

  const ProjectDetailsLoaded(this.project, this.boqItems);

  @override
  List<Object> get props => [project, boqItems];
}

class ProjectError extends ProjectState {
  final String message;

  const ProjectError(this.message);

  @override
  List<Object> get props => [message];
}

