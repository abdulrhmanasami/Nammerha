import 'package:equatable/equatable.dart';

abstract class NotificationsEvent extends Equatable {
  const NotificationsEvent();

  @override
  List<Object?> get props => [];
}

class LoadNotificationsRequested extends NotificationsEvent {}

class MarkAllAsReadRequested extends NotificationsEvent {}

class MarkAsReadRequested extends NotificationsEvent {
  final String notificationId;
  const MarkAsReadRequested(this.notificationId);

  @override
  List<Object?> get props => [notificationId];
}
