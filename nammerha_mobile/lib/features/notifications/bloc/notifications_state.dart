import 'package:equatable/equatable.dart';

abstract class NotificationsState extends Equatable {
  const NotificationsState();

  @override
  List<Object?> get props => [];
}

class NotificationsInitial extends NotificationsState {}

class NotificationsLoading extends NotificationsState {
  final List<Map<String, dynamic>>? oldNotifications;
  
  const NotificationsLoading({this.oldNotifications});
  
  @override
  List<Object?> get props => [oldNotifications];
}

class NotificationsLoaded extends NotificationsState {
  final List<Map<String, dynamic>> notifications;

  const NotificationsLoaded({required this.notifications});

  NotificationsLoaded copyWith({
    List<Map<String, dynamic>>? notifications,
  }) {
    return NotificationsLoaded(
      notifications: notifications ?? this.notifications,
    );
  }

  @override
  List<Object?> get props => [notifications];
}

class NotificationsError extends NotificationsState {
  final String message;
  const NotificationsError(this.message);

  @override
  List<Object?> get props => [message];
}
