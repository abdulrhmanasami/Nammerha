import 'package:flutter/material.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../theme/semantic_colors.dart';
import '../i18n/t.dart';
import '../i18n/error_keys.dart';
import '../utils/animation_budget.dart';

// ═══════════════════════════════════════════════════════════════════════════
// NammerhaErrorState — Platinum Standard (P1-005 Diagnostic Enhancement)
// ═══════════════════════════════════════════════════════════════════════════
// P1-005 UPGRADE: Diagnostic error classification.
//
// PREVIOUS (P2-001):
//   All 19 callsites showed identical cloudSlash icon + raw error message.
//   Network timeout, server 500, auth 401, 404 — all looked the same.
//   Violates Nielsen #9 (Help users recognize, diagnose, recover).
//
// NOW:
//   5 error categories with contextual visual cues:
//   • network  → wifiSlash + "Check your connection" hint
//   • server   → cloudWarning + "Server issue" hint
//   • auth     → lockSimple + "Session expired" hint
//   • notFound → magnifyingGlass + "Not found" hint
//   • generic  → cloudSlash (backward compatible default)
//
// BACKWARD COMPATIBLE: All 19 existing callsites work unchanged.
// The new `category` param is optional (defaults to `generic`).
// For enhanced diagnostics, callers can use `NammerhaErrorState.fromKey()`.
//
// Standards:
//   • Nielsen #1 (Visibility of system status)
//   • Nielsen #9 (Help users recognize, diagnose, and recover from errors)
//   • WCAG AAA (contrast, meaningful icons, screen reader labels)
// ═══════════════════════════════════════════════════════════════════════════

/// Error categories for diagnostic visual differentiation.
enum ErrorCategory {
  /// No internet / connectivity issue.
  network,

  /// Server-side error (500, 502, 503, 504).
  server,

  /// Authentication expired or unauthorized.
  auth,

  /// Resource not found (404).
  notFound,

  /// Generic / unclassified error.
  generic,
}

class NammerhaErrorState extends StatelessWidget {
  /// The error message to display (should be pre-translated by the caller).
  final String message;

  /// Callback when the retry button is tapped.
  final VoidCallback onRetry;

  /// Override icon. If null, determined by [category].
  final IconData? icon;

  /// Override icon size. Default: 64.
  final double iconSize;

  /// Override retry button label i18n key. Default: 'retry'.
  final String? retryLabelKey;

  /// P1-005: Error category for diagnostic visual differentiation.
  /// Determines the icon, hint text, and accent color when [icon] is not set.
  final ErrorCategory category;

  const NammerhaErrorState({
    super.key,
    required this.message,
    required this.onRetry,
    this.icon,
    this.iconSize = 64,
    this.retryLabelKey,
    this.category = ErrorCategory.generic,
  });

  /// P1-005: Factory constructor that auto-classifies errors by their error key.
  /// Maps ErrorKeys constants to the appropriate ErrorCategory.
  ///
  /// Usage:
  /// ```dart
  /// NammerhaErrorState.fromKey(
  ///   errorKey: state.message,
  ///   onRetry: () => context.read<SomeBloc>().add(RetryEvent()),
  /// )
  /// ```
  factory NammerhaErrorState.fromKey({
    Key? key,
    required String errorKey,
    required VoidCallback onRetry,
    double iconSize = 64,
    String? retryLabelKey,
  }) {
    return NammerhaErrorState(
      key: key,
      message: errorKey,
      onRetry: onRetry,
      iconSize: iconSize,
      retryLabelKey: retryLabelKey,
      category: _classifyErrorKey(errorKey),
    );
  }

  /// Maps error keys to visual categories.
  static ErrorCategory _classifyErrorKey(String errorKey) {
    // Network errors
    if (errorKey == ErrorKeys.network ||
        errorKey == ErrorKeys.checkoutNetwork) {
      return ErrorCategory.network;
    }

    // Server errors
    if (errorKey == ErrorKeys.serverError) {
      return ErrorCategory.server;
    }

    // Auth errors
    if (errorKey == ErrorKeys.authRequired ||
        errorKey == ErrorKeys.sessionExpired ||
        errorKey == ErrorKeys.tokenInvalidated ||
        errorKey == ErrorKeys.invalidToken ||
        errorKey == ErrorKeys.unauthorized) {
      return ErrorCategory.auth;
    }

    // Not found
    if (errorKey == ErrorKeys.notFound) {
      return ErrorCategory.notFound;
    }

    return ErrorCategory.generic;
  }

  /// Returns the appropriate icon for the error category.
  IconData _resolvedIcon() {
    if (icon != null) return icon!;
    switch (category) {
      case ErrorCategory.network:
        return PhosphorIconsRegular.wifiSlash;
      case ErrorCategory.server:
        return PhosphorIconsRegular.cloudWarning;
      case ErrorCategory.auth:
        return PhosphorIconsRegular.lockSimple;
      case ErrorCategory.notFound:
        return PhosphorIconsRegular.magnifyingGlass;
      case ErrorCategory.generic:
        return PhosphorIconsRegular.cloudSlash;
    }
  }

  /// Returns the diagnostic hint i18n key for the error category.
  String? _hintKey() {
    switch (category) {
      case ErrorCategory.network:
        return 'err_hint_network';
      case ErrorCategory.server:
        return 'err_hint_server';
      case ErrorCategory.auth:
        return 'err_hint_auth';
      case ErrorCategory.notFound:
        return 'err_hint_not_found';
      case ErrorCategory.generic:
        return null; // No hint for generic errors
    }
  }

  /// Returns the accent color for the error category.
  Color _accentColor(SemanticColors colors) {
    switch (category) {
      case ErrorCategory.network:
        return colors.warning;
      case ErrorCategory.server:
        return colors.error;
      case ErrorCategory.auth:
        return colors.secondaryAccent;
      case ErrorCategory.notFound:
        return colors.textSecondary;
      case ErrorCategory.generic:
        return colors.error;
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final resolvedIcon = _resolvedIcon();
    final hintKey = _hintKey();
    final accent = _accentColor(colors);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // P1-005: Icon with subtle circular background for visual weight
            Container(
              width: iconSize + 32,
              height: iconSize + 32,
              decoration: BoxDecoration(
                color: accent.withAlpha(12),
                shape: BoxShape.circle,
              ),
              child: Icon(resolvedIcon, size: iconSize, color: accent),
            ).nmAnimate(context).fadeIn(duration: 400.ms).scale(
                  begin: const Offset(0.85, 0.85),
                  end: const Offset(1.0, 1.0),
                  duration: 500.ms,
                ),
            const SizedBox(height: 16),

            // Error message
            Text(
              // Try translation — if the message IS a key, translate it.
              // If it's raw text (backward compat), show as-is.
              context.tr(message),
              style: TextStyle(
                color: colors.textPrimary,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.center,
            ).nmAnimate(context, delay: 100.ms).fadeIn(),

            // P1-005: Diagnostic hint — contextual recovery guidance
            if (hintKey != null) ...[
              const SizedBox(height: 8),
              Text(
                context.tr(hintKey),
                style: TextStyle(
                  color: colors.textSubtle,
                  fontSize: 13,
                  height: 1.5,
                ),
                textAlign: TextAlign.center,
              ).nmAnimate(context, delay: 200.ms).fadeIn(),
            ],

            const SizedBox(height: 24),

            // Retry button
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(PhosphorIconsRegular.arrowsClockwise, size: 18),
              label: Text(context.tr(retryLabelKey ?? 'retry')),
              style: ElevatedButton.styleFrom(
                backgroundColor: colors.primaryBrand,
                foregroundColor: Colors.white,
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ).nmAnimate(context, delay: 300.ms).fadeIn().slideY(begin: 0.1),
          ],
        ),
      ),
    );
  }
}
