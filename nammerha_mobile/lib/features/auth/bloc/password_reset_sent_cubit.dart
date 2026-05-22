import 'dart:async';
import 'package:flutter_bloc/flutter_bloc.dart';

/// State for the password reset sent interstitial screen.
/// Manages resend cooldown timer and resending flag.
///
/// Wave 10 Fix: P1-W10-007 (migrate setState → Cubit)
/// PREVIOUS: password_reset_sent_screen.dart used setState() for:
///   - Timer countdown (_remainingSeconds)
///   - Resend loading flag (_isResending)
/// Same pattern as EmailVerificationCubit — DRY across auth interstitials.
class PasswordResetSentState {
  final int remainingSeconds;
  final bool isResending;

  const PasswordResetSentState({
    this.remainingSeconds = 60,
    this.isResending = false,
  });

  PasswordResetSentState copyWith({
    int? remainingSeconds,
    bool? isResending,
  }) {
    return PasswordResetSentState(
      remainingSeconds: remainingSeconds ?? this.remainingSeconds,
      isResending: isResending ?? this.isResending,
    );
  }
}

class PasswordResetSentCubit extends Cubit<PasswordResetSentState> {
  Timer? _cooldownTimer;

  PasswordResetSentCubit() : super(const PasswordResetSentState()) {
    _startCooldown();
  }

  void _startCooldown() {
    _cooldownTimer?.cancel();
    emit(state.copyWith(remainingSeconds: 60));
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      final next = state.remainingSeconds - 1;
      if (next <= 0) {
        _cooldownTimer?.cancel();
        emit(state.copyWith(remainingSeconds: 0));
      } else {
        emit(state.copyWith(remainingSeconds: next));
      }
    });
  }

  /// Called when the resend button is tapped — sets loading state.
  void setResending(bool value) {
    emit(state.copyWith(isResending: value));
  }

  /// Called after the resend API call completes — resets loading & restarts cooldown.
  void onResendComplete() {
    emit(state.copyWith(isResending: false));
    _startCooldown();
  }

  @override
  Future<void> close() {
    _cooldownTimer?.cancel();
    return super.close();
  }
}
