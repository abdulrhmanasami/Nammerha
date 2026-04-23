import 'package:equatable/equatable.dart';

abstract class TradespersonEvent extends Equatable {
  const TradespersonEvent();

  @override
  List<Object?> get props => [];
}

class LoadTradespersonTabEvent extends TradespersonEvent {
  final int tabIndex;
  const LoadTradespersonTabEvent(this.tabIndex);

  @override
  List<Object?> get props => [tabIndex];
}

class UpdateAvailabilityEvent extends TradespersonEvent {
  final String availability;
  const UpdateAvailabilityEvent(this.availability);

  @override
  List<Object?> get props => [availability];
}

class AcceptRequestEvent extends TradespersonEvent {
  final String requestId;
  const AcceptRequestEvent(this.requestId);

  @override
  List<Object?> get props => [requestId];
}

class RespondToAssignmentEvent extends TradespersonEvent {
  final String assignmentId;
  final bool accept;
  const RespondToAssignmentEvent(this.assignmentId, this.accept);

  @override
  List<Object?> get props => [assignmentId, accept];
}

class LoadProfileEvent extends TradespersonEvent {}
