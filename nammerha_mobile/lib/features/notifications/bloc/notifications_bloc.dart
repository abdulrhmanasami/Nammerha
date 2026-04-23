import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/services/api_services.dart';
import 'notifications_event.dart';
import 'notifications_state.dart';

class NotificationsBloc extends Bloc<NotificationsEvent, NotificationsState> {
  final NotificationsApi _api;

  NotificationsBloc({NotificationsApi? api})
      : _api = api ?? NotificationsApi(),
        super(NotificationsInitial()) {
    on<LoadNotificationsRequested>(_onLoadNotifications);
    on<MarkAllAsReadRequested>(_onMarkAllAsRead);
    on<MarkAsReadRequested>(_onMarkAsRead);
  }

  Future<void> _onLoadNotifications(
      LoadNotificationsRequested event, Emitter<NotificationsState> emit) async {
    final currentNotifs = state is NotificationsLoaded 
        ? (state as NotificationsLoaded).notifications 
        : null;
        
    emit(NotificationsLoading(oldNotifications: currentNotifs));
    try {
      final notifications = await _api.getAll();
      emit(NotificationsLoaded(notifications: notifications));
    } catch (e) {
      emit(const NotificationsError('حدث خطأ في تحميل الإشعارات'));
    }
  }

  Future<void> _onMarkAllAsRead(
      MarkAllAsReadRequested event, Emitter<NotificationsState> emit) async {
    if (state is NotificationsLoaded) {
      final currentState = state as NotificationsLoaded;
      try {
        await _api.markAllAsRead();
        
        final updatedNotifications = currentState.notifications.map((n) {
          final newNotif = Map<String, dynamic>.from(n);
          newNotif['is_read'] = true;
          return newNotif;
        }).toList();
        
        emit(currentState.copyWith(notifications: updatedNotifications));
      } catch (e) {
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
        
        final updatedNotifications = currentState.notifications.map((n) {
          final id = (n['notification_id'] ?? n['id'] ?? '').toString();
          if (id == event.notificationId) {
             final newNotif = Map<String, dynamic>.from(n);
             newNotif['is_read'] = true;
             return newNotif;
          }
          return n;
        }).toList();
        
        emit(currentState.copyWith(notifications: updatedNotifications));
      } catch (e) {
        // Do nothing on failure locally
      }
    }
  }
}
