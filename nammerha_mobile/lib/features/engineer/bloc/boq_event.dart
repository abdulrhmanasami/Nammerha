import 'package:equatable/equatable.dart';
import '../models/boq_models.dart';

abstract class BoqEvent extends Equatable {
  const BoqEvent();

  @override
  List<Object?> get props => [];
}

class LoadExistingBoqEvent extends BoqEvent {
  final String projectId;
  const LoadExistingBoqEvent(this.projectId);

  @override
  List<Object?> get props => [projectId];
}

class AddBoqItemEvent extends BoqEvent {
  final BoqItemModel item;
  const AddBoqItemEvent(this.item);

  @override
  List<Object?> get props => [item];
}

class RemoveBoqItemEvent extends BoqEvent {
  final int index;
  const RemoveBoqItemEvent(this.index);

  @override
  List<Object?> get props => [index];
}

class UpdateBoqQuantityEvent extends BoqEvent {
  final int index;
  final int newQuantity;
  const UpdateBoqQuantityEvent(this.index, this.newQuantity);

  @override
  List<Object?> get props => [index, newQuantity];
}

class PublishBoqEvent extends BoqEvent {
  final String projectId;
  const PublishBoqEvent(this.projectId);

  @override
  List<Object?> get props => [projectId];
}
