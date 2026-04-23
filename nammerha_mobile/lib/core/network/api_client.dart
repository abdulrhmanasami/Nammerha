import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:http/http.dart' as http;

import '../config/app_config.dart';

// ─── API Response Model ─────────────────────────────────────────────────────

class ApiResponse<T> {
  final bool success;
  final T? data;
  final String? error;
  final String? message;

  const ApiResponse({
    required this.success,
    this.data,
    this.error,
    this.message,
  });

  factory ApiResponse.fromJson(
    Map<String, dynamic> json, {
    T Function(dynamic)? fromData,
  }) {
    return ApiResponse(
      success: json['success'] as bool? ?? false,
      data: fromData != null && json['data'] != null
          ? fromData(json['data'])
          : json['data'] as T?,
      error: json['error'] as String?,
      message: json['message'] as String?,
    );
  }
}

// ─── API Client Errors ──────────────────────────────────────────────────────

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  final String? action; // 'force_upgrade', etc.

  const ApiException(this.message, {this.statusCode, this.action});

  @override
  String toString() => 'ApiException($statusCode): $message';

  /// True if the user needs to re-authenticate
  bool get isUnauthorized => statusCode == 401;

  /// True if the app version is too old
  bool get requiresUpgrade => statusCode == 426 || action == 'force_upgrade';
}

// ─── Production API Client ──────────────────────────────────────────────────
/// Mirrors the web platform's api.ts — includes:
/// - Bearer token auth (stored in flutter_secure_storage)
/// - Mobile telemetry headers (X-Platform, X-App-Version, X-API-Version)
/// - 30s timeout + exponential backoff for idempotent requests
/// - Idempotency-Key for financial mutations
/// - Skeleton anti-flicker (300ms minimum transition)

class NammerhaApiClient {
  static NammerhaApiClient? _instance;
  static NammerhaApiClient get instance {
    _instance ??= NammerhaApiClient._();
    return _instance!;
  }

  NammerhaApiClient._();

  final FlutterSecureStorage _secureStorage = const FlutterSecureStorage();
  final http.Client _httpClient = http.Client();

  String? _deviceId;
  String? _deviceModel;
  String? _osVersion;

  // JWT token cache (loaded from secure storage on init)
  String? _cachedToken;

  /// Callback for auth state changes (e.g., 401 → redirect to login)
  void Function()? onAuthExpired;

  // ─── Initialization ───────────────────────────────────────────────────

  Future<void> init() async {
    // Load cached token
    _cachedToken = await _secureStorage.read(key: 'jwt_token');

    // Gather device info for telemetry headers
    try {
      final deviceInfo = DeviceInfoPlugin();
      if (Platform.isAndroid) {
        final android = await deviceInfo.androidInfo;
        _deviceId = android.id;
        _deviceModel = '${android.manufacturer} ${android.model}';
        _osVersion = 'Android ${android.version.release}';
      } else if (Platform.isIOS) {
        final ios = await deviceInfo.iosInfo;
        _deviceId = ios.identifierForVendor;
        _deviceModel = ios.utsname.machine;
        _osVersion = 'iOS ${ios.systemVersion}';
      }
    } catch (_) {
      // Non-fatal: telemetry is optional
    }
  }

  // ─── Token Management ─────────────────────────────────────────────────

  Future<void> setToken(String token) async {
    _cachedToken = token;
    await _secureStorage.write(key: 'jwt_token', value: token);
  }

  Future<void> clearToken() async {
    _cachedToken = null;
    await _secureStorage.delete(key: 'jwt_token');
  }

  String? get currentToken => _cachedToken;
  bool get isAuthenticated => _cachedToken != null;

  // ─── Core Request Method ──────────────────────────────────────────────

  Future<ApiResponse<T>> request<T>(
    String endpoint, {
    String method = 'GET',
    Map<String, dynamic>? body,
    T Function(dynamic)? fromData,
    bool idempotent = false,
    Map<String, String>? extraHeaders,
  }) async {
    final uri = Uri.parse('${AppConfig.apiBaseUrl}$endpoint');
    final startTime = DateTime.now();

    // Build headers
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Language': 'ar',
      // Mobile telemetry headers (required by mobile-guard.middleware.ts)
      'X-Platform': Platform.isIOS ? 'ios' : 'android',
      'X-App-Version': AppConfig.appVersion,
      'X-API-Version': AppConfig.apiVersion,
      if (_deviceModel != null) 'X-Device-Model': _deviceModel!,
      if (_osVersion != null) 'X-OS-Version': _osVersion!,
      if (_deviceId != null) 'X-Device-Id': _deviceId!,
      // JWT Bearer token
      if (_cachedToken != null) 'Authorization': 'Bearer $_cachedToken',
      // Idempotency for financial mutations
      if (idempotent) 'Idempotency-Key': _generateUUID(),
      // Extra headers
      ...?extraHeaders,
    };

    // Retry logic (only for idempotent requests)
    final maxRetries = (idempotent || method == 'GET') ? AppConfig.maxRetries : 0;
    Object? lastError;

    for (int attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        final response = await _executeRequest(uri, method, headers, body)
            .timeout(AppConfig.requestTimeout);

        // Retryable server errors (502/503/504)
        if (!_isSuccess(response.statusCode) &&
            attempt < maxRetries &&
            [502, 503, 504].contains(response.statusCode)) {
          await _exponentialBackoff(attempt);
          continue;
        }

        // Parse response
        final responseBody = jsonDecode(response.body) as Map<String, dynamic>;

        // Handle errors
        if (!_isSuccess(response.statusCode)) {
          final action = responseBody['action'] as String?;

          // 401 → Token expired
          if (response.statusCode == 401) {
            await clearToken();
            onAuthExpired?.call();
          }

          throw ApiException(
            responseBody['error'] as String? ?? 'Request failed: ${response.statusCode}',
            statusCode: response.statusCode,
            action: action,
          );
        }

        // Skeleton anti-flicker (minimum 300ms transition)
        final elapsed = DateTime.now().difference(startTime);
        if (elapsed < AppConfig.minTransitionDuration) {
          await Future.delayed(AppConfig.minTransitionDuration - elapsed);
        }

        return ApiResponse.fromJson(responseBody, fromData: fromData);
      } on SocketException catch (e) {
        lastError = e;
        if (attempt < maxRetries) {
          await _exponentialBackoff(attempt);
          continue;
        }
        throw const ApiException('لا يوجد اتصال بالإنترنت. تحقق من الشبكة وحاول مرة أخرى.');
      } on TimeoutException {
        lastError = TimeoutException('Timeout');
        if (attempt < maxRetries) {
          await _exponentialBackoff(attempt);
          continue;
        }
        throw const ApiException('انتهت مهلة الاتصال — تحقق من اتصالك بالإنترنت وحاول مرة أخرى.');
      } on ApiException {
        rethrow;
      } catch (e) {
        lastError = e;
        if (attempt < maxRetries) {
          await _exponentialBackoff(attempt);
          continue;
        }
        throw ApiException('خطأ في الشبكة: ${e.toString()}');
      }
    }

    throw ApiException('خطأ في الشبكة: ${lastError?.toString() ?? 'unknown'}');
  }

  // ─── HTTP Method Execution ────────────────────────────────────────────

  Future<http.Response> _executeRequest(
    Uri uri,
    String method,
    Map<String, String> headers,
    Map<String, dynamic>? body,
  ) async {
    final encodedBody = body != null ? jsonEncode(body) : null;

    switch (method.toUpperCase()) {
      case 'GET':
        return _httpClient.get(uri, headers: headers);
      case 'POST':
        return _httpClient.post(uri, headers: headers, body: encodedBody);
      case 'PUT':
        return _httpClient.put(uri, headers: headers, body: encodedBody);
      case 'PATCH':
        return _httpClient.patch(uri, headers: headers, body: encodedBody);
      case 'DELETE':
        return _httpClient.delete(uri, headers: headers);
      default:
        throw ApiException('Unsupported HTTP method: $method');
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  bool _isSuccess(int statusCode) => statusCode >= 200 && statusCode < 300;

  Future<void> _exponentialBackoff(int attempt) async {
    final delay = Duration(milliseconds: 1000 * pow(2, attempt).toInt());
    await Future.delayed(delay);
  }

  String _generateUUID() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
        '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
  }

  // ─── GraphQL Transport (C-2 Remediation) ─────────────────────────────
  // Hybrid Transport Layer: GraphQL for financial mutations, aggregated
  // queries, and subscriptions. Reuses JWT auth, telemetry headers, retry
  // logic, and skeleton anti-flicker from the REST transport.
  //
  // Usage:
  //   final result = await _api.graphql<Map<String, dynamic>>(
  //     query: EscrowMutations.createDonation,
  //     variables: {'input': {...}},
  //     operationName: 'CreateDonation',
  //     idempotent: true,
  //   );
  //   final checkoutUrl = result['createDonation']['checkoutUrl'];

  /// Execute a GraphQL query or mutation against the backend.
  ///
  /// Returns the `data` field from the GraphQL response.
  /// Throws [ApiException] if the response contains `errors`.
  /// Throws [GraphQLException] for GraphQL-specific error details.
  Future<Map<String, dynamic>> graphql({
    required String query,
    Map<String, dynamic>? variables,
    String? operationName,
    bool idempotent = false,
  }) async {
    final uri = Uri.parse(AppConfig.graphqlEndpoint);
    final startTime = DateTime.now();

    // Build headers (same JWT + telemetry as REST)
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Language': 'ar',
      'X-Platform': Platform.isIOS ? 'ios' : 'android',
      'X-App-Version': AppConfig.appVersion,
      'X-API-Version': AppConfig.apiVersion,
      if (_deviceModel != null) 'X-Device-Model': _deviceModel!,
      if (_osVersion != null) 'X-OS-Version': _osVersion!,
      if (_deviceId != null) 'X-Device-Id': _deviceId!,
      if (_cachedToken != null) 'Authorization': 'Bearer $_cachedToken',
      if (idempotent) 'Idempotency-Key': _generateUUID(),
    };

    // Build GraphQL request body
    final body = <String, dynamic>{
      'query': query,
      if (variables != null) 'variables': variables,
      if (operationName != null) 'operationName': operationName,
    };

    // Retry logic (same as REST)
    final maxRetries = idempotent ? AppConfig.maxRetries : 0;
    Object? lastError;

    for (int attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        final response = await _httpClient
            .post(uri, headers: headers, body: jsonEncode(body))
            .timeout(AppConfig.requestTimeout);

        // Retryable server errors (502/503/504)
        if (!_isSuccess(response.statusCode) &&
            attempt < maxRetries &&
            [502, 503, 504].contains(response.statusCode)) {
          await _exponentialBackoff(attempt);
          continue;
        }

        // 401 → Token expired
        if (response.statusCode == 401) {
          await clearToken();
          onAuthExpired?.call();
          throw const ApiException(
            'انتهت صلاحية الجلسة — يُرجى تسجيل الدخول مرة أخرى.',
            statusCode: 401,
          );
        }

        // Parse GraphQL response
        final responseBody =
            jsonDecode(response.body) as Map<String, dynamic>;

        // Extract GraphQL errors
        final errors = responseBody['errors'] as List<dynamic>?;
        if (errors != null && errors.isNotEmpty) {
          final firstError = errors[0] as Map<String, dynamic>;
          final message = firstError['message'] as String? ?? 'GraphQL error';
          final extensions =
              firstError['extensions'] as Map<String, dynamic>?;
          final code = extensions?['code'] as String?;

          // Map GraphQL error codes to ApiException
          int? statusCode;
          if (code == 'UNAUTHENTICATED') {
            statusCode = 401;
            await clearToken();
            onAuthExpired?.call();
          } else if (code == 'FORBIDDEN') {
            statusCode = 403;
          } else if (code == 'BAD_USER_INPUT' ||
              code == 'VALIDATION_ERROR') {
            statusCode = 400;
          }

          throw GraphQLException(
            message,
            statusCode: statusCode,
            code: code,
            errors: errors
                .cast<Map<String, dynamic>>()
                .map((e) => GraphQLError.fromJson(e))
                .toList(),
          );
        }

        // Extract data field
        final data = responseBody['data'] as Map<String, dynamic>?;
        if (data == null) {
          throw const ApiException(
            'استجابة GraphQL فارغة — لم يتم إرجاع بيانات.',
          );
        }

        // Skeleton anti-flicker (minimum 300ms transition)
        final elapsed = DateTime.now().difference(startTime);
        if (elapsed < AppConfig.minTransitionDuration) {
          await Future.delayed(AppConfig.minTransitionDuration - elapsed);
        }

        return data;
      } on SocketException catch (e) {
        lastError = e;
        if (attempt < maxRetries) {
          await _exponentialBackoff(attempt);
          continue;
        }
        throw const ApiException(
          'لا يوجد اتصال بالإنترنت. تحقق من الشبكة وحاول مرة أخرى.',
        );
      } on TimeoutException {
        lastError = TimeoutException('Timeout');
        if (attempt < maxRetries) {
          await _exponentialBackoff(attempt);
          continue;
        }
        throw const ApiException(
          'انتهت مهلة الاتصال — تحقق من اتصالك بالإنترنت وحاول مرة أخرى.',
        );
      } on ApiException {
        // Covers both ApiException and its subtype GraphQLException
        rethrow;
      } catch (e) {
        lastError = e;
        if (attempt < maxRetries) {
          await _exponentialBackoff(attempt);
          continue;
        }
        throw ApiException('خطأ في الشبكة: ${e.toString()}');
      }
    }

    throw ApiException(
      'خطأ في الشبكة: ${lastError?.toString() ?? 'unknown'}',
    );
  }

  /// Dispose HTTP client
  void dispose() {
    _httpClient.close();
  }
}

// ─── GraphQL Error Types (C-2 Remediation) ──────────────────────────────
// Structured error types for GraphQL responses. Extends ApiException
// with GraphQL-specific fields (error code, path, extensions).

/// A single GraphQL error from the `errors[]` array.
class GraphQLError {
  final String message;
  final String? code;
  final List<dynamic>? path;
  final Map<String, dynamic>? extensions;

  const GraphQLError({
    required this.message,
    this.code,
    this.path,
    this.extensions,
  });

  factory GraphQLError.fromJson(Map<String, dynamic> json) {
    final extensions = json['extensions'] as Map<String, dynamic>?;
    return GraphQLError(
      message: json['message'] as String? ?? 'Unknown GraphQL error',
      code: extensions?['code'] as String?,
      path: json['path'] as List<dynamic>?,
      extensions: extensions,
    );
  }

  @override
  String toString() => 'GraphQLError($code): $message';
}

/// Exception containing one or more GraphQL errors.
class GraphQLException extends ApiException {
  final String? code;
  final List<GraphQLError> errors;

  const GraphQLException(
    super.message, {
    super.statusCode,
    this.code,
    this.errors = const [],
  });

  @override
  String toString() =>
      'GraphQLException($code, $statusCode): $message [${errors.length} errors]';

  /// True if any error is a validation/input error
  bool get isValidationError =>
      code == 'BAD_USER_INPUT' || code == 'VALIDATION_ERROR';

  /// Get all error messages joined
  String get allMessages => errors.map((e) => e.message).join('; ');
}
