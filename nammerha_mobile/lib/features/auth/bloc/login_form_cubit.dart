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
//   - socialLoadingProvider (P1-W10-008: per-provider social login loading state)
//   - isForgotPwLoading (P0-AUD-004: forgot PW sheet loading state)
//   - forgotPwEmail (P1-W5-003: email captured from forgot-PW sheet)
//
// UNIFIED CITIZEN: selectedRole removed — no role selection during registration.
// C4 FIX: Added confirm password visibility toggle for registration parity.
// C5 FIX: Added termsAccepted state for GDPR Art. 7 compliance.
// W3-P1-008: Added rememberMe for login session persistence.
// P1-W10-008: Upgraded isSocialLoading (bool) → socialLoadingProvider (String?)
//   to track WHICH provider is loading (google/apple/facebook).
//   PREVIOUS: Boolean gave no per-button granularity — all 3 buttons showed spinner.
// P0-AUD-004: Added isForgotPwLoading to keep sheet open during API call.
// P1-W5-003: Added forgotPwEmail for interstitial screen navigation.
// ═══════════════════════════════════════════════════════════════════════════

class LoginFormState extends Equatable {
  final bool isLoginMode;
  final bool obscurePassword;
  final bool obscureConfirmPassword;
  final bool termsAccepted;
  final bool rememberMe;
  // P1-W10-008 FIX: Per-provider social loading state.
  // Null = not loading. 'google', 'apple', or 'facebook' = that provider is loading.
  // PREVIOUS: `bool isSocialLoading` — couldn't distinguish which button was tapped.
  final String? socialLoadingProvider;
  // P0-AUD-004 FIX: Forgot PW sheet loading state.
  // PREVIOUS: Sheet closed immediately via Navigator.pop() before API response.
  // NOW: Sheet stays open with spinner, closes only on success/error.
  final bool isForgotPwLoading;
  // P1-W5-003: Email captured from the forgot-PW sheet for the interstitial screen.
  final String forgotPwEmail;

  const LoginFormState({
    this.isLoginMode = true,
    this.obscurePassword = true,
    this.obscureConfirmPassword = true,
    this.termsAccepted = false,
    this.rememberMe = false,
    // P1-W10-008 FIX: Null = not loading, 'google'/'apple'/'facebook' = specific provider.
    this.socialLoadingProvider,
    this.isForgotPwLoading = false,
    this.forgotPwEmail = '',
  });

  /// Convenience getter: true if ANY social provider is currently loading.
  /// Used by existing code that only needs to know "is social login in progress?"
  /// without caring which provider.
  bool get isSocialLoading => socialLoadingProvider != null;

  LoginFormState copyWith({
    bool? isLoginMode,
    bool? obscurePassword,
    bool? obscureConfirmPassword,
    bool? termsAccepted,
    bool? rememberMe,
    String? socialLoadingProvider,
    bool clearSocialLoading = false,
    bool? isForgotPwLoading,
    String? forgotPwEmail,
  }) {
    return LoginFormState(
      isLoginMode: isLoginMode ?? this.isLoginMode,
      obscurePassword: obscurePassword ?? this.obscurePassword,
      obscureConfirmPassword: obscureConfirmPassword ?? this.obscureConfirmPassword,
      termsAccepted: termsAccepted ?? this.termsAccepted,
      rememberMe: rememberMe ?? this.rememberMe,
      socialLoadingProvider: clearSocialLoading
          ? null
          : (socialLoadingProvider ?? this.socialLoadingProvider),
      isForgotPwLoading: isForgotPwLoading ?? this.isForgotPwLoading,
      forgotPwEmail: forgotPwEmail ?? this.forgotPwEmail,
    );
  }

  @override
  List<Object?> get props => [
        isLoginMode,
        obscurePassword,
        obscureConfirmPassword,
        termsAccepted,
        rememberMe,
        socialLoadingProvider,
        isForgotPwLoading,
        forgotPwEmail,
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

  /// P1-W10-008 FIX: Per-provider social login loading state.
  /// Sets which provider button is in loading state (spinner).
  /// Pass null to clear all social loading.
  ///
  /// Usage:
  ///   setSocialLoading('google')  — Google button shows spinner
  ///   setSocialLoading('apple')   — Apple button shows spinner
  ///   setSocialLoading(null)      — Clear all spinners
  void setSocialLoading(String? provider) => emit(state.copyWith(
        socialLoadingProvider: provider,
        clearSocialLoading: provider == null,
      ));

  /// P0-AUD-004 FIX: Forgot password sheet loading state.
  /// Keeps the bottom sheet open with a spinner while the API call completes.
  /// The BLocListener dismisses the sheet on AuthPasswordResetSent/AuthError.
  /// P1-W5-003: Also captures the email for the interstitial screen.
  void setForgotPwLoading(bool loading, {String email = ''}) =>
      emit(state.copyWith(
        isForgotPwLoading: loading,
        forgotPwEmail: email.isNotEmpty ? email : null,
      ));
}
