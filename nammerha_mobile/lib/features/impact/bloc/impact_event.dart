abstract class ImpactEvent {}

class FetchImpactMessages extends ImpactEvent {
  final bool refresh;
  FetchImpactMessages({this.refresh = false});
}

class MarkMessageAsRead extends ImpactEvent {
  final String messageId;
  MarkMessageAsRead(this.messageId);
}

class MarkAllMessagesAsRead extends ImpactEvent {}
