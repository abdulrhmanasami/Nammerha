import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// ResetPasswordFormCubit — Platinum Standard (Absolute Zero setState)
// ═══════════════════════════════════════════════════════════════════════════
// Manages pure UI state for the Reset Password screen:
//   - obscurePassword / obscureConfirm (password visibility toggles)
//   - passwordStrength (0.0 – 1.0 calculated from password rules)
//   - isSubmitting / isSuccess (form lifecycle)
//
// This replaces 7 `setState` calls in `_ResetPasswordScreenState`.
// ═══════════════════════════════════════════════════════════════════════════

class ResetPasswordFormState extends Equatable {
  final bool obscurePassword;
  final bool obscureConfirm;
  final double passwordStrength;
  final bool isSubmitting;
  final bool isSuccess;

  const ResetPasswordFormState({
    this.obscurePassword = true,
    this.obscureConfirm = true,
    this.passwordStrength = 0,
    this.isSubmitting = false,
    this.isSuccess = false,
  });

  ResetPasswordFormState copyWith({
    bool? obscurePassword,
    bool? obscureConfirm,
    double? passwordStrength,
    bool? isSubmitting,
    bool? isSuccess,
  }) {
    return ResetPasswordFormState(
      obscurePassword: obscurePassword ?? this.obscurePassword,
      obscureConfirm: obscureConfirm ?? this.obscureConfirm,
      passwordStrength: passwordStrength ?? this.passwordStrength,
      isSubmitting: isSubmitting ?? this.isSubmitting,
      isSuccess: isSuccess ?? this.isSuccess,
    );
  }

  @override
  List<Object?> get props => [
        obscurePassword,
        obscureConfirm,
        passwordStrength,
        isSubmitting,
        isSuccess,
      ];
}

class ResetPasswordFormCubit extends Cubit<ResetPasswordFormState> {
  ResetPasswordFormCubit() : super(const ResetPasswordFormState());

  void togglePasswordVisibility() =>
      emit(state.copyWith(obscurePassword: !state.obscurePassword));

  void toggleConfirmVisibility() =>
      emit(state.copyWith(obscureConfirm: !state.obscureConfirm));

  void updateStrength(String password) {
    double strength = 0;
    if (password.length >= 8) strength += 0.2;
    if (password.length >= 12) strength += 0.1;
    if (RegExp(r'[A-Z]').hasMatch(password)) strength += 0.2;
    if (RegExp(r'[a-z]').hasMatch(password)) strength += 0.15;
    if (RegExp(r'[0-9]').hasMatch(password)) strength += 0.15;
    if (RegExp(r'[^A-Za-z0-9]').hasMatch(password)) strength += 0.2;
    emit(state.copyWith(passwordStrength: strength.clamp(0.0, 1.0)));
  }

  void setSubmitting() => emit(state.copyWith(isSubmitting: true));

  void setSuccess() =>
      emit(state.copyWith(isSubmitting: false, isSuccess: true));

  void setError() => emit(state.copyWith(isSubmitting: false));
}
