import 'package:equatable/equatable.dart';

abstract class HomeownerEvent extends Equatable {
  const HomeownerEvent();

  @override
  List<Object?> get props => [];
}

class LoadHomeownerTabEvent extends HomeownerEvent {
  final int tabIndex;
  const LoadHomeownerTabEvent(this.tabIndex);

  @override
  List<Object?> get props => [tabIndex];
}

class RespondToApprovalEvent extends HomeownerEvent {
  final String approvalId;
  final String decision;

  const RespondToApprovalEvent(this.approvalId, this.decision);

  @override
  List<Object?> get props => [approvalId, decision];
}

// C4 FIX: Cancel service request from mobile portal
class CancelServiceRequestEvent extends HomeownerEvent {
  final String requestId;
  const CancelServiceRequestEvent(this.requestId);

  @override
  List<Object?> get props => [requestId];
}
