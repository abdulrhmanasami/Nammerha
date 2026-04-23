import '../../../core/network/api_client.dart';

/// User model matching backend auth response
class NammerhaUser {
  final String userId;
  final String email;
  final String fullName;
  final String role;
  final List<String> roles;
  final String activeRole;
  final bool isActive;
  final bool isEmailVerified;

  const NammerhaUser({
    required this.userId,
    required this.email,
    required this.fullName,
    required this.role,
    required this.roles,
    required this.activeRole,
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
      activeRole: json['activeRole'] as String? ?? json['role'] as String,
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
  /// Requires email verification before login
  Future<String> register({
    required String email,
    required String password,
    required String fullName,
    String role = 'donor',
    String? phone,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/auth/register',
      method: 'POST',
      body: {
        'email': email.toLowerCase().trim(),
        'password': password,
        'full_name': fullName.trim(),
        'role': role,
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

  /// POST /api/auth/logout
  Future<void> logout() async {
    try {
      await _api.request('/auth/logout', method: 'POST');
    } catch (_) {
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

  /// POST /api/roles/switch — Switch active role context
  Future<void> switchRole(String role) async {
    await _api.request(
      '/roles/switch',
      method: 'POST',
      body: {'role': role},
    );
  }

  /// GET /api/roles/my-roles — Get user's active roles
  Future<List<Map<String, dynamic>>> getMyRoles() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/roles/my-roles',
      fromData: (data) => data as Map<String, dynamic>,
    );
    if (response.success && response.data != null) {
      return (response.data!['roles'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ?? [];
    }
    return [];
  }

  /// Check if user is currently authenticated
  bool get isAuthenticated => _api.isAuthenticated;
}
