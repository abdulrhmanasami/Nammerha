import 'package:flutter/widgets.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// AUD-022 FIX: Global Animation Budget Controller
/// ═══════════════════════════════════════════════════════════════════════════
/// On resource-constrained 2G devices common in Syria, staggered
/// flutter_animate fadeIn/slideY animations create cumulative overhead
/// (20 notification cards × animation controllers = 20 concurrent timers).
///
/// This utility provides a global flag that screens can check to
/// conditionally skip `.animate()` calls. The flag is driven by:
///   1. Platform accessibility: `MediaQuery.disableAnimations`
///   2. Manual user preference (future: stored in SharedPreferences)
///
/// Usage:
///   if (AnimationBudget.shouldAnimate(context)) {
///     return widget.animate().fadeIn();
///   }
///   return widget;
///
/// Extension method (preferred):
///   widget.animateIf(context).fadeIn()  // auto-skips if reduced
/// ═══════════════════════════════════════════════════════════════════════════
class AnimationBudget {
  AnimationBudget._();

  /// Manual override: set to true to globally disable all micro-animations.
  /// Future: wire to SharedPreferences "reduce_animations" key.
  static final ValueNotifier<bool> reduceAnimations = ValueNotifier<bool>(false);

  /// Returns true if animations should play.
  ///
  /// Checks:
  /// 1. Manual override via [reduceAnimations]
  /// 2. Platform accessibility setting (disableAnimations / reduceMotion)
  static bool shouldAnimate(BuildContext context) {
    if (reduceAnimations.value) return false;

    // Respect platform accessibility: iOS "Reduce Motion" / Android "Remove animations"
    final mediaQuery = MediaQuery.maybeOf(context);
    if (mediaQuery != null && mediaQuery.disableAnimations) return false;

    return true;
  }
}
