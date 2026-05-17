import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/utils/animation_budget.dart';
import '../../../core/widgets/gradient_button.dart';
import '../../../core/bloc/page_index_cubit.dart';
import '../../../core/i18n/t.dart';

/// Onboarding data holder — keys reference kTranslations entries.
class _OnboardingSlideData {
  final IconData icon;
  final String titleKey;
  final String subtitleKey;
  final List<Color> gradient;

  const _OnboardingSlideData({
    required this.icon,
    required this.titleKey,
    required this.subtitleKey,
    required this.gradient,
  });
}

class OnboardingScreen extends StatefulWidget {
  final VoidCallback onComplete;
  const OnboardingScreen({super.key, required this.onComplete});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _pageController = PageController();

  /// Slide gradients use governed NammerhaGradients brand tokens.
  /// Slide 1: Brand Primary (Cobalt→Pine) — "We rebuild together"
  /// Slide 2: CTA Primary (Trust Blue→Jade) — "Absolute transparency"
  /// Slide 3: CTA Warmth (Warm Earth→Gold) — "Your impact is clear"
  // P0-004 FIX: Hardcoded Arabic → i18n keys from kTranslations.
  final List<_OnboardingSlideData> _slides = [
    _OnboardingSlideData(
      icon: PhosphorIconsRegular.handshake,
      titleKey: 'onboarding_title_1',
      subtitleKey: 'onboarding_desc_1',
      gradient: NammerhaGradients.brandPrimary.colors,
    ),
    _OnboardingSlideData(
      icon: PhosphorIconsRegular.shieldCheck,
      titleKey: 'onboarding_title_2',
      subtitleKey: 'onboarding_desc_2',
      gradient: NammerhaGradients.ctaPrimary.colors,
    ),
    _OnboardingSlideData(
      icon: PhosphorIconsRegular.heart,
      titleKey: 'onboarding_title_3',
      subtitleKey: 'onboarding_desc_3',
      gradient: NammerhaGradients.ctaWarmth.colors,
    ),
  ];

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return BlocProvider(
      create: (_) => PageIndexCubit(),
      child: BlocBuilder<PageIndexCubit, int>(
        builder: (context, currentPage) {
          return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      body: SafeArea(
        child: Column(
          children: [
            // Skip button
            Align(
              alignment: AlignmentDirectional.topEnd,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: TextButton(
                  onPressed: widget.onComplete,
                  child: Text(
                    context.tr('skip'),
                    style: TextStyle(
                      color: colors.textSecondary,
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ),
            ),

            // Pages
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                itemCount: _slides.length,
                onPageChanged: (index) => context.read<PageIndexCubit>().setPage(index),
                itemBuilder: (context, index) {
                  final slide = _slides[index];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        // Icon with gradient circle
                        Container(
                          width: 140,
                          height: 140,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(
                              colors: slide.gradient,
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: slide.gradient.first.withAlpha(60),
                                blurRadius: 30,
                                offset: const Offset(0, 10),
                              ),
                            ],
                          ),
                          child: Icon(
                            slide.icon,
                            size: 64,
                            color: Colors.white,
                          ),
                        )
                            .nmAnimate(context)
                            .fadeIn(duration: 500.ms)
                            .scale(begin: const Offset(0.8, 0.8), duration: 500.ms, curve: Curves.easeOut),
                        const SizedBox(height: 48),

                        // Title
                        Text(
                          context.tr(slide.titleKey),
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 32,
                            fontWeight: FontWeight.w800,
                            color: colors.textPrimary,
                            height: 1.3,
                          ),
                        )
                            .nmAnimate(context, delay: 200.ms)
                            .fadeIn(duration: 400.ms)
                            .slideY(begin: 0.2, end: 0),
                        const SizedBox(height: 16),

                        // Subtitle
                        Text(
                          context.tr(slide.subtitleKey),
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w400,
                            color: colors.textSecondary,
                            height: 1.8,
                          ),
                        )
                            .nmAnimate(context, delay: 400.ms)
                            .fadeIn(duration: 400.ms),
                      ],
                    ),
                  );
                },
              ),
            ),

            // Dots & Button
            Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(32, 0, 32, 40),
              child: Column(
                children: [
                  // Page dots
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(_slides.length, (index) {
                      final isActive = index == currentPage;
                      return AnimatedContainer(
                        duration: const Duration(milliseconds: 300),
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        width: isActive ? 28 : 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: isActive ? colors.primaryBrand : colors.strokeBorder,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: 24),

                  // Swipe Hint
                  // AUD-025 FIX: Infinite shimmer guarded by AnimationBudget.
                  // On 2G devices, this permanent GPU loop is suppressed.
                  if (currentPage < _slides.length - 1)
                    Builder(builder: (context) {
                      final swipeRow = Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(PhosphorIconsRegular.arrowsLeftRight, size: 16, color: colors.textSubtle),
                          const SizedBox(width: 8),
                          Text(
                            context.tr('swipe_to_continue'),
                            style: TextStyle(fontSize: 12, color: colors.textSubtle),
                          ),
                        ],
                      );
                      if (AnimationBudget.shouldAnimate(context)) {
                        return swipeRow.animate(onPlay: (c) => c.repeat()).shimmer(
                          duration: 2500.ms,
                          color: colors.primaryBrand.withAlpha(50),
                        );
                      }
                      return swipeRow;
                    }),
                  
                  const SizedBox(height: 16),

                  // CTA Button
                  GradientButton(
                    label: currentPage == _slides.length - 1 ? context.tr('onboarding_start') : context.tr('next'),
                    icon: currentPage == _slides.length - 1
                        ? PhosphorIconsRegular.arrowRight
                        : null,
                    onPressed: () {
                      if (currentPage == _slides.length - 1) {
                        widget.onComplete();
                      } else {
                        _pageController.nextPage(
                          duration: const Duration(milliseconds: 400),
                          curve: Curves.easeInOut,
                        );
                      }
                    },
                  ),
                ],
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

// _OnboardingSlide removed — replaced by _OnboardingSlideData (i18n-keyed) at top of file.

