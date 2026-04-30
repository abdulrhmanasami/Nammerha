import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/gradient_button.dart';
import '../../../core/i18n/t.dart';

class OnboardingScreen extends StatefulWidget {
  final VoidCallback onComplete;
  const OnboardingScreen({super.key, required this.onComplete});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;

  /// Slide gradients use governed NammerhaGradients brand tokens.
  /// Slide 1: Brand Primary (Cobalt→Pine) — "We rebuild together"
  /// Slide 2: CTA Primary (Trust Blue→Jade) — "Absolute transparency"
  /// Slide 3: CTA Warmth (Warm Earth→Gold) — "Your impact is clear"
  final List<_OnboardingSlide> _slides = [
    _OnboardingSlide(
      icon: Icons.home_work_rounded,
      title: 'نعمّرها سوا',
      subtitle: 'منصة شفافة لإعادة إعمار سوريا\nكل ليرة مُتبرع بها مُتتبّعة بدقة',
      gradient: NammerhaGradients.brandPrimary.colors,
    ),
    _OnboardingSlide(
      icon: Icons.verified_user_rounded,
      title: 'شفافية مطلقة',
      subtitle: 'إثبات مكاني بالـ GPS لكل عملية توصيل\nدفاتر حسابات مشفرة لا تقبل التلاعب',
      gradient: NammerhaGradients.ctaPrimary.colors,
    ),
    _OnboardingSlide(
      icon: Icons.volunteer_activism_rounded,
      title: 'أثرك واضح',
      subtitle: 'تابع مشاريعك من التبرع إلى البناء\nواستلم إثبات مصوّر بالتسليم',
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
                    context.tr('str_69b04b59'),
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
                onPageChanged: (index) => setState(() => _currentPage = index),
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
                            .animate()
                            .fadeIn(duration: 500.ms)
                            .scale(begin: const Offset(0.8, 0.8), duration: 500.ms, curve: Curves.easeOut),
                        const SizedBox(height: 48),

                        // Title
                        Text(
                          slide.title,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 32,
                            fontWeight: FontWeight.w800,
                            color: colors.textPrimary,
                            height: 1.3,
                          ),
                        )
                            .animate(delay: 200.ms)
                            .fadeIn(duration: 400.ms)
                            .slideY(begin: 0.2, end: 0),
                        const SizedBox(height: 16),

                        // Subtitle
                        Text(
                          slide.subtitle,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w400,
                            color: colors.textSecondary,
                            height: 1.8,
                          ),
                        )
                            .animate(delay: 400.ms)
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
                      final isActive = index == _currentPage;
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
                  const SizedBox(height: 32),

                  // CTA Button
                  GradientButton(
                    label: _currentPage == _slides.length - 1 ? 'ابدأ الآن' : context.tr('next'),
                    icon: _currentPage == _slides.length - 1
                        ? Icons.arrow_forward_rounded
                        : null,
                    onPressed: () {
                      if (_currentPage == _slides.length - 1) {
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
  }
}

class _OnboardingSlide {
  final IconData icon;
  final String title;
  final String subtitle;
  final List<Color> gradient;

  const _OnboardingSlide({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.gradient,
  });
}
