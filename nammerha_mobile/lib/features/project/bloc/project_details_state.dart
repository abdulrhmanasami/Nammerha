import 'package:equatable/equatable.dart';

abstract class ProjectDetailsState extends Equatable {
  const ProjectDetailsState();

  @override
  List<Object?> get props => [];
}

class ProjectDetailsInitial extends ProjectDetailsState {}

class ProjectDetailsLoading extends ProjectDetailsState {}

class ProjectDetailsLoaded extends ProjectDetailsState {
  final Map<String, dynamic> project;
  final List<Map<String, dynamic>> boqItems;
  final Map<String, int> selectedQuantities;
  
  const ProjectDetailsLoaded({
    required this.project,
    required this.boqItems,
    this.selectedQuantities = const {},
  });

  ProjectDetailsLoaded copyWith({
    Map<String, dynamic>? project,
    List<Map<String, dynamic>>? boqItems,
    Map<String, int>? selectedQuantities,
  }) {
    return ProjectDetailsLoaded(
      project: project ?? this.project,
      boqItems: boqItems ?? this.boqItems,
      selectedQuantities: selectedQuantities ?? this.selectedQuantities,
    );
  }

  @override
  List<Object?> get props => [project, boqItems, selectedQuantities];
}

class ProjectDetailsError extends ProjectDetailsState {
  final String message;
  const ProjectDetailsError(this.message);

  @override
  List<Object?> get props => [message];
}
