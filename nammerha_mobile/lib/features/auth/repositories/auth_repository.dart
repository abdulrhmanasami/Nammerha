import 'package:flutter/foundation.dart';
import '../../../core/network/api_client.dart';

/// User model matching backend auth response
class NammerhaUser {
  final String userId;
  final String email;
  final String fullName;
  final String role;
  final List<String> roles;
  final bool isActive;
  final bool isEmailVerified;

  const NammerhaUser({
    required this.userId,
    required this.email,
    required this.fullName,
    required this.role,
    required this.roles,
    required this.isActive,
    required this.isEmailVerified,
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
    );
  }
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
    return response.message ?? 'تم إرسال رابط التحقق إلى بريدك الإلكتروني';
  }

  /// POST /api/auth/login
  /// Returns user + JWT token (MOB-AUTH-001: token in body for mobile)
  Future<NammerhaUser> login({
    required String email,
    required String password,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/auth/login',
      method: 'POST',
      body: {
        'email': email.toLowerCase().trim(),
        'password': password,
      },
      fromData: (data) => data as Map<String, dynamic>,
    );

    if (!response.success || response.data == null) {
      throw ApiException(response.error ?? 'فشل تسجيل الدخول');
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
  Future<NammerhaUser> loginWithSocial({
    required String provider, // 'google' | 'apple' | 'facebook'
    required String idToken,
    String? fullName, // Apple first-login only
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/auth/social',
      method: 'POST',
      body: {
        'provider': provider,
        'id_token': idToken,
        if (fullName != null) 'full_name': fullName,
      },
      fromData: (data) => data as Map<String, dynamic>,
    );

    if (!response.success || response.data == null) {
      throw ApiException(response.error ?? 'فشل تسجيل الدخول');
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
    return response.message ?? 'إذا كان البريد مسجلاً، ستتلقى رابط إعادة تعيين كلمة المرور';
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
    return response.message ?? 'تم تغيير كلمة المرور بنجاح';
  }

  /// POST /api/auth/resend-verification
  Future<String> resendVerification({required String email}) async {
    final response = await _api.request(
      '/auth/resend-verification',
      method: 'POST',
      body: {'email': email.toLowerCase().trim()},
    );
    return response.message ?? 'تم إعادة إرسال رابط التحقق';
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
    return response.message ?? 'تم تغيير كلمة المرور بنجاح';
  }

  // UNIFIED CITIZEN: switchRole() and getMyRoles() removed.
  // All users have all roles active — no switching needed.

  /// Check if user is currently authenticated
  bool get isAuthenticated => _api.isAuthenticated;
}
