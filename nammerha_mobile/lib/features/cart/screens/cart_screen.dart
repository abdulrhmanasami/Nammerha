import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';


import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/utils/format_utils.dart';
import '../../../core/widgets/gradient_button.dart';
import '../../escrow/screens/escrow_checkout_screen.dart';
import '../models/cart_item.dart';
import '../state/cart_store.dart';
import '../bloc/tip_selector_cubit.dart';
import '../../../core/i18n/t.dart';
import '../../../core/utils/animation_budget.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Cart Screen — Dynamic Construction Basket
/// ═══════════════════════════════════════════════════════════════════════════
/// Mirrors web: frontend/src/pages/user-basket.ts
/// Features: quantity adjustment, swipe-to-delete, tip selector, checkout
/// Tip default: 0% (FRC-003: humanitarian platform — opt-in tipping only)
/// ═══════════════════════════════════════════════════════════════════════════
class CartScreen extends StatefulWidget {
  const CartScreen({super.key});

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  final List<int> _tipPercentages = [0, 3, 5, 10];
  final TextEditingController _customTipController = TextEditingController();

  int _tipAmount(TipSelectorState tipState) {
    final subtotal = CartStore.instance.total;
    if (tipState.isCustomTip) {
      final customCents = int.tryParse(_customTipController.text) ?? 0;
      return customCents;
    }
    return (subtotal * _tipPercentages[tipState.selectedTipIndex] / 100).round();
  }

  int _grandTotal(TipSelectorState tipState) => CartStore.instance.total + _tipAmount(tipState);

  @override
  void dispose() {
    _customTipController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return BlocProvider(
      create: (_) => TipSelectorCubit(),
      child: Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text(context.tr('materials_cart')),
        actions: [
          ListenableBuilder(
            listenable: CartStore.instance,
            builder: (context, _) {
              if (CartStore.instance.isEmpty) return const SizedBox.shrink();
              return IconButton(
                icon: Icon(PhosphorIconsRegular.trash, color: colors.error),
                onPressed: _confirmClear,
                tooltip: context.tr('empty_cart'),
              );
            },
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: CartStore.instance,
        builder: (context, _) {
          if (CartStore.instance.isEmpty) {
            return _buildEmptyState(colors);
          }
          return _buildCartContent(colors);
        },
      ),
    ),
    );
  }

  Widget _buildEmptyState(SemanticColors colors) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              PhosphorIconsRegular.shoppingCartSimple,
              size: 80,
              color: colors.textSubtle,
            ),
            const SizedBox(height: 20),
            Text(
              context.tr('your_cart_is_empty'),
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w700,
                color: colors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              context.tr('cart_empty_subtitle'),
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 15,
                color: colors.textSecondary,
              ),
            ),
            const SizedBox(height: 32),
            GradientButton(
              label: context.tr('browse_projects'),
              icon: PhosphorIconsRegular.compass,
              onPressed: () => Navigator.of(context).pop(),
            ),
          ],
        ),
      ),
    ).nmAnimate(context).fadeIn(duration: 400.ms);
  }

  Widget _buildCartContent(SemanticColors colors) {
    final items = CartStore.instance.items;

    return Column(
      children: [
        // Item list
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: items.length,
            itemBuilder: (context, index) {
              return _buildCartItem(items[index], colors, index);
            },
          ),
        ),

        // Tip selector + Total + Checkout
        _buildFooter(colors),
      ],
    );
  }

  Widget _buildCartItem(CartItem item, SemanticColors colors, int index) {
    return Dismissible(
      key: ValueKey(item.id),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: AlignmentDirectional.centerEnd,
        padding: const EdgeInsetsDirectional.only(end: 20),
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: colors.error,
          borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
        ),
        child: Icon(PhosphorIconsRegular.trash, color: Colors.white, size: 28),
      ),
      onDismissed: (_) {
        CartStore.instance.removeItem(item.id);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${context.tr('cart_item_removed')} ${item.name}'),
            backgroundColor: colors.textPrimary,
            action: SnackBarAction(
              label: context.tr('undo'),
              textColor: colors.primaryBrand,
              onPressed: () {
                HapticFeedback.mediumImpact();
                CartStore.instance.addItem(
                  id: item.id,
                  name: item.name,
                  unitPrice: item.unitPrice,
                  category: item.category,
                  projectId: item.projectId,
                  quantity: item.quantity,
                );
              },
            ),
          ),
        );
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: colors.surfaceElevated,
          borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
          border: Border.all(color: colors.strokeSubtle),
          boxShadow: const [NammerhaShadows.elevation],
        ),
        child: Row(
          children: [
            // Category icon
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: colors.primaryBrand.withAlpha(15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                _getCategoryIcon(item.category),
                color: colors.primaryBrand,
                size: 24,
              ),
            ),
            const SizedBox(width: 14),

            // Name + price
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.name,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: colors.textPrimary,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    FormatUtils.currency(item.unitPrice),
                    style: TextStyle(
                      fontSize: 13,
                      color: colors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),

            // Quantity controls
            Container(
              decoration: BoxDecoration(
                color: colors.backgroundSecondary,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _quantityButton(
                    icon: PhosphorIconsRegular.minus,
                    onTap: () {
                      CartStore.instance.updateQuantity(
                        item.id,
                        item.quantity - 1,
                      );
                    },
                    colors: colors,
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Text(
                      '${item.quantity}',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: colors.textPrimary,
                      ),
                    ),
                  ),
                  _quantityButton(
                    icon: PhosphorIconsRegular.plus,
                    onTap: () {
                      CartStore.instance.updateQuantity(
                        item.id,
                        item.quantity + 1,
                      );
                    },
                    colors: colors,
                  ),
                ],
              ),
            ),
          ],
        ),
      ).nmAnimate(context, delay: (index * 80).ms).fadeIn().slideX(begin: 0.05, end: 0),
    );
  }

  Widget _quantityButton({
    required IconData icon,
    required VoidCallback onTap,
    required SemanticColors colors,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(icon, size: 18, color: colors.textPrimary),
      ),
    );
  }

  Widget _buildFooter(SemanticColors colors) {
    return BlocBuilder<TipSelectorCubit, TipSelectorState>(
      builder: (context, tipState) {
        final tip = _tipAmount(tipState);
        final grand = _grandTotal(tipState);
        return Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: colors.surfaceElevated,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            boxShadow: const [NammerhaShadows.sheet],
          ),
          child: SafeArea(
            child: Column(
              children: [
                _buildTipSelector(colors, tipState),
                const SizedBox(height: 16),
                _buildSummaryRow(context.tr('subtotal'), FormatUtils.currency(CartStore.instance.total), colors),
                if (tip > 0) ...[
                  const SizedBox(height: 8),
                  _buildSummaryRow(context.tr('platform_tip'), FormatUtils.currency(tip), colors, valueColor: colors.success),
                ],
                const SizedBox(height: 12),
                Container(height: 1, color: colors.strokeSubtle),
                const SizedBox(height: 12),
                _buildSummaryRow(context.tr('total_label'), FormatUtils.currency(grand), colors, isBold: true, valueColor: colors.primaryBrand),
                const SizedBox(height: 16),
                GradientButton(label: context.tr('payment'), icon: PhosphorIconsRegular.lockKey, onPressed: () => _proceedToCheckout(tipState)),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildTipSelector(SemanticColors colors, TipSelectorState tipState) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(context.tr('platform_tip_optional'), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.textSecondary)),
        const SizedBox(height: 8),
        Row(
          children: [
            ..._tipPercentages.asMap().entries.map((entry) {
              final isSelected = !tipState.isCustomTip && tipState.selectedTipIndex == entry.key;
              return Expanded(
                child: GestureDetector(
                  onTap: () => context.read<TipSelectorCubit>().selectTip(entry.key),
                  child: AnimatedContainer(
                    duration: NammerhaAnimations.fast,
                    margin: const EdgeInsetsDirectional.only(end: 6),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: isSelected ? colors.primaryBrand.withAlpha(15) : colors.backgroundSecondary,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: isSelected ? colors.primaryBrand : colors.strokeSubtle, width: isSelected ? 1.5 : 1),
                    ),
                    child: Center(
                      child: Text('${entry.value}%', style: TextStyle(fontSize: 14, fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500, color: isSelected ? colors.primaryBrand : colors.textSecondary)),
                    ),
                  ),
                ),
              );
            }),
            Expanded(
              child: GestureDetector(
                onTap: () => context.read<TipSelectorCubit>().enableCustomTip(),
                child: AnimatedContainer(
                  duration: NammerhaAnimations.fast,
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    color: tipState.isCustomTip ? colors.primaryBrand.withAlpha(15) : colors.backgroundSecondary,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: tipState.isCustomTip ? colors.primaryBrand : colors.strokeSubtle, width: tipState.isCustomTip ? 1.5 : 1),
                  ),
                  child: Center(
                    child: Text(context.tr('custom'), style: TextStyle(fontSize: 13, fontWeight: tipState.isCustomTip ? FontWeight.w700 : FontWeight.w500, color: tipState.isCustomTip ? colors.primaryBrand : colors.textSecondary)),
                  ),
                ),
              ),
            ),
          ],
        ),
        if (tipState.isCustomTip) ...[
          const SizedBox(height: 8),
          TextField(
            controller: _customTipController,
            keyboardType: TextInputType.number,
            onChanged: (_) => context.read<TipSelectorCubit>().notifyCustomChanged(),
            decoration: InputDecoration(
              hintText: context.tr('amount_4'),
              suffixText: context.tr('currency_suffix'),
              filled: true,
              fillColor: colors.backgroundSecondary,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: colors.strokeSubtle)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: colors.strokeSubtle)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: colors.primaryBrand, width: 1.5)),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildSummaryRow(
    String label,
    String value,
    SemanticColors colors, {
    bool isBold = false,
    Color? valueColor,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: isBold ? 17 : 14,
            fontWeight: isBold ? FontWeight.w800 : FontWeight.w500,
            color: isBold ? colors.textPrimary : colors.textSecondary,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: isBold ? 19 : 14,
            fontWeight: isBold ? FontWeight.w800 : FontWeight.w600,
            color: valueColor ?? colors.textPrimary,
          ),
        ),
      ],
    );
  }

  /// Maps material category → icon. Handles both canonical English keys
  /// and Arabic aliases from the backend (defensive bilateral matching).
  static const _kCategoryIcons = <String, IconData>{
    // Canonical English (Oracle / OCDS standard)
    'cement': PhosphorIconsRegular.cube,
    'steel': PhosphorIconsRegular.barbell,
    'electrical': PhosphorIconsRegular.lightning,
    'plumbing': PhosphorIconsRegular.drop,
    'paint': PhosphorIconsRegular.paintRoller,
    'wood': PhosphorIconsRegular.tree,
    // Arabic aliases (backend may send Arabic category names)
    'إسمنت': PhosphorIconsRegular.cube,
    'حديد': PhosphorIconsRegular.barbell,
    'كهرباء': PhosphorIconsRegular.lightning,
    'سباكة': PhosphorIconsRegular.drop,
    'دهان': PhosphorIconsRegular.paintRoller,
    'خشب': PhosphorIconsRegular.tree,
  };

  IconData _getCategoryIcon(String category) {
    return _kCategoryIcons[category.toLowerCase()] ?? PhosphorIconsRegular.package;
  }

  void _confirmClear() {
    showDialog(
      context: context,
      builder: (ctx) {
        final colors = ctx.colors;
        return AlertDialog(
          backgroundColor: colors.surfaceElevated,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(NammerhaTheme.radiusLg),
          ),
          title: Text(
            context.tr('empty_cart'),
            style: TextStyle(color: colors.textPrimary),
          ),
          content: Text(
            context.tr('cart_delete'),
            style: TextStyle(color: colors.textSecondary),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: Text(context.tr('cancel'), style: TextStyle(color: colors.textSecondary)),
            ),
            TextButton(
              onPressed: () {
                CartStore.instance.clear();
                Navigator.pop(ctx);
              },
              child: Text(context.tr('delete'), style: TextStyle(color: colors.error)),
            ),
          ],
        );
      },
    );
  }

  void _proceedToCheckout(TipSelectorState tipState) {
    final items = CartStore.instance.items
        .map((i) => {
              'item_id': i.id,
              'material_name': i.name,
              'quantity': i.quantity,
              'unit_price': i.unitPrice,
              'project_id': i.projectId,
            })
        .toList();

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => EscrowCheckoutScreen(
          basketItems: items,
          totalAmount: CartStore.instance.total.toDouble(),
          tipAmount: _tipAmount(tipState),
        ),
      ),
    );
  }
}
