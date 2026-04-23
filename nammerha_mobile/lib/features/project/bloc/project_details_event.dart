import 'package:equatable/equatable.dart';

abstract class ProjectDetailsEvent extends Equatable {
  const ProjectDetailsEvent();

  @override
  List<Object?> get props => [];
}

class LoadProjectDetailsRequested extends ProjectDetailsEvent {
  final String projectId;
  const LoadProjectDetailsRequested(this.projectId);

  @override
  List<Object?> get props => [projectId];
}

class UpdateBOQQuantityRequested extends ProjectDetailsEvent {
  final String itemId;
  final int quantity;
  
  const UpdateBOQQuantityRequested({required this.itemId, required this.quantity});

  @override
  List<Object?> get props => [itemId, quantity];
}
