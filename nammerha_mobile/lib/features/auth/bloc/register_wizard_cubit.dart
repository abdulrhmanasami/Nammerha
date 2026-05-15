import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// Register Wizard Cubit — Platinum Standard (setState → Cubit migration)
// ═══════════════════════════════════════════════════════════════════════════════
// Manages ALL form-level state for the 3-step registration wizard:
//   Step 0: Identity (Full Name)
//   Step 1: Account (Email)
//   Step 2: Security (Password, Confirm, Strength, Terms, Review)
//
// AuthBloc remains responsible for the actual API call (register/login).
// This Cubit handles UI orchestration only — zero network calls.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── State ───────────────────────────────────────────────────────────────────

class RegisterWizardState extends Equatable {
  final int currentPage;
  final bool obscurePassword;
  final bool obscureConfirm;
  final bool termsAccepted;
  final String password;

  const RegisterWizardState({
    this.currentPage = 0,
    this.obscurePassword = true,
    this.obscureConfirm = true,
    this.termsAccepted = false,
    this.password = '',
  });

  RegisterWizardState copyWith({
    int? currentPage,
    bool? obscurePassword,
    bool? obscureConfirm,
    bool? termsAccepted,
    String? password,
  }) {
    return RegisterWizardState(
      currentPage: currentPage ?? this.currentPage,
      obscurePassword: obscurePassword ?? this.obscurePassword,
      obscureConfirm: obscureConfirm ?? this.obscureConfirm,
      termsAccepted: termsAccepted ?? this.termsAccepted,
      password: password ?? this.password,
    );
  }

  @override
  List<Object?> get props => [
        currentPage,
        obscurePassword,
        obscureConfirm,
        termsAccepted,
        password,
      ];
}

// ─── Cubit ───────────────────────────────────────────────────────────────────

class RegisterWizardCubit extends Cubit<RegisterWizardState> {
  RegisterWizardCubit() : super(const RegisterWizardState());

  /// Called by PageView.onPageChanged — tracks current step.
  void setPage(int page) {
    emit(state.copyWith(currentPage: page));
  }

  /// Toggle password visibility in the password field.
  void toggleObscurePassword() {
    emit(state.copyWith(obscurePassword: !state.obscurePassword));
  }

  /// Toggle password visibility in the confirm field.
  void toggleObscureConfirm() {
    emit(state.copyWith(obscureConfirm: !state.obscureConfirm));
  }

  /// Toggle GDPR Art.7 terms checkbox.
  void toggleTerms() {
    emit(state.copyWith(termsAccepted: !state.termsAccepted));
  }

  /// Set terms explicitly (from Checkbox.onChanged).
  void setTerms(bool accepted) {
    emit(state.copyWith(termsAccepted: accepted));
  }

  /// Track password text for strength indicator reactivity.
  void updatePassword(String password) {
    emit(state.copyWith(password: password));
  }
}
