import '../../../core/i18n/t.dart';
import '../../../core/utils/format_utils.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/gradient_button.dart';
import '../../cart/bloc/checkout_bloc.dart';
import '../../cart/bloc/checkout_event.dart';
import '../../cart/bloc/checkout_state.dart';
import '../bloc/gateway_selector_cubit.dart';

class EscrowCheckoutScreen extends StatelessWidget {
  final List<Map<String, dynamic>> basketItems;
  final double totalAmount;
  final int tipAmount;

  const EscrowCheckoutScreen({
    super.key,
    required this.basketItems,
    required this.totalAmount,
    this.tipAmount = 0,
  });

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider(create: (context) => CheckoutBloc()),
        BlocProvider(create: (context) => GatewaySelectorCubit()),
      ],
      child: EscrowCheckoutView(
        basketItems: basketItems,
        totalAmount: totalAmount,
        tipAmount: tipAmount,
      ),
    );
  }
}

class EscrowCheckoutView extends StatelessWidget {
  final List<Map<String, dynamic>> basketItems;
  final double totalAmount;
  final int tipAmount;

  const EscrowCheckoutView({
    super.key,
    required this.basketItems,
    required this.totalAmount,
    required this.tipAmount,
  });

  // Centralized formatter via FormatUtils (Platinum Standard)
  String formatCurrency(num amount) => FormatUtils.currency(amount);

  void _handleCheckout(BuildContext context) {
    final selectedGateway = context.read<GatewaySelectorCubit>().state;
    context.read<CheckoutBloc>().add(InitiateCheckoutEvent(
      basketItems: basketItems,
      tipAmount: tipAmount,
      paymentGateway: selectedGateway,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return BlocConsumer<CheckoutBloc, CheckoutState>(
      listener: (context, state) async {
        if (state is CheckoutSuccess && state.checkoutUrl != null) {
          final url = Uri.parse(state.checkoutUrl!);
          if (await canLaunchUrl(url)) {
            await launchUrl(url, mode: LaunchMode.externalApplication);
          }
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(context.tr('payment_redirect')),
                backgroundColor: colors.success,
              ),
            );
            Navigator.pop(context); // Close checkout
          }
        }
      },
      builder: (context, state) {
        final isLoading = state is CheckoutLoading;
        String? errorMessage;
        if (state is CheckoutError) {
          errorMessage = state.message;
        }

        return Scaffold(
          backgroundColor: colors.backgroundPrimary,
          appBar: AppBar(title: Text(context.tr('secure_payment'))),
          body: SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(context.tr('escrow_funding_summary'), style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: colors.textPrimary)),
                  const SizedBox(height: 16),

                  // Items list
                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(
                        color: colors.surfaceElevated,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: colors.strokeSubtle),
                      ),
                      child: ListView.separated(
                        itemCount: basketItems.length,
                        separatorBuilder: (_, _) => Divider(height: 1, color: colors.strokeSubtle),
                        itemBuilder: (context, index) {
                          final item = basketItems[index];
                          final lineTotal = ((item['unit_price'] as num?) ?? 0) * ((item['quantity'] as num?) ?? 1);
                          return ListTile(
                            title: Text(
                              '${item['material_name'] ?? item['name']} × ${item['quantity']}',
                              style: TextStyle(fontWeight: FontWeight.w500, color: colors.textPrimary, fontSize: 14),
                            ),
                            trailing: Text(
                              formatCurrency(lineTotal),
                              style: TextStyle(fontWeight: FontWeight.w700, color: colors.success, fontSize: 14),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Tips if selected
                  if (tipAmount > 0) ...[
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        color: colors.backgroundSecondary,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(context.tr('escrow_platform_tip'), style: TextStyle(fontWeight: FontWeight.w500, color: colors.textSecondary)),
                          Text(formatCurrency(tipAmount), style: TextStyle(fontWeight: FontWeight.w700, color: colors.success)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],

                  // Total
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: colors.primaryBrandLight,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: colors.primaryBrand.withAlpha(30)),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Icon(PhosphorIconsRegular.lockKey, color: colors.primaryBrand, size: 20),
                            const SizedBox(width: 8),
                            Text(context.tr('escrow_total'), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: colors.primaryBrand)),
                          ],
                        ),
                        Text(
                          formatCurrency(totalAmount + tipAmount),
                          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: colors.primaryBrand),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Gateway Selector
                  Text(context.tr('escrow_select_gateway'), style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: colors.textPrimary)),
                  const SizedBox(height: 12),
                  _buildGatewaySelector(context, context.tr('fatora_gateway'), 'fatora', PhosphorIconsRegular.bank),
                  const SizedBox(height: 24),

                  // Error
                  if (errorMessage != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(color: colors.errorLight, borderRadius: BorderRadius.circular(10)),
                      child: Row(
                        children: [
                          Icon(PhosphorIconsRegular.warningCircle, color: colors.error, size: 18),
                          const SizedBox(width: 8),
                          Expanded(child: Text(errorMessage, style: TextStyle(color: colors.error, fontSize: 13))),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],

                  // Trust badge
                  Row(
                    children: [
                      Icon(PhosphorIconsRegular.shield, color: colors.success, size: 16),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          context.tr('escrow_trust_badge_short'),
                          style: TextStyle(fontSize: 11, color: colors.textSecondary, height: 1.4),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Checkout Button
                  GradientButton(
                    label: context.tr('escrow_secure_funds'),
                    icon: PhosphorIconsRegular.lockKey,
                    isLoading: isLoading,
                    onPressed: () => _handleCheckout(context),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildGatewaySelector(BuildContext context, String title, String value, IconData icon) {
    final colors = context.colors;

    return BlocBuilder<GatewaySelectorCubit, String>(
      builder: (context, selectedGateway) {
        final isSelected = selectedGateway == value;
        return GestureDetector(
          onTap: () => context.read<GatewaySelectorCubit>().selectGateway(value),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: isSelected ? colors.primaryBrandLight : colors.surfaceElevated,
              border: Border.all(color: isSelected ? colors.primaryBrand : colors.strokeBorder, width: isSelected ? 2 : 1),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              children: [
                Icon(isSelected ? PhosphorIconsRegular.radioButton : PhosphorIconsRegular.circle, color: isSelected ? colors.primaryBrand : colors.textSecondary),
                const SizedBox(width: 12),
                Icon(icon, color: isSelected ? colors.primaryBrand : colors.textSecondary, size: 20),
                const SizedBox(width: 8),
                Text(title, style: TextStyle(fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400, color: colors.textPrimary)),
              ],
            ),
          ),
        );
      },
    );
  }
}

