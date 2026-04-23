import 'package:equatable/equatable.dart';
import '../models/boq_models.dart';

abstract class BoqState extends Equatable {
  final List<BoqItemModel> items;
  const BoqState(this.items);

  @override
  List<Object?> get props => [items];
}

class BoqInitial extends BoqState {
  const BoqInitial() : super(const []);
}

class BoqLoading extends BoqState {
  const BoqLoading(super.items);
}

class BoqLoaded extends BoqState {
  const BoqLoaded(super.items);
}

class BoqPublishLoading extends BoqState {
  const BoqPublishLoading(super.items);
}

class BoqPublishSuccess extends BoqState {
  const BoqPublishSuccess(super.items);
}

class BoqError extends BoqState {
  final String error;
  const BoqError(super.items, this.error);

  @override
  List<Object?> get props => [items, error];
}
