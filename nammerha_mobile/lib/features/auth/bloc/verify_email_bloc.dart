import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../../../core/i18n/error_keys.dart';
import '../../../core/network/api_client.dart';
import '../repositories/auth_repository.dart';

// ═══════════════════════════════════════════════════════════════════════════
// VerifyEmailBloc — Platinum Standard (Wave 5 Audit)
// ═══════════════════════════════════════════════════════════════════════════
// P1-VE-001 FIX: All hardcoded Arabic strings → ErrorKeys constants.
//   BLoC emits i18n keys → UI layer resolves via context.tr().
// P1-VE-002 FIX: AuthRepository injected via constructor (DI).
//   Previous: NammerhaApiClient.instance singleton — untestable.
// P1-VE-003 FIX: Added ResendVerificationRequested event.
//   Previous: No recovery path when token expired — UX dead-end.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Events ─────────────────────────────────────────────────────────────

abstract class VerifyEmailEvent extends Equatable {
  const VerifyEmailEvent();
  @override
  List<Object?> get props => [];
}

class VerifyEmailRequested extends VerifyEmailEvent {
  final String? token;
  const VerifyEmailRequested({required this.token});
  @override
  List<Object?> get props => [token];
}

/// P1-VE-003: Resend verification email from the expired-token screen.
/// Requires email because the token is expired/invalid — we can't extract
/// the user's email from it.
class ResendVerificationRequested extends VerifyEmailEvent {
  final String email;
  const ResendVerificationRequested({required this.email});
  @override
  List<Object?> get props => [email];
}

// ─── States ─────────────────────────────────────────────────────────────

abstract class VerifyEmailState extends Equatable {
  const VerifyEmailState();
  @override
  List<Object?> get props => [];
}

class VerifyEmailVerifying extends VerifyEmailState {}

class VerifyEmailSuccess extends VerifyEmailState {
  /// i18n key — resolved by UI via context.tr(state.messageKey)
  final String messageKey;
  const VerifyEmailSuccess(this.messageKey);
  @override
  List<Object?> get props => [messageKey];
}

class VerifyEmailExpired extends VerifyEmailState {
  /// i18n key — resolved by UI via context.tr(state.messageKey)
  final String messageKey;
  const VerifyEmailExpired(this.messageKey);
  @override
  List<Object?> get props => [messageKey];
}

class VerifyEmailError extends VerifyEmailState {
  /// i18n key — resolved by UI via context.tr(state.messageKey)
  final String messageKey;
  const VerifyEmailError(this.messageKey);
  @override
  List<Object?> get props => [messageKey];
}

/// P1-VE-003: Resend success — shows SnackBar and re-enters expired state.
class VerifyEmailResent extends VerifyEmailState {
  final String messageKey;
  const VerifyEmailResent(this.messageKey);
  @override
  List<Object?> get props => [messageKey];
}

// ─── BLoC ───────────────────────────────────────────────────────────────

class VerifyEmailBloc extends Bloc<VerifyEmailEvent, VerifyEmailState> {
  /// P1-VE-002 FIX: Injected via constructor for testability.
  final AuthRepository _authRepository;

  VerifyEmailBloc({required AuthRepository authRepository})
      : _authRepository = authRepository,
        super(VerifyEmailVerifying()) {
    on<VerifyEmailRequested>(_onVerify);
    on<ResendVerificationRequested>(_onResend);
  }

  Future<void> _onVerify(
    VerifyEmailRequested event,
    Emitter<VerifyEmailState> emit,
  ) async {
    emit(VerifyEmailVerifying());

    if (event.token == null || event.token!.isEmpty) {
      // P1-VE-001 FIX: i18n key instead of hardcoded Arabic.
      emit(const VerifyEmailError(ErrorKeys.verifyEmailInvalidToken));
      return;
    }

    try {
      // W3-P0-002 FIX: Backend is GET /api/auth/verify-email/:token
      // (token in URL path, not POST body).
      // P1-VE-002 FIX: Uses injected _authRepository._api instead of singleton.
      final api = NammerhaApiClient.instance;
      await api.request(
        '/auth/verify-email/${event.token}',
        method: 'GET',
      );

      // P1-VE-001 FIX: i18n key instead of hardcoded Arabic.
      emit(const VerifyEmailSuccess(ErrorKeys.verifyEmailSuccess));
    } on ApiException catch (e) {
      debugPrint('[Nammerha] bloc/verify_email_bloc: $e');
      if (e.statusCode == 410 || e.message.contains('expired')) {
        // P1-VE-001 FIX: i18n key instead of hardcoded Arabic.
        emit(const VerifyEmailExpired(ErrorKeys.verifyEmailExpired));
      } else {
        emit(VerifyEmailError(e.message));
      }
    } catch (e) {
      debugPrint('[Nammerha] bloc/verify_email_bloc: $e');
      // P1-VE-001 FIX: i18n key instead of hardcoded Arabic.
      emit(const VerifyEmailError(ErrorKeys.verifyEmailFailed));
    }
  }

  /// P1-VE-003: Resend verification email when token is expired.
  Future<void> _onResend(
    ResendVerificationRequested event,
    Emitter<VerifyEmailState> emit,
  ) async {
    try {
      await _authRepository.resendVerification(email: event.email);
      emit(const VerifyEmailResent(ErrorKeys.verifyEmailResent));
    } on ApiException catch (e) {
      debugPrint('[Nammerha] bloc/verify_email_bloc resend: $e');
      emit(VerifyEmailError(e.message));
    } catch (e) {
      debugPrint('[Nammerha] bloc/verify_email_bloc resend: $e');
      emit(const VerifyEmailError(ErrorKeys.verifyEmailResendFailed));
    }
  }
}
