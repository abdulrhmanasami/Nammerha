// ============================================================================
// Nammerha — Accessibility Semantics Helpers (GAP-M4 PLATINUM)
// ============================================================================
// Provides semantic wrappers for screen readers (TalkBack/VoiceOver).
//
// Flutter renders to a custom canvas — screen readers can't infer meaning
// from raw pixels. We MUST explicitly declare semantics:
//   - Buttons: what they do
//   - Images: what they show
//   - Cards: what they represent
//   - Live regions: dynamic content changes
//
// These helpers make semantic annotation easy across 237 Dart files:
//   NmSemanticButton(label: 'تقديم عرض', child: ...)
//   NmSemanticImage(label: 'صورة مشروع إعادة إعمار', child: ...)
//   NmSemanticCard(label: 'مشروع حلب - 65% مكتمل', child: ...)
//
// Standard: WCAG 2.1 AA (Perceivable, Operable)
//           Apple HIG (Accessibility — VoiceOver)
//           Material 3 (Accessibility — TalkBack)
// ============================================================================

import 'package:flutter/material.dart';
import '../services/crashlytics_service.dart';
import '../services/performance_service.dart';

// Re-export services for convenience when importing this file
export '../services/crashlytics_service.dart';
export '../services/performance_service.dart';
/// Semantic wrapper for buttons and tappable elements.
///
/// Ensures screen readers announce the action, not just "button".
///
/// ```dart
/// NmSemanticButton(
///   label: 'تقديم طلب تبرع',
///   hint: 'اضغط مرتين للتقديم',
///   child: ElevatedButton(onPressed: _submit, child: Text('تقديم')),
/// )
/// ```
class NmSemanticButton extends StatelessWidget {
  const NmSemanticButton({
    super.key,
    required this.label,
    required this.child,
    this.hint,
    this.isEnabled = true,
  });

  final String label;
  final Widget child;
  final String? hint;
  final bool isEnabled;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      hint: hint,
      button: true,
      enabled: isEnabled,
      child: ExcludeSemantics(child: child),
    );
  }
}

/// Semantic wrapper for images and visual-only content.
///
/// Critical for:
///   - Project photos (what does the image show?)
///   - Map views (what area is displayed?)
///   - Verification photos (GPS-stamped proof images)
///
/// ```dart
/// NmSemanticImage(
///   label: 'صورة إثبات مكاني - مشروع إعادة إعمار حلب',
///   child: CachedNetworkImage(imageUrl: url),
/// )
/// ```
class NmSemanticImage extends StatelessWidget {
  const NmSemanticImage({
    super.key,
    required this.label,
    required this.child,
    this.isDecorative = false,
  });

  final String label;
  final Widget child;

  /// If true, image is purely decorative (background gradients, dividers).
  /// Screen readers will skip it entirely.
  final bool isDecorative;

  @override
  Widget build(BuildContext context) {
    if (isDecorative) {
      return ExcludeSemantics(child: child);
    }
    return Semantics(
      label: label,
      image: true,
      child: ExcludeSemantics(child: child),
    );
  }
}

/// Semantic wrapper for cards and list items.
///
/// Groups child content into a single semantic node with a summary label.
/// Screen readers announce the card as a unit instead of reading each
/// child widget individually.
///
/// ```dart
/// NmSemanticCard(
///   label: 'مشروع إعادة إعمار حلب - 65% مكتمل - $12,500 تم جمعها',
///   onTapHint: 'اضغط مرتين لعرض التفاصيل',
///   child: ProjectCard(project: project),
/// )
/// ```
class NmSemanticCard extends StatelessWidget {
  const NmSemanticCard({
    super.key,
    required this.label,
    required this.child,
    this.onTapHint,
  });

  final String label;
  final Widget child;
  final String? onTapHint;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      hint: onTapHint,
      container: true,
      child: child,
    );
  }
}

/// Semantic wrapper for live regions (dynamic content).
///
/// Screen readers announce changes to this region automatically.
/// Use for: toast messages, loading states, real-time counters.
///
/// ```dart
/// NmSemanticLiveRegion(
///   label: 'جاري تحميل المشاريع...',
///   child: NammerhaShimmerLoader(colors: colors),
/// )
/// ```
class NmSemanticLiveRegion extends StatelessWidget {
  const NmSemanticLiveRegion({
    super.key,
    required this.label,
    required this.child,
  });

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      liveRegion: true,
      child: child,
    );
  }
}

/// Semantic wrapper for headings and section titles.
///
/// Screen readers will treat this as a navigation landmark.
///
/// ```dart
/// NmSemanticHeading(
///   label: 'المشاريع النشطة',
///   child: Text('المشاريع النشطة', style: headingStyle),
/// )
/// ```
class NmSemanticHeading extends StatelessWidget {
  const NmSemanticHeading({
    super.key,
    required this.label,
    required this.child,
  });

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      header: true,
      child: ExcludeSemantics(child: child),
    );
  }
}

/// Semantic wrapper for progress indicators and status displays.
///
/// Announces both the label and current value to screen readers.
///
/// ```dart
/// NmSemanticProgress(
///   label: 'تقدم المشروع',
///   value: '65%',
///   child: LinearProgressIndicator(value: 0.65),
/// )
/// ```
class NmSemanticProgress extends StatelessWidget {
  const NmSemanticProgress({
    super.key,
    required this.label,
    required this.value,
    required this.child,
  });

  final String label;
  final String value;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$label: $value',
      value: value,
      child: ExcludeSemantics(child: child),
    );
  }
}

/// Mixin for StatefulWidgets that need screen-level performance tracing.
///
/// Automatically starts a Firebase Performance screen trace in initState()
/// and stops it in dispose(). Also sets the Crashlytics custom key for
/// the current screen — crash reports will show which screen was active.
///
/// ```dart
/// class _DashboardScreenState extends State<DashboardScreen>
///     with NmScreenTraceMixin {
///   @override
///   String get screenName => 'DashboardScreen';
///   // ... rest of the screen
/// }
/// ```
mixin NmScreenTraceMixin<T extends StatefulWidget> on State<T> {
  /// Override to provide the screen name for tracing.
  String get screenName;

  @override
  void initState() {
    super.initState();
    // GAP-M2: Start screen performance trace
    PerformanceService.instance.startScreenTrace(screenName);
    // GAP-M1: Set current screen in Crashlytics for crash context
    CrashlyticsService.instance.setCustomKey('current_screen', screenName);
  }

  @override
  void dispose() {
    // GAP-M2: Stop screen performance trace
    PerformanceService.instance.stopScreenTrace(screenName);
    super.dispose();
  }
}
