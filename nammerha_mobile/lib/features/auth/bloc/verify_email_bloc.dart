import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../../../core/network/api_client.dart';

// ═══════════════════════════════════════════════════════════════════════════
// VerifyEmailBloc — Platinum Standard (Absolute Zero setState)
// ═══════════════════════════════════════════════════════════════════════════
// CRITICAL FIX: The original VerifyEmailScreen was calling
// NammerhaApiClient.instance.request() directly inside initState() with
// raw setState for status/message management. This violates both:
//   1. Absolute Zero setState policy
//   2. Separation of concerns (no raw API calls in UI layer)
//
// This BLoC owns the entire verify-email lifecycle.
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

// ─── States ─────────────────────────────────────────────────────────────

abstract class VerifyEmailState extends Equatable {
  const VerifyEmailState();
  @override
  List<Object?> get props => [];
}

class VerifyEmailVerifying extends VerifyEmailState {}

class VerifyEmailSuccess extends VerifyEmailState {
  final String message;
  const VerifyEmailSuccess(this.message);
  @override
  List<Object?> get props => [message];
}

class VerifyEmailExpired extends VerifyEmailState {
  final String message;
  const VerifyEmailExpired(this.message);
  @override
  List<Object?> get props => [message];
}

class VerifyEmailError extends VerifyEmailState {
  final String message;
  const VerifyEmailError(this.message);
  @override
  List<Object?> get props => [message];
}

// ─── BLoC ───────────────────────────────────────────────────────────────

class VerifyEmailBloc extends Bloc<VerifyEmailEvent, VerifyEmailState> {
  VerifyEmailBloc() : super(VerifyEmailVerifying()) {
    on<VerifyEmailRequested>(_onVerify);
  }

  Future<void> _onVerify(
    VerifyEmailRequested event,
    Emitter<VerifyEmailState> emit,
  ) async {
    emit(VerifyEmailVerifying());

    if (event.token == null || event.token!.isEmpty) {
      emit(const VerifyEmailError(
        'رابط التحقق غير صالح — لا يوجد رمز تحقق',
      ));
      return;
    }

    try {
      // W3-P0-002 FIX: Backend is GET /api/auth/verify-email/:token
      // (token in URL path, not POST body).
      final api = NammerhaApiClient.instance;
      await api.request(
        '/auth/verify-email/${event.token}',
        method: 'GET',
      );

      emit(const VerifyEmailSuccess('تم تأكيد بريدك الإلكتروني بنجاح!'));
    } on ApiException catch (e) {
      debugPrint('[Nammerha] bloc/verify_email_bloc: $e');
      if (e.statusCode == 410 || e.message.contains('expired')) {
        emit(const VerifyEmailExpired(
          'انتهت صلاحية رابط التحقق — اطلب رابطاً جديداً',
        ));
      } else {
        emit(VerifyEmailError(e.message));
      }
    } catch (e) {
      debugPrint('[Nammerha] bloc/verify_email_bloc: $e');
      emit(const VerifyEmailError('حدث خطأ في التحقق — حاول مرة أخرى'));
    }
  }
}
