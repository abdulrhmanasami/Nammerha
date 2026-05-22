import 'package:flutter/foundation.dart';
import '../../../core/i18n/error_keys.dart';
import '../../../core/network/api_client.dart';

/// User model matching backend auth response
/// P0-003: Extended with phone and isKycVerified for progressive KYC gate.
/// Defensive parsing — missing fields default to null/false (most restrictive).
class NammerhaUser {
  final String userId;
  final String email;
  final String fullName;
  final String role;
  final List<String> roles;
  final bool isActive;
  final bool isEmailVerified;
  // P0-003: Progressive KYC profiling fields
  final String? phone;
  final bool isKycVerified;

  const NammerhaUser({
    required this.userId,
    required this.email,
    required this.fullName,
    required this.role,
    required this.roles,
    required this.isActive,
    required this.isEmailVerified,
    this.phone,
    this.isKycVerified = false,
  });

  factory NammerhaUser.fromJson(Map<String, dynamic> json) {
    return NammerhaUser(
      userId: json['user_id'] as String,
      email: json['email'] as String,
      fullName: json['full_name'] as String,
      role: json['role'] as String,
      roles: (json['roles'] as List<dynamic>?)?.cast<String>() ?? [json['role'] as String],
      isActive: json['is_active'] as bool? ?? false,
      isEmailVerified: json['is_email_verified'] as bool? ?? false,
      // P0-003: Defensive — defaults to null/false if backend omits
      phone: json['phone'] as String?,
      isKycVerified: json['kyc_verified'] as bool? ?? false,
    );
  }

  /// P0-003: Whether the user has a complete profile (name + phone set).
  bool get isProfileComplete =>
      fullName.trim().isNotEmpty && (phone?.trim().isNotEmpty ?? false);
}

// ═══════════════════════════════════════════════════════════════════════════════
// P1-W14-001: Login Result — discriminated union for MFA challenge detection.
// ═══════════════════════════════════════════════════════════════════════════════
// PREVIOUS: login() returned Future<NammerhaUser>. When the backend returned
// { mfa_required: true, mfa_token: "..." } instead of user data, the repository
// tried to parse data['user'] → null cast → crash. MFA users were locked out.
// NOW: Returns LoginResult which is either .authenticated (user) or
// .mfaChallenge (token). The BLoC handles both cases explicitly.
// Standard: NIST SP 800-63B (AAL2), Sealed Type Pattern.
// ═══════════════════════════════════════════════════════════════════════════════

class LoginResult {
  final NammerhaUser? user;
  final String? mfaToken;
  final bool mfaRequired;

  LoginResult.authenticated(NammerhaUser this.user)
      : mfaToken = null,
        mfaRequired = false;

  LoginResult.mfaChallenge(String this.mfaToken)
      : user = null,
        mfaRequired = true;
}

/// Production Auth Repository — calls real backend API
/// Mirrors web platform's api.ts auth module exactly
class AuthRepository {
  final NammerhaApiClient _api;

  AuthRepository({NammerhaApiClient? api})
      : _api = api ?? NammerhaApiClient.instance;

  /// POST /api/auth/register
  /// UNIFIED CITIZEN: No role selection — backend auto-grants all roles.
  Future<String> register({
    required String email,
    required String password,
    required String fullName,
    String? phone,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/auth/register',
      method: 'POST',
      body: {
        'email': email.toLowerCase().trim(),
        'password': password,
        'full_name': fullName.trim(),
        if (phone != null) 'phone': phone,
      },
    );
    // P0-AUD-001 FIX: ErrorKeys constant instead of hardcoded Arabic.
    return response.message ?? ErrorKeys.verificationLinkSent;
  }

  /// POST /api/auth/login
  /// Returns LoginResult — either authenticated user or MFA challenge.
  /// P1-W14-002 FIX: Changed return type from `Future<NammerhaUser>` to
  /// `Future<LoginResult>` to handle MFA challenge responses.
  /// W3-P0-001: `remember` controls session duration (short vs long-lived JWT).
  Future<LoginResult> login({
    required String email,
    required String password,
    bool remember = false,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/auth/login',
      method: 'POST',
      body: {
        'email': email.toLowerCase().trim(),
        'password': password,
        'remember': remember,
      },
      fromData: (data) => data as Map<String, dynamic>,
    );

    if (!response.success || response.data == null) {
      // P0-AUD-001 FIX: ErrorKeys constant instead of hardcoded Arabic.
      throw ApiException(response.error ?? ErrorKeys.loginFailed);
    }

    final data = response.data!;

    // P1-W14-002 FIX: Detect MFA challenge before parsing user data.
    // Backend returns { mfa_required: true, mfa_token: "..." } for MFA users.
    // PREVIOUS: Tried to read data['user'] → null → crash.
    // Standard: NIST SP 800-63B (AAL2), Defensive Parsing.
    if (data['mfa_required'] == true && data['mfa_token'] is String) {
      return LoginResult.mfaChallenge(data['mfa_token'] as String);
    }

    final userData = data['user'] as Map<String, dynamic>;
    final token = data['token'] as String?;

    // Store JWT token securely
    if (token != null) {
      await _api.setToken(token);
    }

    return LoginResult.authenticated(NammerhaUser.fromJson(userData));
  }

  /// POST /api/auth/social
  /// Universal social login — works for Google, Apple, Facebook.
  /// Backend verifies ID token server-side, creates/links user, returns JWT.
  /// P1-W14-001 FIX: Changed return type from `Future<NammerhaUser>` to
  /// `Future<LoginResult>` to handle MFA challenge responses.
  /// W3-P2-009: `remember` controls session duration (consistent with email login).
  Future<LoginResult> loginWithSocial({
    required String provider, // 'google' | 'apple' | 'facebook'
    required String idToken,
    String? fullName, // Apple first-login only
    bool remember = false,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/auth/social',
      method: 'POST',
      body: {
        'provider': provider,
        'id_token': idToken,
        if (fullName != null) 'full_name': fullName,
        'remember': remember,
      },
      fromData: (data) => data as Map<String, dynamic>,
    );

    if (!response.success || response.data == null) {
      // P0-AUD-001 FIX: ErrorKeys constant instead of hardcoded Arabic.
      throw ApiException(response.error ?? ErrorKeys.loginFailed);
    }

    final data = response.data!;

    // P1-W14-001 FIX: Detect MFA challenge for social login too.
    // A user who registered via email+password and enabled MFA, then links
    // their Google account — social login still triggers MFA.
    if (data['mfa_required'] == true && data['mfa_token'] is String) {
      return LoginResult.mfaChallenge(data['mfa_token'] as String);
    }

    final userData = data['user'] as Map<String, dynamic>;
    final token = data['token'] as String?;

    // Store JWT token securely
    if (token != null) {
      await _api.setToken(token);
    }

    return LoginResult.authenticated(NammerhaUser.fromJson(userData));
  }

  /// POST /api/auth/logout
  Future<void> logout() async {
    try {
      await _api.request('/auth/logout', method: 'POST');
    } catch (e) {
      debugPrint('[Nammerha] repositories/auth_repository: $e');
      // Non-fatal: always clear local token
    }
    await _api.clearToken();
  }

  /// GET /api/auth/me — Check current session
  Future<NammerhaUser?> getCurrentUser() async {
    if (!_api.isAuthenticated) return null;

    try {
      final response = await _api.request<Map<String, dynamic>>(
        '/auth/me',
        fromData: (data) => data as Map<String, dynamic>,
      );

      if (response.success && response.data != null) {
        final userData = response.data!['user'] as Map<String, dynamic>;
        return NammerhaUser.fromJson(userData);
      }
      return null;
    } on ApiException catch (e) {
      debugPrint('[Nammerha] repositories/auth_repository: $e');
      if (e.isUnauthorized) {
        await _api.clearToken();
        return null;
      }
      rethrow;
    }
  }

  /// POST /api/auth/forgot-password
  Future<String> forgotPassword({required String email}) async {
    await _api.request(
      '/auth/forgot-password',
      method: 'POST',
      body: {'email': email.toLowerCase().trim()},
    );
    // P2-W14-001 FIX: Always return i18n key — never raw backend English message.
    // PREVIOUS: response.message was the English anti-enumeration string
    // "If an account with that email exists..." shown raw to Arabic users.
    // NOW: Always return the i18n key. The UI layer translates via context.tr().
    // Standard: i18n Parity, Anti-Enumeration (identical wording both paths).
    return ErrorKeys.resetLinkSent;
  }

  /// POST /api/auth/reset-password
  Future<String> resetPassword({
    required String token,
    required String newPassword,
  }) async {
    final response = await _api.request(
      '/auth/reset-password',
      method: 'POST',
      body: {
        'token': token,
        'new_password': newPassword,
      },
    );
    // P0-AUD-001 FIX: ErrorKeys constant instead of hardcoded Arabic.
    return response.message ?? ErrorKeys.passwordChanged;
  }

  /// POST /api/auth/resend-verification
  Future<String> resendVerification({required String email}) async {
    await _api.request(
      '/auth/resend-verification',
      method: 'POST',
      body: {'email': email.toLowerCase().trim()},
    );
    // P2-W14-002 FIX: Always return i18n key — never raw backend English message.
    // Same pattern as P2-W14-001 (forgotPassword above).
    return ErrorKeys.resendVerificationSent;
  }

  /// POST /api/auth/verify-email
  /// P0-W12-004 FIX: Converted from GET /verify-email/:token to POST /verify-email.
  /// PREVIOUS: GET with token in URL path — vulnerable to email client prefetching,
  /// CSRF via <img> tags, and token exposure in server/CDN/proxy logs (CWE-598).
  /// NOW: POST with token in body — parity with web frontend and reset-password.
  /// Standard: OWASP ASVS 2.5.2, CWE-598.
  Future<void> verifyEmail(String token) async {
    await _api.request(
      '/auth/verify-email',
      method: 'POST',
      body: {'token': token},
    );
  }

  /// POST /api/auth/change-password (authenticated)
  Future<String> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final response = await _api.request(
      '/auth/change-password',
      method: 'POST',
      body: {
        'current_password': currentPassword,
        'new_password': newPassword,
      },
    );
    // P0-AUD-001 FIX: ErrorKeys constant instead of hardcoded Arabic.
    return response.message ?? ErrorKeys.passwordChanged;
  }

  // UNIFIED CITIZEN: switchRole() and getMyRoles() removed.
  // All users have all roles active — no switching needed.

  /// Check if user is currently authenticated
  bool get isAuthenticated => _api.isAuthenticated;

  // ═══════════════════════════════════════════════════════════════════════════
  // P1-W14-001: MFA Verification Methods
  // ═══════════════════════════════════════════════════════════════════════════
  // Backend endpoints: POST /api/auth/mfa/verify, POST /api/auth/mfa/recovery
  // Both return the same user + token shape as a normal login on success.
  // ═══════════════════════════════════════════════════════════════════════════

  /// POST /api/auth/mfa/verify — TOTP code verification
  /// Called after login returns MFA challenge. Verifies 6-digit TOTP code.
  Future<NammerhaUser> mfaVerify({
    required String mfaToken,
    required String code,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/auth/mfa/verify',
      method: 'POST',
      body: {
        'mfa_token': mfaToken,
        'code': code,
      },
      fromData: (data) => data as Map<String, dynamic>,
    );

    if (!response.success || response.data == null) {
      throw ApiException(response.error ?? ErrorKeys.mfaVerifyFailed);
    }

    final data = response.data!;
    final userData = data['user'] as Map<String, dynamic>;
    final token = data['token'] as String?;

    if (token != null) {
      await _api.setToken(token);
    }

    return NammerhaUser.fromJson(userData);
  }

  /// POST /api/auth/mfa/recovery — Recovery code verification
  /// Fallback when user doesn't have access to their authenticator app.
  Future<NammerhaUser> mfaRecovery({
    required String mfaToken,
    required String recoveryCode,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/auth/mfa/recovery',
      method: 'POST',
      body: {
        'mfa_token': mfaToken,
        'recovery_code': recoveryCode,
      },
      fromData: (data) => data as Map<String, dynamic>,
    );

    if (!response.success || response.data == null) {
      throw ApiException(response.error ?? ErrorKeys.mfaVerifyFailed);
    }

    final data = response.data!;
    final userData = data['user'] as Map<String, dynamic>;
    final token = data['token'] as String?;

    if (token != null) {
      await _api.setToken(token);
    }

    return NammerhaUser.fromJson(userData);
  }
}
