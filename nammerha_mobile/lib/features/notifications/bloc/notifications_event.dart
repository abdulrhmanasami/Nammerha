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

/// Injected by PushNotificationService when a foreground FCM message arrives.
/// Prepends the notification to the list without a full API reload.
class PushNotificationReceived extends NotificationsEvent {
  final Map<String, dynamic> notification;
  const PushNotificationReceived(this.notification);

  @override
  List<Object?> get props => [notification];
}
