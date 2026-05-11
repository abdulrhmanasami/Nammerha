import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/gradient_button.dart';
import '../../../core/i18n/t.dart';
import '../../pricing/bloc/pricing_bloc.dart';
import '../../../core/bloc/page_index_cubit.dart';

/// Typed tier model — replaces raw `Map<String, dynamic>` for type safety.
class SubscriptionTier {
  final String slug;
  final String name;
  final String price;
  final String period;
  final List<String> features;
  final bool isPopular;

  const SubscriptionTier({
    required this.slug,
    required this.name,
    required this.price,
    required this.period,
    required this.features,
    this.isPopular = false,
  });
}

class SupplierSubscriptionScreen extends StatelessWidget {
  const SupplierSubscriptionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider(create: (_) => PricingBloc()),
        BlocProvider(create: (_) => PageIndexCubit(1)),
      ],
      child: const _SupplierSubscriptionScreenContent(),
    );
  }
}

class _SupplierSubscriptionScreenContent extends StatefulWidget {
  const _SupplierSubscriptionScreenContent();

  @override
  State<_SupplierSubscriptionScreenContent> createState() => _SupplierSubscriptionScreenContentState();
}

class _SupplierSubscriptionScreenContentState extends State<_SupplierSubscriptionScreenContent> {

  List<SubscriptionTier> _buildTiers(BuildContext context) {
    return [
      SubscriptionTier(
        slug: 'basic',
        name: context.tr('sp_sub_basic'),
        price: '0',
        period: context.tr('sp_sub_free'),
        features: [
          context.tr('sp_sub_basic_f1'),
          context.tr('sp_sub_basic_f2'),
          context.tr('sp_sub_basic_f3'),
        ],
      ),
      SubscriptionTier(
        slug: 'pro',
        name: context.tr('sp_sub_platinum'),
        price: '99,000',
        period: context.tr('sp_sub_monthly'),
        features: [
          context.tr('sp_sub_pro_f1'),
          context.tr('sp_sub_pro_f2'),
          context.tr('sp_sub_pro_f3'),
          context.tr('sp_sub_pro_f4'),
          context.tr('sp_sub_pro_f5'),
        ],
        isPopular: true,
      ),
      SubscriptionTier(
        slug: 'business',
        name: context.tr('sp_sub_enterprise'),
        price: '250,000',
        period: context.tr('sp_sub_monthly'),
        features: [
          context.tr('sp_sub_biz_f1'),
          context.tr('sp_sub_biz_f2'),
          context.tr('sp_sub_biz_f3'),
          context.tr('sp_sub_biz_f4'),
        ],
      ),
    ];
  }

  void _processSubscription(List<SubscriptionTier> tiers) {
    final selectedIndex = context.read<PageIndexCubit>().state;
    final slug = tiers[selectedIndex].slug;
    context.read<PricingBloc>().add(SubscribeToPlan(slug));
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text(context.tr('sp_sub_title')),
        elevation: 0,
      ),
      body: BlocConsumer<PricingBloc, PricingState>(
        listener: (context, state) {
          if (state.error != null) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.error!), backgroundColor: colors.error)
            );
          } else if (state.successMessage != null) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('✅ ${state.successMessage}'), backgroundColor: colors.success)
            );
            Navigator.pop(context);
          }
        },
        builder: (context, state) {
          return BlocBuilder<PageIndexCubit, int>(
            builder: (context, selectedTierIndex) {
              final tiers = _buildTiers(context);
              return SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  context.tr('sp_sub_headline'),
                  style: textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: colors.textPrimary,
                  ),
                  textAlign: TextAlign.center,
                ).animate().fadeIn().slideY(begin: -0.1),
                const SizedBox(height: 8),
                Text(
                  context.tr('sp_sub_description'),
                  style: textTheme.bodyMedium?.copyWith(
                    color: colors.textSecondary,
                    height: 1.5,
                  ),
                  textAlign: TextAlign.center,
                ).animate(delay: 100.ms).fadeIn(),
                const SizedBox(height: 32),

                // Tiers
                ...List.generate(tiers.length, (index) {
                  final tier = tiers[index];
                  final isSelected = selectedTierIndex == index;
                  final isPopular = tier.isPopular;

                  return GestureDetector(
                    onTap: () {
                      if (!state.isSubscribing) context.read<PageIndexCubit>().setPage(index);
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
                                    isSelected ? PhosphorIconsRegular.radioButton : PhosphorIconsRegular.circle,
                                    color: isSelected ? colors.primaryBrand : colors.textSecondary,
                                  ),
                                  const SizedBox(width: 12),
                                  Text(
                                    tier.name,
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
                                  child: Text(
                                    context.tr('sp_sub_popular'),
                                    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white),
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                tier.price,
                                style: textTheme.headlineMedium?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  color: colors.textPrimary,
                                ),
                              ),
                              const SizedBox(width: 4),
                              Padding(
                                padding: const EdgeInsetsDirectional.only(bottom: 6),
                                child: Text(
                                  'ل.س / ${tier.period}',
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
                          ...tier.features.map((feature) {
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Icon(PhosphorIconsRegular.checkCircle, color: colors.success, size: 18),
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
                  label: selectedTierIndex == 0 ? context.tr('sp_sub_free_btn') : context.tr('sp_sub_upgrade_btn'),
                  icon: selectedTierIndex == 0 ? PhosphorIconsRegular.arrowRight : PhosphorIconsRegular.warningCircle,
                  isLoading: state.isSubscribing,
                  onPressed: () => _processSubscription(tiers),
                ).animate(delay: 600.ms).fadeIn(),
                const SizedBox(height: 24),
              ],
            ),
          );
          },
        );
        },
      ),
    );
  }
}
