import '../models/impact_message_model.dart';

abstract class ImpactState {}

class ImpactInitial extends ImpactState {}

class ImpactLoading extends ImpactState {
  final List<ImpactMessage> oldMessages;
  final bool isFirstFetch;

  ImpactLoading(this.oldMessages, {this.isFirstFetch = false});
}

class ImpactLoaded extends ImpactState {
  final List<ImpactMessage> messages;
  final int unreadCount;
  final bool hasReachedMax;

  ImpactLoaded({
    required this.messages,
    required this.unreadCount,
    required this.hasReachedMax,
  });
}

class ImpactError extends ImpactState {
  final String message;
  ImpactError(this.message);
}
