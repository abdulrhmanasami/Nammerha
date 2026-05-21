import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/services/api_services.dart';
import '../../../core/i18n/error_keys.dart';
import '../models/notification_model.dart';
import 'notifications_event.dart';
import 'notifications_state.dart';

/// Wave 4: Pagination-aware NotificationsBloc.
/// Page size = 20 (optimized for Syria 2G networks).
///
/// MED-MOB-003: Fully typed — uses `NotificationModel` instead of raw `Map`.
class NotificationsBloc extends Bloc<NotificationsEvent, NotificationsState> {
  final NotificationsApi _api;
  static const int _pageSize = 20;

  NotificationsBloc({NotificationsApi? api})
      : _api = api ?? NotificationsApi(),
        super(NotificationsInitial()) {
    on<LoadNotificationsRequested>(_onLoadNotifications);
    on<LoadMoreNotificationsEvent>(_onLoadMore);
    on<MarkAllAsReadRequested>(_onMarkAllAsRead);
    on<MarkAsReadRequested>(_onMarkAsRead);
    on<PushNotificationReceived>(_onPushNotificationReceived);
  }

  Future<void> _onLoadNotifications(
      LoadNotificationsRequested event, Emitter<NotificationsState> emit) async {
    final currentNotifs = state is NotificationsLoaded 
        ? (state as NotificationsLoaded).notifications 
        : null;
        
    emit(NotificationsLoading(oldNotifications: currentNotifs));
    try {
      final rawNotifications = await _api.getAll(limit: _pageSize, offset: 0);
      // MED-MOB-003: Parse raw maps into typed models
      final notifications = rawNotifications
          .map((json) => NotificationModel.fromJson(json))
          .toList();
      emit(NotificationsLoaded(
        notifications: notifications,
        hasMore: notifications.length >= _pageSize,
      ));
    } catch (e) {
      debugPrint('[Nammerha] bloc/notifications_bloc: $e');
      emit(NotificationsError(ErrorKeys.generic));
    }
  }

  /// Wave 4: Infinite scroll — appends next page.
  Future<void> _onLoadMore(
      LoadMoreNotificationsEvent event, Emitter<NotificationsState> emit) async {
    if (state is! NotificationsLoaded) return;
    final currentState = state as NotificationsLoaded;

    // Guard: don't load if already loading or no more pages
    if (currentState.isLoadingMore || !currentState.hasMore) return;

    emit(currentState.copyWith(isLoadingMore: true));

    try {
      final rawNextPage = await _api.getAll(
        limit: _pageSize,
        offset: currentState.notifications.length,
      );
      // MED-MOB-003: Parse raw maps into typed models
      final nextPage = rawNextPage
          .map((json) => NotificationModel.fromJson(json))
          .toList();

      emit(currentState.copyWith(
        notifications: [...currentState.notifications, ...nextPage],
        hasMore: nextPage.length >= _pageSize,
        isLoadingMore: false,
      ));
    } catch (e) {
      debugPrint('[Nammerha] bloc/notifications_bloc: $e');
      // Silently fail pagination — keep showing existing data
      emit(currentState.copyWith(isLoadingMore: false));
    }
  }

  Future<void> _onMarkAllAsRead(
      MarkAllAsReadRequested event, Emitter<NotificationsState> emit) async {
    if (state is NotificationsLoaded) {
      final currentState = state as NotificationsLoaded;
      try {
        await _api.markAllAsRead();
        
        // MED-MOB-003: Use typed markAsRead() instead of Map mutation
        final updatedNotifications = currentState.notifications
            .map((n) => n.markAsRead())
            .toList();
        
        emit(currentState.copyWith(notifications: updatedNotifications));
      } catch (e) {
        debugPrint('[Nammerha] bloc/notifications_bloc: $e');
        // Fall back to reload 
        add(LoadNotificationsRequested());
      }
    }
  }
  
  Future<void> _onMarkAsRead(
      MarkAsReadRequested event, Emitter<NotificationsState> emit) async {
    if (state is NotificationsLoaded) {
      final currentState = state as NotificationsLoaded;
      try {
        await _api.markAsRead(event.notificationId);
        
        // MED-MOB-003: Use typed markAsRead() instead of Map mutation
        final updatedNotifications = currentState.notifications.map((n) {
          if (n.id == event.notificationId) {
            return n.markAsRead();
          }
          return n;
        }).toList();
        
        emit(currentState.copyWith(notifications: updatedNotifications));
      } catch (e) {
        debugPrint('[Nammerha] bloc/notifications_bloc: $e');
        // Do nothing on failure locally
      }
    }
  }

  /// Handle real-time FCM push notifications by prepending to existing list.
  /// No API call needed — the notification data comes directly from FCM.
  void _onPushNotificationReceived(
      PushNotificationReceived event, Emitter<NotificationsState> emit) {
    if (state is NotificationsLoaded) {
      final currentState = state as NotificationsLoaded;
      final updated = [event.notification, ...currentState.notifications];
      emit(currentState.copyWith(notifications: updated));
    } else {
      // If notifications haven't been loaded yet, emit a fresh list
      emit(NotificationsLoaded(notifications: [event.notification]));
    }
  }
}
