import 'package:flutter/material.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

import '../theme/semantic_colors.dart';
import '../i18n/t.dart';

// ═══════════════════════════════════════════════════════════════════════════
// NammerhaErrorState — Platinum Standard (P2-001 Design Unification)
// ═══════════════════════════════════════════════════════════════════════════
// Standardized error screen for all modules. Replaces 14+ inconsistent
// inline error blocks with a single, brand-consistent widget.
//
// Usage:
//   NammerhaErrorState(
//     message: context.tr(state.message),
//     onRetry: () => context.read<SomeBloc>().add(RetryEvent()),
//   )
//
// Design Spec:
//   • Icon:     cloudSlash, 64px, textSecondary
//   • Text:     16px, error color, center-aligned
//   • Button:   primaryBrand + white foreground, rounded (12px)
//   • Spacing:  16 (icon→text), 20 (text→button)
//   • Padding:  24px all sides
// ═══════════════════════════════════════════════════════════════════════════

class NammerhaErrorState extends StatelessWidget {
  /// The error message to display (should be pre-translated by the caller).
  final String message;

  /// Callback when the retry button is tapped.
  final VoidCallback onRetry;

  /// Override icon. Default: [PhosphorIconsRegular.cloudSlash].
  final IconData icon;

  /// Override icon size. Default: 64.
  final double iconSize;

  /// Override retry button label i18n key. Default: 'retry'.
  final String? retryLabelKey;

  const NammerhaErrorState({
    super.key,
    required this.message,
    required this.onRetry,
    this.icon = PhosphorIconsRegular.cloudSlash,
    this.iconSize = 64,
    this.retryLabelKey,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: iconSize, color: colors.textSecondary),
            const SizedBox(height: 16),
            Text(
              message,
              style: TextStyle(color: colors.error, fontSize: 16),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(PhosphorIconsRegular.arrowsClockwise),
              label: Text(context.tr(retryLabelKey ?? 'retry')),
              style: ElevatedButton.styleFrom(
                backgroundColor: colors.primaryBrand,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
