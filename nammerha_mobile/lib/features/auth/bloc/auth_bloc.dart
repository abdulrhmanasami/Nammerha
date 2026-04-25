import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../repositories/auth_repository.dart';
import '../../../core/network/api_client.dart';

// ═══════════════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════════════

abstract class AuthEvent extends Equatable {
  const AuthEvent();
  @override
  List<Object?> get props => [];
}

/// Check if user has a valid session (on app start)
class AuthCheckSession extends AuthEvent {}

/// Login with email + password
class AuthLoginRequested extends AuthEvent {
  final String email;
  final String password;
  const AuthLoginRequested({required this.email, required this.password});
  @override
  List<Object?> get props => [email, password];
}

/// Register new account
class AuthRegisterRequested extends AuthEvent {
  final String email;
  final String password;
  final String fullName;
  final String role;
  const AuthRegisterRequested({
    required this.email,
    required this.password,
    required this.fullName,
    this.role = 'donor',
  });
  @override
  List<Object?> get props => [email, password, fullName, role];
}

/// Logout
class AuthLogoutRequested extends AuthEvent {}

/// Switch active role
class AuthRoleSwitched extends AuthEvent {
  final String role;
  const AuthRoleSwitched(this.role);
  @override
  List<Object?> get props => [role];
}

/// Forgot password
class AuthForgotPassword extends AuthEvent {
  final String email;
  const AuthForgotPassword(this.email);
  @override
  List<Object?> get props => [email];
}

/// Change password (authenticated)
class AuthChangePasswordRequested extends AuthEvent {
  final String currentPassword;
  final String newPassword;
  const AuthChangePasswordRequested({
    required this.currentPassword,
    required this.newPassword,
  });
  @override
  List<Object?> get props => [currentPassword, newPassword];
}

/// Reset password via deep-link token (GAP-H5)
class AuthResetPassword extends AuthEvent {
  final String token;
  final String newPassword;
  const AuthResetPassword({required this.token, required this.newPassword});
  @override
  List<Object?> get props => [token, newPassword];
}

// ═══════════════════════════════════════════════════════════════════════════
// STATES
// ═══════════════════════════════════════════════════════════════════════════

abstract class AuthState extends Equatable {
  const AuthState();
  @override
  List<Object?> get props => [];
}

class AuthInitial extends AuthState {}

class AuthLoading extends AuthState {}

class AuthAuthenticated extends AuthState {
  final NammerhaUser user;
  const AuthAuthenticated(this.user);
  @override
  List<Object?> get props => [user.userId, user.activeRole];
}

class AuthUnauthenticated extends AuthState {}

class AuthRegistrationSuccess extends AuthState {
  final String message;
  const AuthRegistrationSuccess(this.message);
  @override
  List<Object?> get props => [message];
}

class AuthPasswordResetSent extends AuthState {
  final String message;
  const AuthPasswordResetSent(this.message);
  @override
  List<Object?> get props => [message];
}

class AuthError extends AuthState {
  final String message;
  const AuthError(this.message);
  @override
  List<Object?> get props => [message];
}

/// Emitted after a successful password change — distinct from AuthError so
/// callers can differentiate between password-change success and login success.
class AuthPasswordChanged extends AuthState {
  final String message;
  const AuthPasswordChanged(this.message);
  @override
  List<Object?> get props => [message];
}

/// Emitted after a successful password reset via deep-link token (GAP-H5)
class AuthPasswordResetSuccess extends AuthState {
  final String message;
  const AuthPasswordResetSuccess(this.message);
  @override
  List<Object?> get props => [message];
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOC
// ═══════════════════════════════════════════════════════════════════════════

class AuthBloc extends Bloc<AuthEvent, AuthState> {
  final AuthRepository _authRepository;

  AuthBloc({required AuthRepository authRepository})
      : _authRepository = authRepository,
        super(AuthInitial()) {
    on<AuthCheckSession>(_onCheckSession);
    on<AuthLoginRequested>(_onLogin);
    on<AuthRegisterRequested>(_onRegister);
    on<AuthLogoutRequested>(_onLogout);
    on<AuthRoleSwitched>(_onRoleSwitch);
    on<AuthForgotPassword>(_onForgotPassword);
    on<AuthChangePasswordRequested>(_onChangePassword);
    on<AuthResetPassword>(_onResetPassword);

    // Listen for 401 from API client
    NammerhaApiClient.instance.onAuthExpired = () {
      add(AuthLogoutRequested());
    };
  }

  Future<void> _onCheckSession(AuthCheckSession event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final user = await _authRepository.getCurrentUser();
      if (user != null) {
        emit(AuthAuthenticated(user));
      } else {
        emit(AuthUnauthenticated());
      }
    } catch (_) {
      emit(AuthUnauthenticated());
    }
  }

  Future<void> _onLogin(AuthLoginRequested event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final user = await _authRepository.login(
        email: event.email,
        password: event.password,
      );

      if (!user.isEmailVerified) {
        emit(const AuthError('يرجى تأكيد بريدك الإلكتروني قبل تسجيل الدخول'));
        return;
      }

      emit(AuthAuthenticated(user));
    } on ApiException catch (e) {
      emit(AuthError(e.message));
    } catch (e) {
      emit(AuthError('حدث خطأ أثناء تسجيل الدخول: ${e.toString()}'));
    }
  }

  Future<void> _onRegister(AuthRegisterRequested event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final message = await _authRepository.register(
        email: event.email,
        password: event.password,
        fullName: event.fullName,
        role: event.role,
      );
      emit(AuthRegistrationSuccess(message));
    } on ApiException catch (e) {
      emit(AuthError(e.message));
    } catch (e) {
      emit(AuthError('حدث خطأ أثناء إنشاء الحساب: ${e.toString()}'));
    }
  }

  Future<void> _onLogout(AuthLogoutRequested event, Emitter<AuthState> emit) async {
    await _authRepository.logout();
    emit(AuthUnauthenticated());
  }

  Future<void> _onRoleSwitch(AuthRoleSwitched event, Emitter<AuthState> emit) async {
    try {
      await _authRepository.switchRole(event.role);
      // Refresh user data after role switch
      final user = await _authRepository.getCurrentUser();
      if (user != null) {
        emit(AuthAuthenticated(user));
      }
    } catch (e) {
      // Role switch failed — stay on current role
    }
  }

  Future<void> _onForgotPassword(AuthForgotPassword event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final message = await _authRepository.forgotPassword(email: event.email);
      emit(AuthPasswordResetSent(message));
    } on ApiException catch (e) {
      emit(AuthError(e.message));
    } catch (e) {
      emit(AuthError('حدث خطأ: ${e.toString()}'));
    }
  }

  Future<void> _onChangePassword(AuthChangePasswordRequested event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final message = await _authRepository.changePassword(
        currentPassword: event.currentPassword,
        newPassword: event.newPassword,
      );
      // Re-fetch user to get fresh token state
      final user = await _authRepository.getCurrentUser();
      if (user != null) {
        emit(AuthPasswordChanged(message));
        emit(AuthAuthenticated(user));
      } else {
        emit(AuthPasswordChanged(message));
      }
    } on ApiException catch (e) {
      emit(AuthError(e.message));
    } catch (e) {
      emit(AuthError('فشل تغيير كلمة المرور: ${e.toString()}'));
    }
  }

  Future<void> _onResetPassword(AuthResetPassword event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final message = await _authRepository.resetPassword(
        token: event.token,
        newPassword: event.newPassword,
      );
      emit(AuthPasswordResetSuccess(message));
    } on ApiException catch (e) {
      emit(AuthError(e.message));
    } catch (e) {
      emit(AuthError('فشل إعادة تعيين كلمة المرور: ${e.toString()}'));
    }
  }
}
