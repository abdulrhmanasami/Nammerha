import 'package:flutter/services.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Nammerha — Haptic Feedback Service (P3-002 Platinum Polish)
// ═══════════════════════════════════════════════════════════════════════════
// Centralized haptic feedback utility for consistent tactile UX.
// Follows Apple HIG and Material Design haptic conventions:
//   • light   — Tab switches, filter chips, toggles
//   • medium  — Form submissions, card taps, state changes
//   • heavy   — Destructive actions, payment confirmations
//   • select  — Selection changes (radio, checkbox, dropdown)
//   • success — Completion feedback (task done, upload success)
// ═══════════════════════════════════════════════════════════════════════════

abstract final class Haptics {
  /// Tab bar switches, chip selections, minor UI interactions.
  static void light() => HapticFeedback.lightImpact();

  /// Form submissions, card taps, navigation actions.
  static void medium() => HapticFeedback.mediumImpact();

  /// Destructive or high-stakes actions (delete, payment, logout).
  static void heavy() => HapticFeedback.heavyImpact();

  /// Selection state changes (radio, checkbox, dropdown, filter).
  static void select() => HapticFeedback.selectionClick();

  /// Success confirmation — double pulse for tactile "done" feeling.
  static Future<void> success() async {
    HapticFeedback.mediumImpact();
    await Future.delayed(const Duration(milliseconds: 100));
    HapticFeedback.lightImpact();
  }

  /// Error feedback — short heavy pulse.
  static void error() => HapticFeedback.heavyImpact();
}
