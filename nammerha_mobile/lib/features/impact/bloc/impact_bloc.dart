import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/impact_repository.dart';
import 'impact_event.dart';
import 'impact_state.dart';

class ImpactBloc extends Bloc<ImpactEvent, ImpactState> {
  final ImpactRepository repository;
  int _offset = 0;
  final int _limit = 20;

  ImpactBloc({required this.repository}) : super(ImpactInitial()) {
    on<FetchImpactMessages>(_onFetchMessages);
    on<MarkMessageAsRead>(_onMarkMessageAsRead);
    on<MarkAllMessagesAsRead>(_onMarkAllMessagesAsRead);
  }

  Future<void> _onFetchMessages(
    FetchImpactMessages event,
    Emitter<ImpactState> emit,
  ) async {
    if (state is ImpactLoaded && !event.refresh) {
      final currentState = state as ImpactLoaded;
      if (currentState.hasReachedMax) return;
    }

    try {
      if (state is ImpactInitial || event.refresh) {
        _offset = 0;
        emit(ImpactLoading([], isFirstFetch: true));
      } else if (state is ImpactLoaded) {
        emit(ImpactLoading((state as ImpactLoaded).messages));
      }

      final messages = await repository.fetchMessages(
        limit: _limit,
        offset: _offset,
      );
      
      final unreadCount = await repository.getUnreadCount();

      if (state is ImpactLoading) {
        final currentState = state as ImpactLoading;
        final allMessages = event.refresh ? messages : currentState.oldMessages + messages;
        
        _offset += messages.length;

        emit(ImpactLoaded(
          messages: allMessages,
          unreadCount: unreadCount,
          hasReachedMax: messages.length < _limit,
        ));
      }
    } catch (e) {
      emit(ImpactError(e.toString()));
    }
  }

  Future<void> _onMarkMessageAsRead(
    MarkMessageAsRead event,
    Emitter<ImpactState> emit,
  ) async {
    if (state is ImpactLoaded) {
      final currentState = state as ImpactLoaded;
      
      // Optimistic UI update
      final updatedMessages = currentState.messages.map((m) {
        if (m.id == event.messageId && !m.isRead) {
          return m.copyWith(isRead: true);
        }
        return m;
      }).toList();

      final newUnreadCount = (currentState.unreadCount > 0) ? currentState.unreadCount - 1 : 0;

      emit(ImpactLoaded(
        messages: updatedMessages,
        unreadCount: newUnreadCount,
        hasReachedMax: currentState.hasReachedMax,
      ));

      // Network request (Offline resilience managed by repository)
      try {
        await repository.markAsRead(event.messageId);
      } catch (_) {
        // Handled silently by OfflineQueue in repo
      }
    }
  }

  Future<void> _onMarkAllMessagesAsRead(
    MarkAllMessagesAsRead event,
    Emitter<ImpactState> emit,
  ) async {
    if (state is ImpactLoaded) {
      final currentState = state as ImpactLoaded;
      
      // Optimistic UI update
      final updatedMessages = currentState.messages.map((m) => m.copyWith(isRead: true)).toList();

      emit(ImpactLoaded(
        messages: updatedMessages,
        unreadCount: 0,
        hasReachedMax: currentState.hasReachedMax,
      ));

      // Network request
      try {
        await repository.markAllAsRead();
      } catch (_) {
        // Handled silently by OfflineQueue in repo
      }
    }
  }
}
