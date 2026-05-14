import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/bloc/page_index_cubit.dart';
import '../../../core/i18n/t.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Guided Feature Tour — Post-login interactive walkthrough
/// ═══════════════════════════════════════════════════════════════════════════
/// UX-F029 REMEDIATION: Full content remediation + i18n + icon fixes.
///
/// PREVIOUS (6 defects):
///   - P0: Hardcoded Arabic in all 5 step titles & bodies
///   - P0: warningCircle icon on Marketplace step
///   - P0: Stale content mentioning role switching + donation role
///   - P0: showGuidedTour() never called from anywhere (dead code)
///   - P1: Hardcoded button text "ابدأ الاستكشاف"
///   - P1: No English translations
///
/// NOW:
///   - All strings use context.tr() with i18n keys from translations.dart
///   - Icons match bottom nav (compass for Discover, lockKey for Escrow)
///   - Content updated for Universal Access paradigm (no role switching)
///   - Wired to DashboardScreen via addPostFrameCallback
///
/// Persists completion to SharedPreferences to run only once.
/// ═══════════════════════════════════════════════════════════════════════════

const String _kTourCompleted = 'nammerha_tour_completed';

/// The tour step data model — uses i18n keys, not hardcoded strings.
class _TourStep {
  final IconData icon;
  final String titleKey;
  final String bodyKey;
  final List<Color> gradient;

  const _TourStep({
    required this.icon,
    required this.titleKey,
    required this.bodyKey,
    required this.gradient,
  });
}

/// Check if the tour should be shown (call after successful login).
Future<bool> shouldShowTour() async {
  final prefs = await SharedPreferences.getInstance();
  return !(prefs.getBool(_kTourCompleted) ?? false);
}

/// Mark tour as completed.
Future<void> markTourCompleted() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setBool(_kTourCompleted, true);
}

/// Show the guided tour as a full-screen modal overlay.
/// Internally checks SharedPreferences — safe to call unconditionally.
Future<void> showGuidedTour(BuildContext context) async {
  if (!await shouldShowTour()) return;

  if (!context.mounted) return;

  await Navigator.of(context).push(
    PageRouteBuilder(
      opaque: false,
      pageBuilder: (_, _, _) => const _GuidedTourOverlay(),
      transitionsBuilder: (_, anim, _, child) =>
          FadeTransition(opacity: anim, child: child),
    ),
  );

  await markTourCompleted();
}

class _GuidedTourOverlay extends StatefulWidget {
  const _GuidedTourOverlay();

  @override
  State<_GuidedTourOverlay> createState() => _GuidedTourOverlayState();
}

class _GuidedTourOverlayState extends State<_GuidedTourOverlay> {
  final PageController _pageController = PageController();

  /// UX-F029: i18n-keyed tour steps with corrected icons.
  /// Step 1: Dashboard — squaresFour (matches nav icon)
  /// Step 2: Discover — compass (matches nav icon, was warningCircle ❌)
  /// Step 3: Spatial Camera — camera (correct)
  /// Step 4: Escrow — lockKey (was shield — more specific for financial security)
  /// Step 5: Profile — user (correct, content updated for Universal Access)
  final List<_TourStep> _steps = [
    _TourStep(
      icon: PhosphorIconsRegular.squaresFour,
      titleKey: 'tour_dashboard_title',
      bodyKey: 'tour_dashboard_body',
      gradient: NammerhaGradients.brandPrimary.colors,
    ),
    _TourStep(
      // UX-F029 FIX: warningCircle → compass — matches Discover bottom nav icon.
      // PREVIOUS: warningCircle conveyed danger/error — P0 trust violation on a
      // marketplace browsing feature.
      icon: PhosphorIconsRegular.compass,
      titleKey: 'tour_discover_title',
      bodyKey: 'tour_discover_body',
      gradient: NammerhaGradients.ctaPrimary.colors,
    ),
    _TourStep(
      icon: PhosphorIconsRegular.camera,
      titleKey: 'tour_camera_title',
      bodyKey: 'tour_camera_body',
      gradient: [const Color(0xFF0A6E55), const Color(0xFF085A46)],
    ),
    _TourStep(
      // UX-F029 FIX: shield → lockKey — more specific for escrow/financial security.
      // shield is generic; lockKey communicates "locked funds" more precisely.
      icon: PhosphorIconsRegular.lockKey,
      titleKey: 'tour_escrow_title',
      bodyKey: 'tour_escrow_body',
      gradient: [const Color(0xFFD59F80), const Color(0xFFFCC934)],
    ),
    _TourStep(
      icon: PhosphorIconsRegular.user,
      // UX-F029 FIX: Content updated for Universal Access paradigm.
      // PREVIOUS: "بدّل أدوارك (مانح/مقاول/مهندس)" — roles removed, donations suspended.
      // NOW: "أدِر حسابك وإعداداتك وتابع تقييمات ثقتك"
      titleKey: 'tour_profile_title',
      bodyKey: 'tour_profile_body',
      gradient: [const Color(0xFF1558D6), const Color(0xFF0A6E55)],
    ),
  ];

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _next(BuildContext ctx) {
    final currentStep = ctx.read<PageIndexCubit>().state;
    if (currentStep == _steps.length - 1) {
      Navigator.of(context).pop();
    } else {
      _pageController.nextPage(
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOut,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => PageIndexCubit(),
      child: BlocBuilder<PageIndexCubit, int>(
        builder: (context, currentStep) {
          return Scaffold(
            backgroundColor: Colors.black.withAlpha(220),
            body: SafeArea(
              child: Column(
                children: [
                  // Skip button — UX-F029 FIX: proper i18n key instead of auto-generated hash
                  Align(
                    alignment: AlignmentDirectional.topEnd,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: TextButton(
                        onPressed: () => Navigator.of(context).pop(),
                        child: Text(
                          context.tr('tour_skip'),
                          style: TextStyle(
                            color: Colors.white.withAlpha(180),
                            fontSize: 15,
                          ),
                        ),
                      ),
                    ),
                  ),

                  // Step indicator — segmented progress bar
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 32),
                    child: Row(
                      children: List.generate(_steps.length, (i) {
                        final isActive = i <= currentStep;
                        return Expanded(
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 300),
                            height: 3,
                            margin: const EdgeInsets.symmetric(horizontal: 2),
                            decoration: BoxDecoration(
                              color: isActive
                                  ? Colors.white
                                  : Colors.white.withAlpha(40),
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                        );
                      }),
                    ),
                  ),

                  // Pages — swipeable tour steps
                  Expanded(
                    child: PageView.builder(
                      controller: _pageController,
                      itemCount: _steps.length,
                      onPageChanged: (i) =>
                          context.read<PageIndexCubit>().setPage(i),
                      itemBuilder: (_, i) {
                        final step = _steps[i];
                        return Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 32),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              // Icon circle with gradient + shadow
                              Container(
                                width: 120,
                                height: 120,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  gradient: LinearGradient(
                                    colors: step.gradient,
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight,
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color:
                                          step.gradient.first.withAlpha(80),
                                      blurRadius: 40,
                                      offset: const Offset(0, 12),
                                    ),
                                  ],
                                ),
                                child:
                                    Icon(step.icon, size: 52, color: Colors.white),
                              ).animate().scale(
                                    begin: const Offset(0.8, 0.8),
                                    duration: 400.ms,
                                    curve: Curves.easeOut,
                                  ),
                              const SizedBox(height: 40),
                              // Title — i18n keyed
                              Text(
                                context.tr(step.titleKey),
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  fontSize: 28,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white,
                                  height: 1.3,
                                ),
                              )
                                  .animate(delay: 150.ms)
                                  .fadeIn()
                                  .slideY(begin: 0.15, end: 0),
                              const SizedBox(height: 16),
                              // Body — i18n keyed
                              Text(
                                context.tr(step.bodyKey),
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 15,
                                  color: Colors.white.withAlpha(200),
                                  height: 1.8,
                                ),
                              ).animate(delay: 300.ms).fadeIn(),
                            ],
                          ),
                        );
                      },
                    ),
                  ),

                  // Next / Done button — UX-F029 FIX: i18n keyed
                  Padding(
                    padding:
                        const EdgeInsetsDirectional.fromSTEB(32, 0, 32, 40),
                    child: SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: () => _next(context),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: context.colors.primaryBrand,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: Text(
                          currentStep == _steps.length - 1
                              ? context.tr('tour_start_exploring')
                              : context.tr('next'),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
