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

class PreHydrateProjectRequested extends ProjectDetailsEvent {
  final String projectId;
  final Map<String, dynamic> payload;

  const PreHydrateProjectRequested(this.projectId, this.payload);

  @override
  List<Object?> get props => [projectId, payload];
}


class UpdateBOQQuantityRequested extends ProjectDetailsEvent {
  final String itemId;
  final int quantity;
  
  const UpdateBOQQuantityRequested({required this.itemId, required this.quantity});

  @override
  List<Object?> get props => [itemId, quantity];
}

class ClearBOQSelectionsRequested extends ProjectDetailsEvent {
  const ClearBOQSelectionsRequested();
}
