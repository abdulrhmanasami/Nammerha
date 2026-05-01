import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/services/api_services.dart';

// ═══════════════════════════════════════════════════════════════════════════
// PRICING BLOC — GAP-S03 REMEDIATION
// SaaS subscription flow state management
// ═══════════════════════════════════════════════════════════════════════════

// ─── Events ─────────────────────────────────────────────────────────────────

abstract class PricingEvent {}

class LoadPricingPlans extends PricingEvent {}

class SubscribeToPlan extends PricingEvent {
  final String planSlug;
  SubscribeToPlan(this.planSlug);
}

// ─── State ──────────────────────────────────────────────────────────────────

class PricingState {
  final bool isLoading;
  final bool isSubscribing;
  final String? error;
  final String? successMessage;
  final Map<String, dynamic>? subscriptionResult;

  const PricingState({
    this.isLoading = false,
    this.isSubscribing = false,
    this.error,
    this.successMessage,
    this.subscriptionResult,
  });

  PricingState copyWith({
    bool? isLoading,
    bool? isSubscribing,
    String? error,
    String? successMessage,
    Map<String, dynamic>? subscriptionResult,
  }) {
    return PricingState(
      isLoading: isLoading ?? this.isLoading,
      isSubscribing: isSubscribing ?? this.isSubscribing,
      error: error,
      successMessage: successMessage,
      subscriptionResult: subscriptionResult ?? this.subscriptionResult,
    );
  }
}

// ─── BLoC ────────────────────────────────────────────────────────────────────

class PricingBloc extends Bloc<PricingEvent, PricingState> {
  final SubscriptionsApi _subscriptionsApi;

  PricingBloc({SubscriptionsApi? subscriptionsApi})
      : _subscriptionsApi = subscriptionsApi ?? SubscriptionsApi(),
        super(const PricingState()) {
    on<SubscribeToPlan>(_onSubscribe);
  }

  Future<void> _onSubscribe(
    SubscribeToPlan event,
    Emitter<PricingState> emit,
  ) async {
    emit(state.copyWith(isSubscribing: true, error: null));
    try {
      final result = await _subscriptionsApi.subscribe(event.planSlug);
      emit(state.copyWith(
        isSubscribing: false,
        subscriptionResult: result,
        successMessage: 'تم الاشتراك بنجاح',
      ));
    } catch (e) {
      emit(state.copyWith(
        isSubscribing: false,
        error: e.toString(),
      ));
    }
  }
}
