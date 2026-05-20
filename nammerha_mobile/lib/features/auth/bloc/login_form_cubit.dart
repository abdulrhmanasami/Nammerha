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
//   - rememberMe (W3-P1-008: persistent session toggle)
//   - isSocialLoading (P1-AUD-009: social login SDK loading state)
//   - isForgotPwLoading (P0-AUD-004: forgot PW sheet loading state)
//
// UNIFIED CITIZEN: selectedRole removed — no role selection during registration.
// C4 FIX: Added confirm password visibility toggle for registration parity.
// C5 FIX: Added termsAccepted state for GDPR Art. 7 compliance.
// W3-P1-008: Added rememberMe for login session persistence.
// P1-AUD-009: Migrated _isSocialLoading from setState to Cubit.
// P0-AUD-004: Added isForgotPwLoading to keep sheet open during API call.
// ═══════════════════════════════════════════════════════════════════════════

class LoginFormState extends Equatable {
  final bool isLoginMode;
  final bool obscurePassword;
  final bool obscureConfirmPassword;
  final bool termsAccepted;
  final bool rememberMe;
  // P1-AUD-009 FIX: Migrated from setState in login_screen.dart.
  // PREVIOUS: bool _isSocialLoading — violates Absolute Zero setState.
  final bool isSocialLoading;
  // P0-AUD-004 FIX: Forgot PW sheet loading state.
  // PREVIOUS: Sheet closed immediately via Navigator.pop() before API response.
  // NOW: Sheet stays open with spinner, closes only on success/error.
  final bool isForgotPwLoading;

  const LoginFormState({
    this.isLoginMode = true,
    this.obscurePassword = true,
    this.obscureConfirmPassword = true,
    this.termsAccepted = false,
    this.rememberMe = false,
    this.isSocialLoading = false,
    this.isForgotPwLoading = false,
  });

  LoginFormState copyWith({
    bool? isLoginMode,
    bool? obscurePassword,
    bool? obscureConfirmPassword,
    bool? termsAccepted,
    bool? rememberMe,
    bool? isSocialLoading,
    bool? isForgotPwLoading,
  }) {
    return LoginFormState(
      isLoginMode: isLoginMode ?? this.isLoginMode,
      obscurePassword: obscurePassword ?? this.obscurePassword,
      obscureConfirmPassword: obscureConfirmPassword ?? this.obscureConfirmPassword,
      termsAccepted: termsAccepted ?? this.termsAccepted,
      rememberMe: rememberMe ?? this.rememberMe,
      isSocialLoading: isSocialLoading ?? this.isSocialLoading,
      isForgotPwLoading: isForgotPwLoading ?? this.isForgotPwLoading,
    );
  }

  @override
  List<Object?> get props => [
        isLoginMode,
        obscurePassword,
        obscureConfirmPassword,
        termsAccepted,
        rememberMe,
        isSocialLoading,
        isForgotPwLoading,
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

  /// W3-P1-008: Toggle "Remember Me" for persistent sessions.
  void toggleRememberMe() => emit(state.copyWith(rememberMe: !state.rememberMe));

  /// P1-AUD-009 FIX: Social login loading state.
  /// PREVIOUS: setState(() => _isSocialLoading = true) in login_screen.dart.
  /// NOW: Cubit-managed for Absolute Zero setState compliance.
  void setSocialLoading(bool loading) =>
      emit(state.copyWith(isSocialLoading: loading));

  /// P0-AUD-004 FIX: Forgot password sheet loading state.
  /// Keeps the bottom sheet open with a spinner while the API call completes.
  /// The BLocListener dismisses the sheet on AuthPasswordResetSent/AuthError.
  void setForgotPwLoading(bool loading) =>
      emit(state.copyWith(isForgotPwLoading: loading));
}
