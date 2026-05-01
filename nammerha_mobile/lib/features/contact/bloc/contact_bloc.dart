import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/services/api_services.dart';

// ═══════════════════════════════════════════════════════════════════════════
// CONTACT BLOC — GAP-S04 REMEDIATION
// Contact form state management (replaces inline setState)
// ═══════════════════════════════════════════════════════════════════════════

// ─── Events ─────────────────────────────────────────────────────────────────

abstract class ContactEvent {}

class SubmitContactForm extends ContactEvent {
  final String name;
  final String email;
  final String subject;
  final String message;

  SubmitContactForm({
    required this.name,
    required this.email,
    required this.subject,
    required this.message,
  });
}

class ResetContactForm extends ContactEvent {}

// ─── State ──────────────────────────────────────────────────────────────────

class ContactState {
  final bool isSubmitting;
  final bool isSuccess;
  final String? error;

  const ContactState({
    this.isSubmitting = false,
    this.isSuccess = false,
    this.error,
  });

  ContactState copyWith({
    bool? isSubmitting,
    bool? isSuccess,
    String? error,
  }) {
    return ContactState(
      isSubmitting: isSubmitting ?? this.isSubmitting,
      isSuccess: isSuccess ?? this.isSuccess,
      error: error,
    );
  }
}

// ─── BLoC ────────────────────────────────────────────────────────────────────

class ContactBloc extends Bloc<ContactEvent, ContactState> {
  final ContactApi _contactApi;

  ContactBloc({ContactApi? contactApi})
      : _contactApi = contactApi ?? ContactApi(),
        super(const ContactState()) {
    on<SubmitContactForm>(_onSubmit);
    on<ResetContactForm>(_onReset);
  }

  Future<void> _onSubmit(
    SubmitContactForm event,
    Emitter<ContactState> emit,
  ) async {
    emit(state.copyWith(isSubmitting: true, error: null, isSuccess: false));
    try {
      await _contactApi.submitContactForm(
        name: event.name,
        email: event.email,
        subject: event.subject,
        message: event.message,
      );
      emit(state.copyWith(isSubmitting: false, isSuccess: true));
    } catch (e) {
      emit(state.copyWith(isSubmitting: false, error: e.toString()));
    }
  }

  void _onReset(
    ResetContactForm event,
    Emitter<ContactState> emit,
  ) {
    emit(const ContactState());
  }
}
