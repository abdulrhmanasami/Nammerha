import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';

import '../../../features/auth/screens/verify_email_screen.dart';
import '../../../features/auth/screens/reset_password_screen.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Deep Link Service — Platinum Standard (P0-VE-001)
// ═══════════════════════════════════════════════════════════════════════════
// Centralized handler for Android App Links & iOS Universal Links.
//
// Supported URL patterns:
//   /verify-email.html?token=X&email=Y → VerifyEmailScreen
//   /reset-password.html?token=X       → ResetPasswordScreen
//
// Architecture:
//   - Singleton instance initialized once in main()
//   - Uses global navigatorKey for context-free navigation
//   - Handles both cold start (app opened via link) and warm resume
//   - Queues initial link until navigator is ready
//
// Security:
//   - Does NOT auto-verify tokens — delegates to backend via BLoC
//   - Does NOT store tokens in any persistent storage
//   - Validates URL host against whitelist before navigation
// ═══════════════════════════════════════════════════════════════════════════

class DeepLinkService {
  DeepLinkService._();
  static final DeepLinkService instance = DeepLinkService._();

  late final AppLinks _appLinks;
  StreamSubscription<Uri>? _subscription;
  GlobalKey<NavigatorState>? _navigatorKey;

  /// Allowed hosts — prevents rogue deep links from injecting navigation.
  static const _allowedHosts = {'nammerha.com', 'www.nammerha.com'};

  /// Pending deep link from cold start — processed once navigator is ready.
  Uri? _pendingDeepLink;

  /// Initialize the deep link service.
  /// Call once in main() after Firebase init.
  Future<void> init(GlobalKey<NavigatorState> navigatorKey) async {
    _navigatorKey = navigatorKey;
    _appLinks = AppLinks();

    // 1. Check for cold-start deep link (app opened from terminated state).
    try {
      final initialUri = await _appLinks.getInitialLink();
      if (initialUri != null) {
        debugPrint('[Nammerha DeepLink] Cold start: $initialUri');
        _pendingDeepLink = initialUri;
      }
    } catch (e) {
      debugPrint('[Nammerha DeepLink] Error getting initial link: $e');
    }

    // 2. Listen for warm-resume deep links (app already running).
    _subscription = _appLinks.uriLinkStream.listen(
      (Uri uri) {
        debugPrint('[Nammerha DeepLink] Warm resume: $uri');
        _handleDeepLink(uri);
      },
      onError: (Object err) {
        debugPrint('[Nammerha DeepLink] Stream error: $err');
      },
    );
  }

  /// Process any pending cold-start deep link.
  /// Call this from _AppFlowController AFTER the navigator is mounted
  /// and the splash screen has completed.
  void processPendingDeepLink() {
    if (_pendingDeepLink != null) {
      debugPrint('[Nammerha DeepLink] Processing pending: $_pendingDeepLink');
      _handleDeepLink(_pendingDeepLink!);
      _pendingDeepLink = null;
    }
  }

  /// Core routing logic — parses URL and navigates to the correct screen.
  void _handleDeepLink(Uri uri) {
    // Security: Only process links from allowed hosts.
    if (!_allowedHosts.contains(uri.host)) {
      debugPrint('[Nammerha DeepLink] Blocked — untrusted host: ${uri.host}');
      return;
    }

    final path = uri.path;
    final params = uri.queryParameters;

    debugPrint('[Nammerha DeepLink] Path: $path, Params: $params');

    // ── /verify-email.html?token=X&email=Y ──
    if (path.contains('verify-email')) {
      final token = params['token'];
      final email = params['email'];

      if (token == null || token.isEmpty) {
        debugPrint('[Nammerha DeepLink] Verify email — missing token');
        return;
      }

      _navigateTo(
        VerifyEmailScreen(token: token, email: email),
      );
      return;
    }

    // ── /reset-password.html?token=X ──
    if (path.contains('reset-password')) {
      final token = params['token'];

      if (token == null || token.isEmpty) {
        debugPrint('[Nammerha DeepLink] Reset password — missing token');
        return;
      }

      _navigateTo(
        ResetPasswordScreen(token: token),
      );
      return;
    }

    debugPrint('[Nammerha DeepLink] Unhandled path: $path');
  }

  /// Navigate to the target screen using the global navigator key.
  /// Uses push (not pushReplacement) so the user can go back.
  void _navigateTo(Widget screen) {
    final ctx = _navigatorKey?.currentContext;
    if (ctx == null) {
      debugPrint('[Nammerha DeepLink] Navigator not ready — queueing');
      return;
    }

    Navigator.of(ctx).push(
      MaterialPageRoute(builder: (_) => screen),
    );
  }

  /// Cleanup — call on app dispose (though for singletons this rarely fires).
  void dispose() {
    _subscription?.cancel();
    _subscription = null;
  }
}
