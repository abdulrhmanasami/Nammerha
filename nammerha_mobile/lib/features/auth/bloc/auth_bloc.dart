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
/// UNIFIED CITIZEN: role param removed — backend auto-grants all roles.
class AuthRegisterRequested extends AuthEvent {
  final String email;
  final String password;
  final String fullName;
  const AuthRegisterRequested({
    required this.email,
    required this.password,
    required this.fullName,
  });
  @override
  List<Object?> get props => [email, password, fullName];
}

/// Logout
class AuthLogoutRequested extends AuthEvent {}

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

/// Social login (Google, Apple, Facebook)
class AuthSocialLoginRequested extends AuthEvent {
  final String provider; // 'google' | 'apple' | 'facebook'
  final String idToken;
  final String? fullName; // Apple first-login only
  const AuthSocialLoginRequested({
    required this.provider,
    required this.idToken,
    this.fullName,
  });
  @override
  List<Object?> get props => [provider, idToken, fullName];
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

/// Emitted when login is rejected because the user's email is not verified.
/// Carries the email address so the UI can offer a "Resend verification" action.
class AuthEmailNotVerified extends AuthState {
  final String email;
  final String message;
  const AuthEmailNotVerified({required this.email, required this.message});
  @override
  List<Object?> get props => [email, message];
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

  /// Exposed for direct repository access (e.g., resend verification).
  AuthRepository get authRepository => _authRepository;

  AuthBloc({required AuthRepository authRepository})
      : _authRepository = authRepository,
        super(AuthInitial()) {
    on<AuthCheckSession>(_onCheckSession);
    on<AuthLoginRequested>(_onLogin);
    on<AuthRegisterRequested>(_onRegister);
    on<AuthLogoutRequested>(_onLogout);
    on<AuthForgotPassword>(_onForgotPassword);
    on<AuthChangePasswordRequested>(_onChangePassword);
    on<AuthResetPassword>(_onResetPassword);
    on<AuthSocialLoginRequested>(_onSocialLogin);

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

  /// OAuth-001: Social login via provider's ID token
  Future<void> _onSocialLogin(AuthSocialLoginRequested event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final user = await _authRepository.loginWithSocial(
        provider: event.provider,
        idToken: event.idToken,
        fullName: event.fullName,
      );
      emit(AuthAuthenticated(user));
    } on ApiException catch (e) {
      // Apply same i18n defense as email login
      final translatedMsg = _localizeError(e.message);
      emit(AuthError(translatedMsg));
    } catch (e) {
      emit(AuthError(_localizeError(e.toString())));
    }
  }

  // ─── I18N-DEFENSE: Client-side error translation ────────────────────────
  // Two-tier lookup: O(1) exact match first, O(n) regex fallback second.
  // M3 FIX: Most backend errors are exact strings. HashMap resolves ~80%
  // of calls in constant time without iterating 15 regex patterns.

  /// Tier 1: O(1) exact match for common error messages (case-insensitive via lowercase keys).
  static final Map<String, String> _exactErrorMap = {
    'verify your email': 'يرجى تأكيد بريدك الإلكتروني قبل تسجيل الدخول. تحقق من صندوق الوارد للحصول على رابط التحقق.',
    'invalid email or password': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    'account temporarily locked': 'الحساب مقفل مؤقتاً — حاول مرة أخرى لاحقاً',
    'authentication required': 'يجب تسجيل الدخول',
    'token expired': 'انتهت صلاحية الجلسة — يرجى تسجيل الدخول مجدداً',
    'session expired': 'انتهت الجلسة — يرجى تسجيل الدخول مجدداً',
    'token invalidated': 'تم إلغاء الجلسة — يرجى تسجيل الدخول مجدداً',
    'invalid token': 'رمز غير صالح',
    'missing required fields': 'الحقول المطلوبة مفقودة',
    'missing required field': 'الحقول المطلوبة مفقودة',
    'too many requests': 'طلبات كثيرة جداً — حاول مرة أخرى لاحقاً',
    'internal server error': 'خطأ في الخادم',
    'not found': 'غير موجود',
    'unauthorized': 'غير مصرح',
    'profile setup required': 'يجب إكمال الملف الشخصي أولاً',
  };

  /// Tier 2: O(n) regex fallback for fuzzy/partial matches (rare cases).
  static final List<MapEntry<RegExp, String>> _regexErrorFallbacks = [
    MapEntry(RegExp(r'verify your email', caseSensitive: false),
        'يرجى تأكيد بريدك الإلكتروني قبل تسجيل الدخول. تحقق من صندوق الوارد للحصول على رابط التحقق.'),
    MapEntry(RegExp(r'no longer supported.*update', caseSensitive: false),
        'يرجى تحديث التطبيق من متجر التطبيقات'),
  ];

  /// M3 FIX: Two-tier localization — HashMap O(1) → RegExp O(n) fallback.
  /// Returns the Arabic translation if the message matches a known pattern,
  /// otherwise returns the original message.
  static String _localizeError(String message) {
    // Tier 1: O(1) exact match (covers ~80% of cases)
    final exact = _exactErrorMap[message.toLowerCase().trim()];
    if (exact != null) return exact;

    // Tier 2: O(n) regex fallback (for partial/fuzzy matches)
    for (final entry in _regexErrorFallbacks) {
      if (entry.key.hasMatch(message)) {
        return entry.value;
      }
    }
    return message;
  }

  /// Detects if an error message is about email verification.
  static bool _isEmailVerificationError(String message) {
    return message.contains('verify') ||
        message.contains('verification') ||
        message.contains('تأكيد بريدك') ||
        message.contains('EMAIL_NOT_VERIFIED');
  }

  Future<void> _onLogin(AuthLoginRequested event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final user = await _authRepository.login(
        email: event.email,
        password: event.password,
      );

      if (!user.isEmailVerified) {
        emit(AuthEmailNotVerified(
          email: event.email,
          message: 'يرجى تأكيد بريدك الإلكتروني قبل تسجيل الدخول. تحقق من صندوق الوارد للحصول على رابط التحقق.',
        ));
        return;
      }

      emit(AuthAuthenticated(user));
    } on ApiException catch (e) {
      // Detect email verification errors and emit specific state
      if (_isEmailVerificationError(e.message)) {
        emit(AuthEmailNotVerified(
          email: event.email,
          message: _localizeError(e.message),
        ));
      } else {
        emit(AuthError(_localizeError(e.message)));
      }
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
