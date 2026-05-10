import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// LoginFormCubit — Platinum Standard (Absolute Zero setState)
// ═══════════════════════════════════════════════════════════════════════════
// Manages pure UI state for the Login/Register screen:
//   - isLoginMode (toggle between login and register)
//   - obscurePassword (password visibility toggle)
//   - obscureConfirmPassword (confirm password visibility toggle) [C4 FIX]
//   - termsAccepted (GDPR consent checkbox) [C5 FIX]
//
// UNIFIED CITIZEN: selectedRole removed — no role selection during registration.
// C4 FIX: Added confirm password visibility toggle for registration parity.
// C5 FIX: Added termsAccepted state for GDPR Art. 7 compliance.
// ═══════════════════════════════════════════════════════════════════════════

class LoginFormState extends Equatable {
  final bool isLoginMode;
  final bool obscurePassword;
  final bool obscureConfirmPassword;
  final bool termsAccepted;

  const LoginFormState({
    this.isLoginMode = true,
    this.obscurePassword = true,
    this.obscureConfirmPassword = true,
    this.termsAccepted = false,
  });

  LoginFormState copyWith({
    bool? isLoginMode,
    bool? obscurePassword,
    bool? obscureConfirmPassword,
    bool? termsAccepted,
  }) {
    return LoginFormState(
      isLoginMode: isLoginMode ?? this.isLoginMode,
      obscurePassword: obscurePassword ?? this.obscurePassword,
      obscureConfirmPassword: obscureConfirmPassword ?? this.obscureConfirmPassword,
      termsAccepted: termsAccepted ?? this.termsAccepted,
    );
  }

  @override
  List<Object?> get props => [
        isLoginMode,
        obscurePassword,
        obscureConfirmPassword,
        termsAccepted,
      ];
}

class LoginFormCubit extends Cubit<LoginFormState> {
  LoginFormCubit() : super(const LoginFormState());

  void toggleMode() => emit(state.copyWith(
        isLoginMode: !state.isLoginMode,
        // C5 FIX: Reset terms when toggling mode to prevent stale consent.
        termsAccepted: false,
      ));

  void switchToLoginMode() => emit(state.copyWith(
        isLoginMode: true,
        termsAccepted: false,
      ));

  void togglePasswordVisibility() =>
      emit(state.copyWith(obscurePassword: !state.obscurePassword));

  /// C4 FIX: Toggle confirm password visibility (registration only).
  void toggleConfirmPasswordVisibility() =>
      emit(state.copyWith(obscureConfirmPassword: !state.obscureConfirmPassword));

  /// C5 FIX: Toggle terms & privacy acceptance (GDPR Art. 7).
  void toggleTerms() => emit(state.copyWith(termsAccepted: !state.termsAccepted));
}
