import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../repositories/auth_repository.dart';
import '../../../core/network/api_client.dart';
import '../../../core/i18n/error_keys.dart';

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
/// W3-P1-008: `remember` controls persistent session via backend JWT duration.
class AuthLoginRequested extends AuthEvent {
  final String email;
  final String password;
  final bool remember;
  const AuthLoginRequested({
    required this.email,
    required this.password,
    this.remember = false,
  });
  @override
  List<Object?> get props => [email, password, remember];
}

/// Register new account
/// UNIFIED CITIZEN: role param removed — backend auto-grants all roles.
/// P0-W14-002 FIX: Added `phone` parameter — cross-platform parity with web.
class AuthRegisterRequested extends AuthEvent {
  final String email;
  final String password;
  final String fullName;
  final String? phone;
  const AuthRegisterRequested({
    required this.email,
    required this.password,
    required this.fullName,
    this.phone,
  });
  @override
  List<Object?> get props => [email, password, fullName, phone];
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
/// W3-P1-008: `remember` flows through to repository for session persistence.
class AuthSocialLoginRequested extends AuthEvent {
  final String provider; // 'google' | 'apple' | 'facebook'
  final String idToken;
  final String? fullName; // Apple first-login only
  final bool remember;
  const AuthSocialLoginRequested({
    required this.provider,
    required this.idToken,
    this.fullName,
    this.remember = false,
  });
  @override
  List<Object?> get props => [provider, idToken, fullName, remember];
}

/// P1-W14-001: MFA TOTP verification after login returns mfa_required
class AuthMfaVerifyRequested extends AuthEvent {
  final String mfaToken;
  final String code;
  const AuthMfaVerifyRequested({
    required this.mfaToken,
    required this.code,
  });
  @override
  List<Object?> get props => [mfaToken, code];
}

/// P1-W14-001: MFA recovery code verification
class AuthMfaRecoveryRequested extends AuthEvent {
  final String mfaToken;
  final String recoveryCode;
  const AuthMfaRecoveryRequested({
    required this.mfaToken,
    required this.recoveryCode,
  });
  @override
  List<Object?> get props => [mfaToken, recoveryCode];
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
  List<Object?> get props => [user.userId, user.role];
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

/// P1-W14-001: MFA challenge required — user must enter TOTP code.
/// Carries the MFA token and the login email for display context.
class AuthMfaRequired extends AuthState {
  final String mfaToken;
  final String email;
  const AuthMfaRequired({required this.mfaToken, required this.email});
  @override
  List<Object?> get props => [mfaToken, email];
}

/// P1-W15-002: MFA verification error — retains MFA context for retry.
/// PREVIOUS: _onMfaVerify emitted generic AuthError, which kicked the user
/// back to login. They had to re-enter password to get a new MFA challenge.
/// NOW: Carries the error message AND the mfaToken/email so the MFA screen
/// can show the error and let the user retry without re-authenticating.
/// Standard: Nielsen #9 (Error Recovery), State Preservation.
class AuthMfaError extends AuthState {
  final String message;
  final String mfaToken;
  final String email;
  const AuthMfaError({required this.message, required this.mfaToken, required this.email});
  @override
  List<Object?> get props => [message, mfaToken, email];
}

/// P1-AUDIT-003: Emitted when login is attempted on a social-only account.
/// Carries the provider name so the UI can offer a direct social login CTA
/// instead of a generic error message.
/// Standard: Nielsen #9 (Error Recovery), Contextual Help.
class AuthSocialOnlyAccount extends AuthState {
  final String provider; // 'google', 'apple', 'facebook'
  final String email;
  final String message;
  const AuthSocialOnlyAccount({required this.provider, required this.email, required this.message});
  @override
  List<Object?> get props => [provider, email, message];
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
    on<AuthMfaVerifyRequested>(_onMfaVerify);
    on<AuthMfaRecoveryRequested>(_onMfaRecovery);

    // Listen for 401 from API client
    NammerhaApiClient.instance.onAuthExpired = () {
      add(AuthLogoutRequested());
    };
  }

  Future<void> _onCheckSession(AuthCheckSession event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final user = await _authRepository.getCurrentUser();
      if (isClosed) return;
      if (user != null) {
        emit(AuthAuthenticated(user));
      } else {
        emit(AuthUnauthenticated());
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[Nammerha] bloc/auth_bloc: $e');
      emit(AuthUnauthenticated());
    }
  }

  /// OAuth-001: Social login via provider's ID token
  /// P1-W14-001 FIX: Handle LoginResult.mfaChallenge.
  Future<void> _onSocialLogin(AuthSocialLoginRequested event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final result = await _authRepository.loginWithSocial(
        provider: event.provider,
        idToken: event.idToken,
        fullName: event.fullName,
        remember: event.remember,
      );

      if (isClosed) return;

      if (result.mfaRequired && result.mfaToken != null) {
        emit(AuthMfaRequired(mfaToken: result.mfaToken!, email: ''));
        return;
      }

      emit(AuthAuthenticated(result.user!));
    } on ApiException catch (e) {
      if (kDebugMode) debugPrint('[Nammerha] bloc/auth_bloc: $e');
      // Apply same i18n defense as email login
      final translatedMsg = _localizeError(e.message);
      emit(AuthError(translatedMsg));
    } catch (e) {
      if (kDebugMode) debugPrint('[Nammerha] bloc/auth_bloc: $e');
      emit(AuthError(_localizeError(e.toString())));
    }
  }

  // ─── I18N-DEFENSE: Client-side error translation ────────────────────────
  // Two-tier lookup: O(1) exact match first, O(n) regex fallback second.
  // M3 FIX: Most backend errors are exact strings. HashMap resolves ~80%
  // of calls in constant time without iterating 15 regex patterns.

  /// Tier 1: O(1) exact match for common error messages (case-insensitive via lowercase keys).
  /// Wave 4: Values are now i18n ERROR KEYS, not hardcoded Arabic.
  /// P2-W5-001: Expanded with all backend auth error strings.
  /// The UI layer translates via context.tr(key).
  static final Map<String, String> _exactErrorMap = {
    // ── Login / Auth ──────────────────────────────────────────────
    'verify your email': ErrorKeys.verifyEmail,
    'invalid email or password': ErrorKeys.invalidCredentials,
    'account temporarily locked': ErrorKeys.accountLocked,
    'authentication required': ErrorKeys.authRequired,
    'token expired': ErrorKeys.sessionExpired,
    'session expired': ErrorKeys.sessionExpired,
    'token invalidated': ErrorKeys.tokenInvalidated,
    'invalid token': ErrorKeys.invalidToken,
    'missing required fields': ErrorKeys.missingFields,
    'missing required field': ErrorKeys.missingFields,
    'too many requests': ErrorKeys.tooManyRequests,
    'internal server error': ErrorKeys.serverError,
    'not found': ErrorKeys.notFound,
    'unauthorized': ErrorKeys.unauthorized,
    'profile setup required': ErrorKeys.profileRequired,

    // ── P2-W5-001: Backend Error Unification — New Mappings ──────
    'email address is too long': ErrorKeys.emailTooLong,
    'invalid email format': ErrorKeys.invalidEmailFormat,
    'email is required': ErrorKeys.missingFields,
    'current password is incorrect': ErrorKeys.incorrectPassword,
    'user not found': ErrorKeys.notFound,
    'invalid or expired reset token': ErrorKeys.invalidToken,
    'new password must be different from current password':
        ErrorKeys.passwordSameAsOld,
    'token and new password are required': ErrorKeys.missingFields,
    'current password and new password are required': ErrorKeys.missingFields,
    'invalid verification token': ErrorKeys.invalidToken,
    'verification token not found or already used': ErrorKeys.invalidToken,
    'email already verified': ErrorKeys.verifyEmail,
    'missing required fields: email, password': ErrorKeys.missingFields,
    'missing required fields: email, password, full_name':
        ErrorKeys.missingFields,
  };

  /// Tier 2: O(n) regex fallback for fuzzy/partial matches (rare cases).
  /// P2-W5-001: Added patterns for template strings with dynamic values.
  static final List<MapEntry<RegExp, String>> _regexErrorFallbacks = [
    MapEntry(RegExp(r'verify your email', caseSensitive: false),
        ErrorKeys.verifyEmail),
    MapEntry(RegExp(r'no longer supported.*update', caseSensitive: false),
        ErrorKeys.generic),
    // P2-W5-001: Dynamic template strings from backend
    MapEntry(RegExp(r'password must not exceed', caseSensitive: false),
        ErrorKeys.passwordTooLong),
    MapEntry(RegExp(r'password must contain:', caseSensitive: false),
        ErrorKeys.missingFields),
    MapEntry(RegExp(r'account temporarily locked.*try again', caseSensitive: false),
        ErrorKeys.accountLocked),
    MapEntry(RegExp(r'this account uses .+ sign-in|uses social login', caseSensitive: false),
        ErrorKeys.socialOnlyAccount),
    MapEntry(RegExp(r'(verification|reset) token has expired', caseSensitive: false),
        ErrorKeys.tokenExpired),
    MapEntry(RegExp(r'please verify your email', caseSensitive: false),
        ErrorKeys.verifyEmail),
    MapEntry(RegExp(r'please wait \d+ seconds', caseSensitive: false),
        ErrorKeys.tooManyRequests),
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

  /// P1-AUDIT-003: Detects if an error message is about a social-only account.
  static bool _isSocialOnlyError(String message) {
    final lower = message.toLowerCase();
    return (lower.contains('uses') && lower.contains('sign-in')) ||
        lower.contains('social login') ||
        lower.contains('social_only_account');
  }

  /// P1-AUDIT-003: Extracts the social provider name from the error message.
  static String _extractSocialProvider(String message) {
    final lower = message.toLowerCase();
    if (lower.contains('google')) return 'google';
    if (lower.contains('apple')) return 'apple';
    if (lower.contains('facebook')) return 'facebook';
    return 'google'; // Safe default
  }

  Future<void> _onLogin(AuthLoginRequested event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final result = await _authRepository.login(
        email: event.email,
        password: event.password,
        remember: event.remember,
      );

      if (isClosed) return;

      // P1-W14-002 FIX: Handle MFA challenge response.
      // PREVIOUS: login() returned NammerhaUser directly — if backend returned
      // mfa_required, the repository tried to parse data['user'] → null → crash.
      // NOW: LoginResult discriminated union handles both paths.
      if (result.mfaRequired && result.mfaToken != null) {
        emit(AuthMfaRequired(mfaToken: result.mfaToken!, email: event.email));
        return;
      }

      final user = result.user!;

      if (!user.isEmailVerified) {
        emit(AuthEmailNotVerified(
          email: event.email,
          message: ErrorKeys.verifyEmail,
        ));
        return;
      }

      emit(AuthAuthenticated(user));
    } on ApiException catch (e) {
      if (kDebugMode) debugPrint('[Nammerha] bloc/auth_bloc: $e');
      // Detect email verification errors and emit specific state
      if (_isEmailVerificationError(e.message)) {
        emit(AuthEmailNotVerified(
          email: event.email,
          message: _localizeError(e.message),
        ));
      // P1-AUDIT-003: Detect social-only account errors and emit specific state.
      // PREVIOUS: Generic AuthError — user saw cryptic error with no guidance.
      // NOW: AuthSocialOnlyAccount carries the provider name so the UI can
      // show a MaterialBanner with a direct 'Sign in with Google/Apple' CTA.
      } else if (_isSocialOnlyError(e.message)) {
        emit(AuthSocialOnlyAccount(
          provider: _extractSocialProvider(e.message),
          email: event.email,
          message: _localizeError(e.message),
        ));
      } else {
        emit(AuthError(_localizeError(e.message)));
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[Nammerha] bloc/auth_bloc: $e');
      emit(AuthError(ErrorKeys.loginFailed));
    }
  }

  Future<void> _onRegister(AuthRegisterRequested event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final message = await _authRepository.register(
        email: event.email,
        password: event.password,
        fullName: event.fullName,
        // P0-W14-002 FIX: Pass phone field to repository.
        // PREVIOUS: phone was never passed — mobile users couldn't register with phone.
        phone: event.phone,
      );
      if (isClosed) return;
      emit(AuthRegistrationSuccess(message));
    } on ApiException catch (e) {
      if (kDebugMode) debugPrint('[Nammerha] bloc/auth_bloc: $e');
      // P0-AUD-002 FIX: Apply _localizeError() — was missing, unlike _onLogin.
      emit(AuthError(_localizeError(e.message)));
    } catch (e) {
      if (kDebugMode) debugPrint('[Nammerha] bloc/auth_bloc: $e');
      emit(AuthError(ErrorKeys.registerFailed));
    }
  }

  Future<void> _onLogout(AuthLogoutRequested event, Emitter<AuthState> emit) async {
    await _authRepository.logout();
    if (isClosed) return;
    emit(AuthUnauthenticated());
  }



  Future<void> _onForgotPassword(AuthForgotPassword event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final message = await _authRepository.forgotPassword(email: event.email);
      if (isClosed) return;
      emit(AuthPasswordResetSent(message));
    } on ApiException catch (e) {
      if (kDebugMode) debugPrint('[Nammerha] bloc/auth_bloc: $e');
      // P1-AUD-001 FIX: Apply _localizeError() — was missing, unlike _onLogin.
      emit(AuthError(_localizeError(e.message)));
    } catch (e) {
      if (kDebugMode) debugPrint('[Nammerha] bloc/auth_bloc: $e');
      emit(AuthError(ErrorKeys.generic));
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
      if (isClosed) return;
      if (user != null) {
        emit(AuthPasswordChanged(message));
        emit(AuthAuthenticated(user));
      } else {
        emit(AuthPasswordChanged(message));
      }
    } on ApiException catch (e) {
      if (kDebugMode) debugPrint('[Nammerha] bloc/auth_bloc: $e');
      // P1-AUD-002 FIX: Apply _localizeError() — was missing, unlike _onLogin.
      emit(AuthError(_localizeError(e.message)));
    } catch (e) {
      if (kDebugMode) debugPrint('[Nammerha] bloc/auth_bloc: $e');
      emit(AuthError(ErrorKeys.generic));
    }
  }

  Future<void> _onResetPassword(AuthResetPassword event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final message = await _authRepository.resetPassword(
        token: event.token,
        newPassword: event.newPassword,
      );
      if (isClosed) return;
      emit(AuthPasswordResetSuccess(message));
    } on ApiException catch (e) {
      if (kDebugMode) debugPrint('[Nammerha] bloc/auth_bloc: $e');
      // P1-AUD-003 FIX: Apply _localizeError() — was missing, unlike _onLogin.
      emit(AuthError(_localizeError(e.message)));
    } catch (e) {
      if (kDebugMode) debugPrint('[Nammerha] bloc/auth_bloc: $e');
      emit(AuthError(ErrorKeys.generic));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // P1-W14-001: MFA Verification Handlers
  // ═══════════════════════════════════════════════════════════════════════════

  Future<void> _onMfaVerify(AuthMfaVerifyRequested event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final user = await _authRepository.mfaVerify(
        mfaToken: event.mfaToken,
        code: event.code,
      );
      if (isClosed) return;
      emit(AuthAuthenticated(user));
    } on ApiException catch (e) {
      if (kDebugMode) debugPrint('[Nammerha] bloc/auth_bloc: $e');
      final translatedMsg = _localizeError(e.message);
      // P1-W15-002 FIX: Emit AuthMfaError instead of AuthError.
      // PREVIOUS: Generic AuthError kicked user back to login — lost MFA context.
      // NOW: AuthMfaError carries mfaToken + email for retry on MFA screen.
      emit(AuthMfaError(message: translatedMsg, mfaToken: event.mfaToken, email: ''));
    } catch (e) {
      if (kDebugMode) debugPrint('[Nammerha] bloc/auth_bloc: $e');
      emit(AuthMfaError(message: ErrorKeys.mfaVerifyFailed, mfaToken: event.mfaToken, email: ''));
    }
  }

  Future<void> _onMfaRecovery(AuthMfaRecoveryRequested event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final user = await _authRepository.mfaRecovery(
        mfaToken: event.mfaToken,
        recoveryCode: event.recoveryCode,
      );
      if (isClosed) return;
      emit(AuthAuthenticated(user));
    } on ApiException catch (e) {
      if (kDebugMode) debugPrint('[Nammerha] bloc/auth_bloc: $e');
      final translatedMsg = _localizeError(e.message);
      // P1-W15-002 FIX: Same fix as _onMfaVerify above.
      emit(AuthMfaError(message: translatedMsg, mfaToken: event.mfaToken, email: ''));
    } catch (e) {
      if (kDebugMode) debugPrint('[Nammerha] bloc/auth_bloc: $e');
      emit(AuthMfaError(message: ErrorKeys.mfaVerifyFailed, mfaToken: event.mfaToken, email: ''));
    }
  }
}
