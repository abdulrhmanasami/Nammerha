import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// ChangePasswordFormCubit — Platinum Standard (Absolute Zero setState)
// ═══════════════════════════════════════════════════════════════════════════
// Manages pure UI state for the Change Password bottom sheet:
//   - obscureCurrent / obscureNew / obscureConfirm (visibility toggles)
//   - strength (password strength indicator 0-5)
//   - validationError (client-side validation message)
//
// This replaces 6 `setState` calls in `_ChangePasswordSheetState`.
// ═══════════════════════════════════════════════════════════════════════════

class ChangePasswordFormState extends Equatable {
  final bool obscureCurrent;
  final bool obscureNew;
  final bool obscureConfirm;
  final int strength;
  final String? validationError;

  const ChangePasswordFormState({
    this.obscureCurrent = true,
    this.obscureNew = true,
    this.obscureConfirm = true,
    this.strength = 0,
    this.validationError,
  });

  ChangePasswordFormState copyWith({
    bool? obscureCurrent,
    bool? obscureNew,
    bool? obscureConfirm,
    int? strength,
    String? validationError,
    bool clearError = false,
  }) {
    return ChangePasswordFormState(
      obscureCurrent: obscureCurrent ?? this.obscureCurrent,
      obscureNew: obscureNew ?? this.obscureNew,
      obscureConfirm: obscureConfirm ?? this.obscureConfirm,
      strength: strength ?? this.strength,
      validationError: clearError ? null : (validationError ?? this.validationError),
    );
  }

  @override
  List<Object?> get props => [
        obscureCurrent,
        obscureNew,
        obscureConfirm,
        strength,
        validationError,
      ];
}

class ChangePasswordFormCubit extends Cubit<ChangePasswordFormState> {
  ChangePasswordFormCubit() : super(const ChangePasswordFormState());

  void toggleCurrentVisibility() =>
      emit(state.copyWith(obscureCurrent: !state.obscureCurrent));

  void toggleNewVisibility() =>
      emit(state.copyWith(obscureNew: !state.obscureNew));

  void toggleConfirmVisibility() =>
      emit(state.copyWith(obscureConfirm: !state.obscureConfirm));

  void updateStrength(String password) {
    int s = 0;
    if (password.length >= 8) s++;
    if (RegExp(r'[A-Z]').hasMatch(password)) s++;
    if (RegExp(r'[a-z]').hasMatch(password)) s++;
    if (RegExp(r'[0-9]').hasMatch(password)) s++;
    if (RegExp(r'[^A-Za-z0-9]').hasMatch(password)) s++;
    emit(state.copyWith(strength: s));
  }

  void setValidationError(String error) =>
      emit(state.copyWith(validationError: error));

  void clearValidationError() =>
      emit(state.copyWith(clearError: true));
}
