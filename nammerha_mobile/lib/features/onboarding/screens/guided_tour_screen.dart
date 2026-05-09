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
/// GAP-M2 FIX: Runs on first login AFTER onboarding completes.
/// Teaches users about Dashboard, Marketplace, Camera, and Profile.
/// Persists completion to SharedPreferences to run only once.
/// ═══════════════════════════════════════════════════════════════════════════

const String _kTourCompleted = 'nammerha_tour_completed';

/// The tour step data model.
class _TourStep {
  final IconData icon;
  final String title;
  final String body;
  final List<Color> gradient;

  const _TourStep({
    required this.icon,
    required this.title,
    required this.body,
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

  final List<_TourStep> _steps = [
    _TourStep(
      icon: Icons.dashboard_rounded,
      title: 'لوحة التحكم',
      body: 'تابع كل مشاريعك، تبرعاتك، وإحصائياتك\nمن مكان واحد مع تحديثات لحظية',
      gradient: NammerhaGradients.brandPrimary.colors,
    ),
    _TourStep(
      icon: Icons.storefront_rounded,
      title: 'السوق',
      body: 'تصفّح المشاريع المتاحة وساهم بالتمويل\nاو تقدّم بعروضك كمقاول',
      gradient: NammerhaGradients.ctaPrimary.colors,
    ),
    _TourStep(
      icon: Icons.camera_alt_rounded,
      title: 'الإثبات المكاني',
      body: 'التقط صوراً محمية بالـ GPS و SHA-256\nلإثبات التقدم الحقيقي في الميدان',
      gradient: [const Color(0xFF0A6E55), const Color(0xFF085A46)],
    ),
    _TourStep(
      icon: Icons.shield_rounded,
      title: 'أمان ضمان الإسكرو',
      body: 'الأموال محمية في حساب ضمان آمن\nوتُفرج فقط عند التحقق من الإنجاز',
      gradient: [const Color(0xFFD59F80), const Color(0xFFFCC934)],
    ),
    _TourStep(
      icon: Icons.person_rounded,
      title: 'ملفك الشخصي',
      body: 'أدِر حسابك، بدّل أدوارك (مانح/مقاول/مهندس)\nوتابع تقييمات ثقتك',
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
    final colors = context.colors;

    return BlocProvider(
      create: (_) => PageIndexCubit(),
      child: BlocBuilder<PageIndexCubit, int>(
        builder: (context, currentStep) {
          return Scaffold(
      backgroundColor: Colors.black.withAlpha(220),
      body: SafeArea(
        child: Column(
          children: [
            // Skip
            Align(
              alignment: AlignmentDirectional.topEnd,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: Text(context.tr('str_69b04b59'), style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 15)),
                ),
              ),
            ),

            // Step indicator
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32),
              child: Row(
                children: List.generate(_steps.length, (i) {
                  final isActive = i <= currentStep;
                  return Expanded(
                    child: Container(
                      height: 3,
                      margin: const EdgeInsets.symmetric(horizontal: 2),
                      decoration: BoxDecoration(
                        color: isActive ? Colors.white : Colors.white.withAlpha(40),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  );
                }),
              ),
            ),

            // Pages
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                itemCount: _steps.length,
                onPageChanged: (i) => context.read<PageIndexCubit>().setPage(i),
                itemBuilder: (_, i) {
                  final step = _steps[i];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        // Icon circle
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
                              BoxShadow(color: step.gradient.first.withAlpha(80), blurRadius: 40, offset: const Offset(0, 12)),
                            ],
                          ),
                          child: Icon(step.icon, size: 52, color: Colors.white),
                        ).animate().scale(begin: const Offset(0.8, 0.8), duration: 400.ms, curve: Curves.easeOut),
                        const SizedBox(height: 40),
                        Text(step.title, textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white, height: 1.3),
                        ).animate(delay: 150.ms).fadeIn().slideY(begin: 0.15, end: 0),
                        const SizedBox(height: 16),
                        Text(step.body, textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 15, color: Colors.white.withAlpha(200), height: 1.8),
                        ).animate(delay: 300.ms).fadeIn(),
                      ],
                    ),
                  );
                },
              ),
            ),

            // Next / Done button
            Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(32, 0, 32, 40),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => _next(context),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: colors.primaryBrand,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  child: Text(
                    currentStep == _steps.length - 1 ? 'ابدأ الاستكشاف' : context.tr('next'),
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16),
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
