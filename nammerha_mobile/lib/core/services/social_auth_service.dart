import 'dart:io';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import '../config/app_config.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Social Auth Service — Native SDK Wrapper
// ═══════════════════════════════════════════════════════════════════════════
// Encapsulates Google Sign-In, Apple Sign-In, and Facebook Login SDKs.
// Returns provider-agnostic SocialAuthResult that the AuthBloc/Repository
// can forward to POST /api/auth/social.
//
// Architecture:
//   - Google: google_sign_in → ID token from GoogleSignInAuthentication
//   - Apple: sign_in_with_apple → identityToken from AuthorizationCredential
//   - Facebook: Stub — requires Facebook App registration + review
// ═══════════════════════════════════════════════════════════════════════════

/// Result of a native social sign-in attempt.
class SocialAuthResult {
  final String provider; // 'google' | 'apple' | 'facebook'
  final String idToken;
  final String? fullName; // Apple first-login only

  const SocialAuthResult({
    required this.provider,
    required this.idToken,
    this.fullName,
  });
}

/// Social auth cancelled by user (not an error — do not show error message).
class SocialAuthCancelledException implements Exception {
  final String provider;
  const SocialAuthCancelledException(this.provider);

  @override
  String toString() => 'User cancelled $provider sign-in';
}

/// Social auth not available on this platform/device.
class SocialAuthNotAvailableException implements Exception {
  final String provider;
  final String reason;
  const SocialAuthNotAvailableException(this.provider, this.reason);

  @override
  String toString() => '$provider sign-in not available: $reason';
}

class SocialAuthService {
  SocialAuthService._();
  static final SocialAuthService instance = SocialAuthService._();

  // ─── Google Sign-In ────────────────────────────────────────────────────

  // Lazy-initialized Google Sign-In instance.
  // Uses the client ID from AppConfig which reads from environment.
  GoogleSignIn? _googleSignIn;

  GoogleSignIn get _google {
    _googleSignIn ??= GoogleSignIn(
      // On iOS, the client ID is read from GoogleService-Info.plist automatically.
      // On Android, it's read from google-services.json automatically.
      // The serverClientId is the WEB client ID used to request an ID token
      // that the backend can verify.
      serverClientId: AppConfig.googleServerClientId,
      scopes: ['email', 'profile'],
    );
    return _googleSignIn!;
  }

  /// Trigger native Google Sign-In flow.
  /// Returns [SocialAuthResult] with the ID token.
  /// Throws [SocialAuthCancelledException] if user cancels.
  Future<SocialAuthResult> signInWithGoogle() async {
    try {
      // Sign out first to force account chooser (avoid stale sessions)
      await _google.signOut();

      final account = await _google.signIn();
      if (account == null) {
        throw const SocialAuthCancelledException('google');
      }

      final auth = await account.authentication;
      final idToken = auth.idToken;

      if (idToken == null || idToken.isEmpty) {
        throw SocialAuthNotAvailableException(
          'google',
          'No ID token returned. Verify serverClientId is configured.',
        );
      }

      return SocialAuthResult(
        provider: 'google',
        idToken: idToken,
        fullName: account.displayName,
      );
    } on SocialAuthCancelledException {
      rethrow;
    } catch (e) {
      if (e.toString().contains('sign_in_canceled') ||
          e.toString().contains('CANCELED') ||
          e.toString().contains('canceled')) {
        throw const SocialAuthCancelledException('google');
      }
      throw SocialAuthNotAvailableException(
        'google',
        e.toString(),
      );
    }
  }

  // ─── Apple Sign-In ─────────────────────────────────────────────────────

  /// Trigger native Apple Sign-In flow (iOS 13+ / macOS).
  /// Returns [SocialAuthResult] with the identity token.
  /// Throws [SocialAuthCancelledException] if user cancels.
  /// Throws [SocialAuthNotAvailableException] on Android.
  Future<SocialAuthResult> signInWithApple() async {
    if (!Platform.isIOS && !Platform.isMacOS) {
      throw const SocialAuthNotAvailableException(
        'apple',
        'Apple Sign In is only available on iOS and macOS.',
      );
    }

    try {
      final credential = await SignInWithApple.getAppleIDCredential(
        scopes: [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
      );

      final identityToken = credential.identityToken;
      if (identityToken == null || identityToken.isEmpty) {
        throw const SocialAuthNotAvailableException(
          'apple',
          'No identity token returned from Apple.',
        );
      }

      // Apple sends the user's name ONLY on first authorization.
      // On subsequent sign-ins, givenName and familyName are null.
      String? fullName;
      if (credential.givenName != null || credential.familyName != null) {
        fullName = [credential.givenName, credential.familyName]
            .where((n) => n != null && n.isNotEmpty)
            .join(' ');
        if (fullName.isEmpty) fullName = null;
      }

      return SocialAuthResult(
        provider: 'apple',
        idToken: identityToken,
        fullName: fullName,
      );
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) {
        throw const SocialAuthCancelledException('apple');
      }
      throw SocialAuthNotAvailableException('apple', e.message);
    } catch (e) {
      if (e is SocialAuthCancelledException || e is SocialAuthNotAvailableException) {
        rethrow;
      }
      throw SocialAuthNotAvailableException('apple', e.toString());
    }
  }

  // ─── Facebook Login ────────────────────────────────────────────────────

  /// Facebook Login is not yet integrated — requires Facebook App
  /// registration, privacy policy URL, and Meta review process.
  Future<SocialAuthResult> signInWithFacebook() async {
    throw const SocialAuthNotAvailableException(
      'facebook',
      'Facebook Login is coming soon. Please use Google or Apple sign-in.',
    );
  }

  // ─── Unified Entry Point ───────────────────────────────────────────────

  /// Sign in with the specified provider.
  /// Returns [SocialAuthResult] on success.
  /// Throws [SocialAuthCancelledException] if user cancels (silent — no error).
  /// Throws [SocialAuthNotAvailableException] if not configured/available.
  Future<SocialAuthResult> signIn(String provider) async {
    switch (provider) {
      case 'google':
        return signInWithGoogle();
      case 'apple':
        return signInWithApple();
      case 'facebook':
        return signInWithFacebook();
      default:
        throw SocialAuthNotAvailableException(provider, 'Unknown provider');
    }
  }
}
