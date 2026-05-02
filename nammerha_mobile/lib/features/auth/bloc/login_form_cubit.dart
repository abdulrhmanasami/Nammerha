import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// LoginFormCubit — Platinum Standard (Absolute Zero setState)
// ═══════════════════════════════════════════════════════════════════════════
// Manages pure UI state for the Login/Register screen:
//   - isLoginMode (toggle between login and register)
//   - obscurePassword (password visibility toggle)
//   - selectedRole (registration role selection)
//
// This replaces 4 `setState` calls in `_LoginScreenState`.
// ═══════════════════════════════════════════════════════════════════════════

class LoginFormState extends Equatable {
  final bool isLoginMode;
  final bool obscurePassword;
  final String selectedRole;

  const LoginFormState({
    this.isLoginMode = true,
    this.obscurePassword = true,
    this.selectedRole = 'donor',
  });

  LoginFormState copyWith({
    bool? isLoginMode,
    bool? obscurePassword,
    String? selectedRole,
  }) {
    return LoginFormState(
      isLoginMode: isLoginMode ?? this.isLoginMode,
      obscurePassword: obscurePassword ?? this.obscurePassword,
      selectedRole: selectedRole ?? this.selectedRole,
    );
  }

  @override
  List<Object?> get props => [isLoginMode, obscurePassword, selectedRole];
}

class LoginFormCubit extends Cubit<LoginFormState> {
  LoginFormCubit() : super(const LoginFormState());

  void toggleMode() => emit(state.copyWith(isLoginMode: !state.isLoginMode));

  void switchToLoginMode() => emit(state.copyWith(isLoginMode: true));

  void togglePasswordVisibility() =>
      emit(state.copyWith(obscurePassword: !state.obscurePassword));

  void selectRole(String role) => emit(state.copyWith(selectedRole: role));
}
