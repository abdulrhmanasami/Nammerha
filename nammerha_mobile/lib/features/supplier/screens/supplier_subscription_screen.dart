import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/gradient_button.dart';

class SupplierSubscriptionScreen extends StatefulWidget {
  const SupplierSubscriptionScreen({super.key});

  @override
  State<SupplierSubscriptionScreen> createState() => _SupplierSubscriptionScreenState();
}

class _SupplierSubscriptionScreenState extends State<SupplierSubscriptionScreen> {
  int _selectedTierIndex = 1; // Default to Platinum
  bool _isProcessing = false;

  final List<Map<String, dynamic>> _tiers = [
    {
      'name': 'الأساسية',
      'price': '0',
      'period': 'مجاناً',
      'features': [
        'تلقي طلبات الشراء العادية',
        'عرض 5 منتجات في الكتالوج',
        'دعم فني عادي',
      ],
      'isPopular': false,
    },
    {
      'name': 'البلاتينية (TaaS)',
      'price': '99,000',
      'period': 'شهرياً',
      'features': [
        'توثيق Trust-as-a-Service',
        'أولوية في محرك التوفيق (Matchmaking)',
        'تعديل أسعار آلي (تضخم FIDIC 13.8)',
        'عدد غير محدود من المنتجات',
        'دعم فني مخصص (24/7)',
      ],
      'isPopular': true,
    },
    {
      'name': 'الشركات الكبرى',
      'price': '250,000',
      'period': 'شهرياً',
      'features': [
        'جميع ميزات البلاتينية',
        'إدارة المخزون الموزع (API)',
        'تقارير OCDS متقدمة',
        'حماية قانونية متقدمة',
      ],
      'isPopular': false,
    },
  ];

  Future<void> _processSubscription() async {
    setState(() => _isProcessing = true);
    // Simulate network delay and idempotency logic
    await Future.delayed(const Duration(seconds: 2));
    
    if (!mounted) return;
    setState(() => _isProcessing = false);
    
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text('✅ تم ترقية اشتراكك بنجاح. أنت الآن مورد موثوق!'),
        backgroundColor: context.colors.success,
      ),
    );
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: const Text('إدارة الاشتراك (TaaS)'),
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'الارتقاء بمستوى الثقة',
              style: textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.textPrimary,
              ),
              textAlign: TextAlign.center,
            ).animate().fadeIn().slideY(begin: -0.1),
            const SizedBox(height: 8),
            Text(
              'خدمة الثقة (Trust-as-a-Service) تمنحك الأولوية والموثوقية في المشاريع الاستراتيجية.',
              style: textTheme.bodyMedium?.copyWith(
                color: colors.textSecondary,
                height: 1.5,
              ),
              textAlign: TextAlign.center,
            ).animate(delay: 100.ms).fadeIn(),
            const SizedBox(height: 32),

            // Tiers
            ...List.generate(_tiers.length, (index) {
              final tier = _tiers[index];
              final isSelected = _selectedTierIndex == index;
              final isPopular = tier['isPopular'] as bool;

              return GestureDetector(
                onTap: () {
                  if (!isProcessing) setState(() => _selectedTierIndex = index);
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  margin: const EdgeInsets.only(bottom: 16),
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: isSelected ? colors.primaryBrandLight : colors.surfaceElevated,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: isSelected ? colors.primaryBrand : colors.strokeSubtle,
                      width: isSelected ? 2 : 1,
                    ),
                    boxShadow: isSelected
                        ? [BoxShadow(color: colors.primaryBrand.withValues(alpha: 0.1), blurRadius: 16, offset: const Offset(0, 8))]
                        : [],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              Icon(
                                isSelected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                                color: isSelected ? colors.primaryBrand : colors.textSecondary,
                              ),
                              const SizedBox(width: 12),
                              Text(
                                tier['name'] as String,
                                style: textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  color: isSelected ? colors.primaryBrand : colors.textPrimary,
                                ),
                              ),
                            ],
                          ),
                          if (isPopular)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: colors.goldFunding,
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: const Text(
                                'الأكثر طلباً',
                                style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            tier['price'] as String,
                            style: textTheme.headlineMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: colors.textPrimary,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Padding(
                            padding: const EdgeInsetsDirectional.only(bottom: 6),
                            child: Text(
                              'ل.س / ${tier['period']}',
                              style: textTheme.bodySmall?.copyWith(
                                fontWeight: FontWeight.w600,
                                color: colors.textSecondary,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Divider(color: colors.strokeSubtle),
                      const SizedBox(height: 16),
                      ...(tier['features'] as List<String>).map((feature) {
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(Icons.check_circle_rounded, color: colors.success, size: 18),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  feature,
                                  style: textTheme.bodySmall?.copyWith(color: colors.textPrimary),
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                    ],
                  ),
                ),
              ).animate(delay: (200 + index * 100).ms).fadeIn().slideY(begin: 0.1);
            }),

            const SizedBox(height: 32),
            GradientButton(
              label: _selectedTierIndex == 0 ? 'استمرار بالباقة المجانية' : 'ترقية الحساب الآن',
              icon: _selectedTierIndex == 0 ? Icons.arrow_forward_rounded : Icons.workspace_premium_rounded,
              isLoading: _isProcessing,
              onPressed: _processSubscription,
            ).animate(delay: 600.ms).fadeIn(),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  bool get isProcessing => _isProcessing;
}
