import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../../../core/utils/password_strength.dart';

// ═══════════════════════════════════════════════════════════════════════════
// ResetPasswordFormCubit — Platinum Standard (Absolute Zero setState)
// ═══════════════════════════════════════════════════════════════════════════
// Manages pure UI state for the Reset Password screen:
//   - obscurePassword / obscureConfirm (password visibility toggles)
//   - passwordStrength (0–4 integer score, unified with PasswordStrengthIndicator)
//   - isSubmitting / isSuccess (form lifecycle)
//
// This replaces 7 `setState` calls in `_ResetPasswordScreenState`.
// ═══════════════════════════════════════════════════════════════════════════

class ResetPasswordFormState extends Equatable {
  final bool obscurePassword;
  final bool obscureConfirm;
  // MOB-PW FIX: Changed from double (0.0–1.0) to int (0–4) to unify with
  // PasswordStrengthIndicator widget and ChangePasswordFormCubit.
  final int passwordStrength;
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
    int? passwordStrength,
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

  /// MOB-PW-DRY FIX: Delegates to shared computePasswordStrength().
  /// Single source of truth: core/utils/password_strength.dart.
  void updateStrength(String password) {
    emit(state.copyWith(passwordStrength: computePasswordStrength(password)));
  }

  void setSubmitting() => emit(state.copyWith(isSubmitting: true));

  void setSuccess() =>
      emit(state.copyWith(isSubmitting: false, isSuccess: true));

  void setError() => emit(state.copyWith(isSubmitting: false));
}
