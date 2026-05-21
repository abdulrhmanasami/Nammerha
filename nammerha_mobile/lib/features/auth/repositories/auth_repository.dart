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
  /// Returns user + JWT token (MOB-AUTH-001: token in body for mobile)
  /// W3-P0-001: `remember` controls session duration (short vs long-lived JWT).
  Future<NammerhaUser> login({
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
    final userData = data['user'] as Map<String, dynamic>;
    final token = data['token'] as String?;

    // Store JWT token securely
    if (token != null) {
      await _api.setToken(token);
    }

    return NammerhaUser.fromJson(userData);
  }

  /// POST /api/auth/social
  /// Universal social login — works for Google, Apple, Facebook.
  /// Backend verifies ID token server-side, creates/links user, returns JWT.
  /// W3-P2-009: `remember` controls session duration (consistent with email login).
  Future<NammerhaUser> loginWithSocial({
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
    final userData = data['user'] as Map<String, dynamic>;
    final token = data['token'] as String?;

    // Store JWT token securely
    if (token != null) {
      await _api.setToken(token);
    }

    return NammerhaUser.fromJson(userData);
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
    final response = await _api.request(
      '/auth/forgot-password',
      method: 'POST',
      body: {'email': email.toLowerCase().trim()},
    );
    // P0-AUD-001 FIX: ErrorKeys constant instead of hardcoded Arabic.
    return response.message ?? ErrorKeys.resetLinkSent;
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
    final response = await _api.request(
      '/auth/resend-verification',
      method: 'POST',
      body: {'email': email.toLowerCase().trim()},
    );
    // P0-AUD-001 FIX: ErrorKeys constant instead of hardcoded Arabic.
    return response.message ?? ErrorKeys.resendVerificationSent;
  }

  /// GET /api/auth/verify-email/:token
  /// MOB-DI FIX: Moved from direct NammerhaApiClient.instance usage in
  /// VerifyEmailBloc to repository layer for DI consistency and testability.
  Future<void> verifyEmail(String token) async {
    await _api.request(
      '/auth/verify-email/$token',
      method: 'GET',
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
}
