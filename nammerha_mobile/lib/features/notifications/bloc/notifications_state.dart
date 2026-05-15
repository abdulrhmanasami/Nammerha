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
  final bool hasMore;
  final bool isLoadingMore;

  const NotificationsLoaded({
    required this.notifications,
    this.hasMore = true,
    this.isLoadingMore = false,
  });

  NotificationsLoaded copyWith({
    List<Map<String, dynamic>>? notifications,
    bool? hasMore,
    bool? isLoadingMore,
  }) {
    return NotificationsLoaded(
      notifications: notifications ?? this.notifications,
      hasMore: hasMore ?? this.hasMore,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
    );
  }

  @override
  List<Object?> get props => [notifications, hasMore, isLoadingMore];
}

class NotificationsError extends NotificationsState {
  final String message;
  const NotificationsError(this.message);

  @override
  List<Object?> get props => [message];
}
