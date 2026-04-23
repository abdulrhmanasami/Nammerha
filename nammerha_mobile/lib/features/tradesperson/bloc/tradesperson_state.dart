import 'package:equatable/equatable.dart';
import '../models/tradesperson_models.dart';

abstract class TradespersonState extends Equatable {
  final TradespersonDashboardModel data;
  const TradespersonState(this.data);

  @override
  List<Object?> get props => [data];
}

class TradespersonInitial extends TradespersonState {
  const TradespersonInitial() : super(const TradespersonDashboardModel());
}

class TradespersonLoading extends TradespersonState {
  const TradespersonLoading(super.data);
}

class TradespersonLoaded extends TradespersonState {
  const TradespersonLoaded(super.data);
}

class TradespersonError extends TradespersonState {
  final String error;
  const TradespersonError(super.data, this.error);

  @override
  List<Object?> get props => [data, error];
}

class ActionSuccess extends TradespersonState {
  final String message;
  const ActionSuccess(super.data, this.message);

  @override
  List<Object?> get props => [data, message];
}
