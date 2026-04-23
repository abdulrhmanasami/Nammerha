import 'package:equatable/equatable.dart';

abstract class ProjectEvent extends Equatable {
  const ProjectEvent();

  @override
  List<Object> get props => [];
}

class FetchEngineerProjectsEvent extends ProjectEvent {}

class FetchProjectDetailsEvent extends ProjectEvent {
  final String projectId;

  const FetchProjectDetailsEvent(this.projectId);

  @override
  List<Object> get props => [projectId];
}

