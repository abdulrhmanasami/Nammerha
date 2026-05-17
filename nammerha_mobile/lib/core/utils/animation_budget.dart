import 'package:flutter/widgets.dart';
import 'package:flutter_animate/flutter_animate.dart';

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
/// Usage (preferred — extension method):
///   widget.nmAnimate(context).fadeIn().slideY()
///   // Automatically skips if reduced — renders final state instantly.
///
/// Usage (legacy — manual check):
///   if (AnimationBudget.shouldAnimate(context)) {
///     return widget.animate().fadeIn();
///   }
///   return widget;
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

/// ═══════════════════════════════════════════════════════════════════════════
/// P2-002 FIX: Budget-Aware Animation Extension
/// ═══════════════════════════════════════════════════════════════════════════
/// Drop-in replacement for `.animate()`. When the animation budget is
/// exhausted (reduced motion, manual override), uses `ValueAdapter(value: 1.0)`
/// to render ALL chained effects in their final state instantly — no animation
/// controllers, no tickers, no battery drain.
///
///   // BEFORE (unconditional — drains battery on 2G):
///   card.animate(delay: (i * 80).ms).fadeIn().slideY(begin: 0.05)
///
///   // AFTER (budget-aware):
///   card.nmAnimate(context, delay: (i * 80).ms).fadeIn().slideY(begin: 0.05)
///
/// How it works:
///   - Animations enabled → standard `.animate(delay: delay)` pipeline
///   - Animations disabled → `ValueAdapter(value: 1.0)` locks every effect
///     tween at t=1.0, rendering the final visual state with zero overhead.
/// ═══════════════════════════════════════════════════════════════════════════
extension NammerhaAnimateExtension on Widget {
  Animate nmAnimate(BuildContext context, {Duration? delay}) {
    if (!AnimationBudget.shouldAnimate(context)) {
      // Lock all effects at their end state (t=1.0).
      // ValueAdapter creates NO animation controller — zero overhead.
      return animate(adapter: ValueAdapter(1.0));
    }
    return animate(delay: delay);
  }
}
