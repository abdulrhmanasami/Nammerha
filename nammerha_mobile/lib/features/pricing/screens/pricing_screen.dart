import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/semantic_colors.dart';
import '../../../core/i18n/t.dart';
import '../../contact/screens/contact_screen.dart';
import '../../auth/screens/login_screen.dart';
import '../../supplier/screens/supplier_subscription_screen.dart';
import '../bloc/billing_toggle_cubit.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Pricing Screen — REM-004: 4-Tier SaaS Pricing Page
// ═══════════════════════════════════════════════════════════════════════════
// Mirrors web pricing.ts: Free / Pro $15 / Business $49 / Enterprise $99
// Features: Monthly ↔ Yearly toggle with 20% discount,
//           animated price transitions, subscribe actions.
//
// Per profitability study §2: SaaS Monetization — Geo-appropriate pricing.
// $15 Pro for local Syrian contractors, $49 Business for firms,
// $99 Enterprise for international organizations.
// ═══════════════════════════════════════════════════════════════════════════

class PricingScreen extends StatelessWidget {
  const PricingScreen({super.key});

  // Price constants (cents)
  static const _tiers = [
    _PricingTier(
      slug: 'free',
      nameAr: 'مجاني',
      nameEn: 'Free',
      monthlyPriceCents: 0,
      features: [
        'تصفح المشاريع',
        'تتبع التبرعات',
        'خريطة المشاريع التفاعلية',
        'إشعارات أساسية',
      ],
      featuresEn: [
        'Browse Projects',
        'Track Donations',
        'Interactive Project Map',
        'Basic Notifications',
      ],
    ),
    _PricingTier(
      slug: 'pro',
      nameAr: 'احترافي',
      nameEn: 'Pro',
      monthlyPriceCents: 1500,
      highlighted: true,
      features: [
        'جميع ميزات المجاني',
        'تقارير OCDS مفصلة',
        'أولوية في محرك التوفيق',
        'كاميرا مكانية GPS',
        'دعم فني مباشر',
      ],
      featuresEn: [
        'All Free features',
        'Detailed OCDS reports',
        'Priority matchmaking',
        'GPS Spatial Camera',
        'Direct tech support',
      ],
    ),
    _PricingTier(
      slug: 'business',
      nameAr: 'أعمال',
      nameEn: 'Business',
      monthlyPriceCents: 4900,
      features: [
        'جميع ميزات الاحترافي',
        'لوحة تحكم متقدمة',
        'تحليلات الإيرادات',
        'إدارة فريق متعدد',
        'API وصول كامل',
        'تقارير مخصصة PDF/XLSX',
      ],
      featuresEn: [
        'All Pro features',
        'Advanced Dashboard',
        'Revenue Analytics',
        'Multi-team Management',
        'Full API Access',
        'Custom PDF/XLSX Reports',
      ],
    ),
    _PricingTier(
      slug: 'enterprise',
      nameAr: 'مؤسسات',
      nameEn: 'Enterprise',
      monthlyPriceCents: 9900,
      features: [
        'جميع ميزات الأعمال',
        'بيئة مخصصة',
        'SLA مضمون',
        'مدير حساب مخصص',
        'تدريب وإعداد مخصص',
        'تكامل مخصص',
        'فحص عقوبات OFAC/SDN',
      ],
      featuresEn: [
        'All Business features',
        'Dedicated Environment',
        'Guaranteed SLA',
        'Dedicated Account Manager',
        'Custom Onboarding & Training',
        'Custom Integration',
        'OFAC/SDN Sanctions Screening',
      ],
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<SemanticColors>()!;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return BlocProvider(
      create: (_) => BillingToggleCubit(),
      child: BlocBuilder<BillingToggleCubit, bool>(
        builder: (context, isYearly) {
          return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('str_7e2f72d3')), // 'الأسعار والاشتراكات' or fallback
        centerTitle: true,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        child: Column(
          children: [
            // ── Header ──────────────────────────────────────────────
            Text(
              'اختر الخطة المناسبة لمشروعك',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'جميع الخطط تشمل الشفافية الكاملة وتتبع الأموال',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: colors.textSecondary,
                  ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),

            // ── Billing Toggle ──────────────────────────────────────
            _buildBillingToggle(context, colors, isYearly),
            const SizedBox(height: 24),

            // ── Tier Cards ──────────────────────────────────────────
            ..._tiers.asMap().entries.map((entry) {
              final index = entry.key;
              final tier = entry.value;
              return Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: _buildTierCard(context, tier, colors, isDark, isYearly)
                    .animate()
                    .fadeIn(
                      delay: Duration(milliseconds: 100 * index),
                      duration: 400.ms,
                    )
                    .slideY(begin: 0.1, end: 0),
              );
            }),

            const SizedBox(height: 32),

            // ── Footer ──────────────────────────────────────────────
            Text(
              'جميع الأسعار بالدولار الأمريكي. الاشتراك السنوي يوفر 20%.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: colors.textSecondary,
                  ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
        },
      ),
    );
  }

  Widget _buildBillingToggle(BuildContext context, SemanticColors colors, bool isYearly) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: colors.backgroundSecondary,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _toggleButton('شهري', !isYearly, colors, () {
            HapticFeedback.selectionClick();
            context.read<BillingToggleCubit>().setMonthly();
          }),
          const SizedBox(width: 4),
          _toggleButton('سنوي (-20%)', isYearly, colors, () {
            HapticFeedback.selectionClick();
            context.read<BillingToggleCubit>().setYearly();
          }),
        ],
      ),
    );
  }

  Widget _toggleButton(
      String label, bool active, SemanticColors colors, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        decoration: BoxDecoration(
          color: active ? const Color(0xFF1558D6) : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: active ? Colors.white : colors.textSecondary,
            fontWeight: active ? FontWeight.w600 : FontWeight.w400,
          ),
        ),
      ),
    );
  }

  Widget _buildTierCard(BuildContext context, _PricingTier tier,
      SemanticColors colors, bool isDark, bool isYearly) {
    final priceCents = isYearly
        ? (tier.monthlyPriceCents * 0.80).round()
        : tier.monthlyPriceCents;
    final priceStr = tier.monthlyPriceCents == 0
        ? 'مجاني'
        : '\$${(priceCents / 100).toStringAsFixed(0)}';
    final interval = tier.monthlyPriceCents == 0
        ? ''
        : isYearly
            ? '/شهر (سنوي)'
            : '/شهر';

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: isDark ? colors.backgroundSecondary : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: tier.highlighted
            ? Border.all(color: const Color(0xFF1558D6), width: 2)
            : Border.all(color: colors.strokeBorder, width: 1),
        boxShadow: tier.highlighted
            ? [
                BoxShadow(
                  color: const Color(0xFF1558D6).withValues(alpha: 0.15),
                  blurRadius: 20,
                  offset: const Offset(0, 8),
                )
              ]
            : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: tier.highlighted
                ? const BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Color(0xFF1558D6), Color(0xFF0D47A1)],
                    ),
                    borderRadius: BorderRadius.only(
                      topLeft: Radius.circular(14),
                      topRight: Radius.circular(14),
                    ),
                  )
                : null,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (tier.highlighted)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    margin: const EdgeInsets.only(bottom: 8),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Text('الأكثر شيوعاً',
                        style: TextStyle(color: Colors.white, fontSize: 11)),
                  ),
                Text(
                  tier.nameAr,
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: tier.highlighted ? Colors.white : colors.textPrimary,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 300),
                      child: Text(
                        priceStr,
                        key: ValueKey('$priceStr-$isYearly'),
                        style: TextStyle(
                          fontSize: 36,
                          fontWeight: FontWeight.w800,
                          color: tier.highlighted
                              ? Colors.white
                              : const Color(0xFF1558D6),
                        ),
                      ),
                    ),
                    if (interval.isNotEmpty)
                      Padding(
                        padding:
                            const EdgeInsetsDirectional.only(start: 4, bottom: 6),
                        child: Text(
                          interval,
                          style: TextStyle(
                            fontSize: 13,
                            color: tier.highlighted
                                ? Colors.white70
                                : colors.textSecondary,
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),

          // Features
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                ...tier.features.map((feature) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Row(
                        children: [
                          Icon(Icons.check_circle,
                              size: 18, color: const Color(0xFF0A6E55)),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(feature,
                                style: TextStyle(
                                    fontSize: 13.5,
                                    color: colors.textPrimary)),
                          ),
                        ],
                      ),
                    )),
                const SizedBox(height: 16),

                // CTA Button
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {
                      HapticFeedback.mediumImpact();
                      _handleSubscribe(context, tier.slug);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: tier.highlighted
                          ? const Color(0xFF1558D6)
                          : tier.slug == 'enterprise'
                              ? const Color(0xFF0A6E55)
                              : colors.backgroundSecondary,
                      foregroundColor: tier.highlighted ||
                              tier.slug == 'enterprise'
                          ? Colors.white
                          : colors.textPrimary,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                    ),
                    child: Text(
                      tier.slug == 'free'
                          ? 'ابدأ مجاناً'
                          : tier.slug == 'enterprise'
                              ? 'تواصل معنا'
                              : 'اشترك الآن',
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 15),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _handleSubscribe(BuildContext context, String slug) {
    if (slug == 'enterprise') {
      Navigator.push(context, MaterialPageRoute(builder: (_) => const ContactScreen()));
      return;
    }
    if (slug == 'free') {
      Navigator.push(context, MaterialPageRoute(builder: (_) => LoginScreen(onLoginSuccess: () => Navigator.pop(context))));
      return;
    }
    // Pro/Business → subscription flow
    Navigator.push(context, MaterialPageRoute(builder: (_) => const SupplierSubscriptionScreen()));
  }
}

// ─── Data Model ─────────────────────────────────────────────────────────────

class _PricingTier {
  final String slug;
  final String nameAr;
  final String nameEn;
  final int monthlyPriceCents;
  final bool highlighted;
  final List<String> features;
  final List<String> featuresEn;

  const _PricingTier({
    required this.slug,
    required this.nameAr,
    required this.nameEn,
    required this.monthlyPriceCents,
    this.highlighted = false,
    required this.features,
    required this.featuresEn,
  });
}
