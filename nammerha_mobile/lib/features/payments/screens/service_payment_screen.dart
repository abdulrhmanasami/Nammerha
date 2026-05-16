import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/i18n/t.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/utils/format_utils.dart';
import '../../../core/widgets/gradient_button.dart';
import '../bloc/contract_payment_bloc.dart';
import '../bloc/contract_payment_event.dart';
import '../bloc/contract_payment_state.dart';
import '../models/contract_milestone.dart';
import '../models/payment_enums.dart';
import '../models/service_contract.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Service Payment Screen — Unified payment for all provider types
/// ═══════════════════════════════════════════════════════════════════════════
/// Step 1: Select payment method (Fatora / Cash / Bank Transfer)
/// Step 2: Select milestone or enter custom amount
/// Step 3: Confirm + process
/// ═══════════════════════════════════════════════════════════════════════════
class ServicePaymentScreen extends StatelessWidget {
  final ServiceContract contract;
  const ServicePaymentScreen({super.key, required this.contract});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => ContractPaymentBloc()..add(LoadContractDetailsEvent(contract.contractId)),
      child: _ServicePaymentView(contract: contract),
    );
  }
}

class _ServicePaymentView extends StatefulWidget {
  final ServiceContract contract;
  const _ServicePaymentView({required this.contract});

  @override
  State<_ServicePaymentView> createState() => _ServicePaymentViewState();
}

class _ServicePaymentViewState extends State<_ServicePaymentView> {
  final _amountController = TextEditingController();
  final _noteController = TextEditingController();
  bool _useCustomAmount = false;

  @override
  void dispose() {
    _amountController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(title: Text(context.tr('new_payment'))),
      body: BlocConsumer<ContractPaymentBloc, ContractPaymentState>(
        listener: (context, state) async {
          if (state is PaymentCreated) {
            HapticFeedback.heavyImpact();
            // For Fatora: open checkout URL
            if (state.checkoutUrl != null) {
              final url = Uri.parse(state.checkoutUrl!);
              if (await canLaunchUrl(url)) {
                await launchUrl(url, mode: LaunchMode.externalApplication);
              }
            }
            if (context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(context.tr('payment_recorded')),
                  backgroundColor: colors.success,
                ),
              );
              Navigator.pop(context, true);
            }
          }
          if (state is ContractPaymentError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.message), backgroundColor: colors.error),
            );
          }
        },
        buildWhen: (prev, curr) => curr is ContractDetailsLoaded || curr is ContractPaymentLoading,
        builder: (context, state) {
          if (state is ContractPaymentLoading) {
            return _buildPaymentShimmer(colors);
          }
          if (state is ContractDetailsLoaded) {
            return _buildForm(context, state, colors);
          }
          return const SizedBox.shrink();
        },
      ),
    );
  }

  Widget _buildForm(BuildContext context, ContractDetailsLoaded state, SemanticColors colors) {
    final c = state.contract;
    final selectedMethod = state.selectedMethod;

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Provider summary
            _buildProviderHeader(context, c, colors),
            const SizedBox(height: 24),

            // Payment method selector
            Text(context.tr('select_payment_method'),
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
            const SizedBox(height: 12),
            _buildMethodSelector(context, selectedMethod, colors),
            const SizedBox(height: 24),

            // Milestone selector (if milestones exist)
            if (c.milestones.isNotEmpty && !_useCustomAmount) ...[
              Text(context.tr('select_milestone'),
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
              const SizedBox(height: 12),
              ...c.milestones.where((m) => m.isPayable || m.isInProgress || m.isPending).map(
                    (m) => _buildMilestoneOption(context, m, state.selectedMilestoneId, colors),
                  ),
              const SizedBox(height: 12),
              Center(
                child: TextButton(
                  onPressed: () {
                    setState(() => _useCustomAmount = true);
                    context.read<ContractPaymentBloc>().add(const SelectMilestoneEvent(null));
                  },
                  child: Text(context.tr('or_enter_amount'),
                      style: TextStyle(color: colors.primaryBrand, fontWeight: FontWeight.w600)),
                ),
              ),
            ],

            // Custom amount input
            if (c.milestones.isEmpty || _useCustomAmount) ...[
              if (_useCustomAmount && c.milestones.isNotEmpty)
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: TextButton.icon(
                    onPressed: () => setState(() => _useCustomAmount = false),
                    icon: Icon(PhosphorIconsRegular.arrowLeft, size: 16, color: colors.primaryBrand),
                    label: Text(context.tr('select_milestone'),
                        style: TextStyle(color: colors.primaryBrand)),
                  ),
                ),
              Text(context.tr('or_enter_amount'),
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
              const SizedBox(height: 12),
              TextField(
                controller: _amountController,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: InputDecoration(
                  filled: true,
                  fillColor: colors.surfaceElevated,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
                    borderSide: BorderSide(color: colors.strokeBorder),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
                    borderSide: BorderSide(color: colors.strokeSubtle),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
                    borderSide: BorderSide(color: colors.primaryBrand, width: 2),
                  ),
                  suffixText: context.tr('currency_suffix'),
                  suffixStyle: TextStyle(color: colors.textSecondary, fontWeight: FontWeight.w600),
                  hintText: '0',
                  hintStyle: TextStyle(color: colors.textSubtle),
                ),
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: colors.textPrimary),
                onChanged: (val) {
                  final amount = int.tryParse(val) ?? 0;
                  context.read<ContractPaymentBloc>().add(UpdateCustomAmountEvent(amount));
                },
              ),
            ],
            const SizedBox(height: 20),

            // Note input (for Cash/Transfer)
            if (selectedMethod != PaymentMethod.fatora) ...[
              Text(context.tr('add_note'),
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.textSecondary)),
              const SizedBox(height: 8),
              TextField(
                controller: _noteController,
                maxLines: 2,
                decoration: InputDecoration(
                  filled: true,
                  fillColor: colors.surfaceElevated,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
                    borderSide: BorderSide(color: colors.strokeSubtle),
                  ),
                  hintStyle: TextStyle(color: colors.textSubtle),
                ),
                style: TextStyle(color: colors.textPrimary),
              ),
              const SizedBox(height: 24),
            ],

            // Submit button
            GradientButton(
              label: context.tr('confirm_payment'),
              icon: PhosphorIconsRegular.checkCircle,
              onPressed: () => _submitPayment(context, state),
            ),
            const SizedBox(height: 16),

            // Trust badge
            Row(
              children: [
                Icon(PhosphorIconsRegular.shield, color: colors.success, size: 16),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    selectedMethod == PaymentMethod.fatora
                        ? context.tr('pay_method_fatora_desc')
                        : context.tr('pay_method_cash_desc'),
                    style: TextStyle(fontSize: 11, color: colors.textSecondary, height: 1.4),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProviderHeader(BuildContext context, ServiceContract c, SemanticColors colors) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Row(
        children: [
          Icon(_providerIcon(c.providerType.apiValue), color: colors.primaryBrand, size: 28),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  c.providerName ?? context.tr(c.providerType.i18nKey),
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary),
                ),
                if (c.projectTitle != null)
                  Text(c.projectTitle!, style: TextStyle(fontSize: 12, color: colors.textSecondary)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(FormatUtils.currency(c.remainingBalance),
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: colors.warning)),
              Text(context.tr('remaining_balance'),
                  style: TextStyle(fontSize: 10, color: colors.textSecondary)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMethodSelector(BuildContext context, PaymentMethod selected, SemanticColors colors) {
    return Row(
      children: PaymentMethod.values.map((method) {
        final isSelected = method == selected;
        return Expanded(
          child: GestureDetector(
            onTap: () {
              HapticFeedback.selectionClick();
              context.read<ContractPaymentBloc>().add(SelectPaymentMethodEvent(method));
            },
            child: AnimatedContainer(
              duration: NammerhaAnimations.fast,
              margin: const EdgeInsetsDirectional.only(end: 8),
              padding: const EdgeInsets.symmetric(vertical: 14),
              decoration: BoxDecoration(
                color: isSelected ? colors.primaryBrandLight : colors.surfaceElevated,
                borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
                border: Border.all(
                  color: isSelected ? colors.primaryBrand : colors.strokeSubtle,
                  width: isSelected ? 2 : 1,
                ),
              ),
              child: Column(
                children: [
                  Icon(_methodIcon(method), color: isSelected ? colors.primaryBrand : colors.textSecondary, size: 24),
                  const SizedBox(height: 6),
                  Text(
                    context.tr(method.i18nKey),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                      color: isSelected ? colors.primaryBrand : colors.textSecondary,
                    ),
                    textAlign: TextAlign.center,
                    maxLines: 2,
                  ),
                ],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildMilestoneOption(
      BuildContext context, ContractMilestone m, String? selectedId, SemanticColors colors) {
    final isSelected = m.milestoneId == selectedId;
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        context.read<ContractPaymentBloc>().add(SelectMilestoneEvent(m.milestoneId));
      },
      child: AnimatedContainer(
        duration: NammerhaAnimations.fast,
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isSelected ? colors.primaryBrandLight : colors.surfaceElevated,
          borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
          border: Border.all(
            color: isSelected ? colors.primaryBrand : colors.strokeSubtle,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(
              isSelected ? PhosphorIconsRegular.radioButton : PhosphorIconsRegular.circle,
              color: isSelected ? colors.primaryBrand : colors.textSecondary,
              size: 20,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(m.title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.textPrimary)),
                  Text('${m.percentage.toStringAsFixed(0)}% — ${FormatUtils.currency(m.amount)}',
                      style: TextStyle(fontSize: 12, color: colors.textSecondary)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _submitPayment(BuildContext context, ContractDetailsLoaded state) {
    int amount;
    String? milestoneId;

    if (_useCustomAmount || state.contract.milestones.isEmpty) {
      amount = int.tryParse(_amountController.text) ?? 0;
      if (amount <= 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.tr('or_enter_amount'))),
        );
        return;
      }
    } else {
      milestoneId = state.selectedMilestoneId;
      if (milestoneId == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.tr('select_milestone'))),
        );
        return;
      }
      final milestone = state.contract.milestones.firstWhere((m) => m.milestoneId == milestoneId);
      amount = milestone.amount;
    }

    context.read<ContractPaymentBloc>().add(CreatePaymentEvent(
      contractId: state.contract.contractId,
      amount: amount,
      method: state.selectedMethod,
      milestoneId: milestoneId,
      confirmationNote: _noteController.text.isNotEmpty ? _noteController.text : null,
    ));
  }

  IconData _methodIcon(PaymentMethod m) {
    switch (m) {
      case PaymentMethod.fatora: return PhosphorIconsRegular.creditCard;
      case PaymentMethod.cash: return PhosphorIconsRegular.money;
      case PaymentMethod.bankTransfer: return PhosphorIconsRegular.bank;
    }
  }

  IconData _providerIcon(String t) {
    switch (t) {
      case 'contractor': return PhosphorIconsRegular.hardHat;
      case 'engineer': return PhosphorIconsRegular.compass;
      case 'tradesperson': return PhosphorIconsRegular.wrench;
      default: return PhosphorIconsRegular.package;
    }
  }

  // ─── P0-002: Payment Form Skeleton Shimmer ──────────────────────────
  // Mirrors the actual form layout (provider header → method selector →
  // milestone items → submit) to maximize perceived-performance illusion.
  Widget _buildPaymentShimmer(SemanticColors colors) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Provider header skeleton ──
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: colors.surfaceElevated,
              borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
              border: Border.all(color: colors.strokeSubtle.withAlpha(100)),
            ),
            child: Row(
              children: [
                _shimmerBox(colors, width: 28, height: 28, radius: 8),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _shimmerBox(colors, width: 120, height: 16),
                      const SizedBox(height: 6),
                      _shimmerBox(colors, width: 80, height: 12),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    _shimmerBox(colors, width: 70, height: 16),
                    const SizedBox(height: 4),
                    _shimmerBox(colors, width: 50, height: 10),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // ── Section title skeleton ──
          _shimmerBox(colors, width: 140, height: 16),
          const SizedBox(height: 12),

          // ── Payment method selector skeleton (3 cards) ──
          Row(
            children: List.generate(3, (i) => Expanded(
              child: Container(
                margin: const EdgeInsetsDirectional.only(end: 8),
                padding: const EdgeInsets.symmetric(vertical: 14),
                decoration: BoxDecoration(
                  color: colors.surfaceElevated,
                  borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
                  border: Border.all(color: colors.strokeSubtle.withAlpha(100)),
                ),
                child: Column(
                  children: [
                    _shimmerBox(colors, width: 24, height: 24, radius: 6),
                    const SizedBox(height: 6),
                    _shimmerBox(colors, width: 40, height: 11),
                  ],
                ),
              ),
            )),
          ),
          const SizedBox(height: 24),

          // ── Milestone section title ──
          _shimmerBox(colors, width: 120, height: 16),
          const SizedBox(height: 12),

          // ── Milestone items skeleton ──
          ...List.generate(2, (i) => Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: colors.surfaceElevated,
              borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
              border: Border.all(color: colors.strokeSubtle.withAlpha(100)),
            ),
            child: Row(
              children: [
                _shimmerBox(colors, width: 20, height: 20, radius: 10),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _shimmerBox(colors, width: 140, height: 14),
                      const SizedBox(height: 6),
                      _shimmerBox(colors, width: 100, height: 12),
                    ],
                  ),
                ),
              ],
            ),
          )),
          const SizedBox(height: 24),

          // ── Submit button skeleton ──
          _shimmerBox(colors, width: double.infinity, height: 50, radius: NammerhaTheme.radiusLg),
          const SizedBox(height: 16),

          // ── Trust badge skeleton ──
          Row(
            children: [
              _shimmerBox(colors, width: 16, height: 16, radius: 8),
              const SizedBox(width: 6),
              Expanded(child: _shimmerBox(colors, width: double.infinity, height: 11)),
            ],
          ),
        ],
      ),
    ).animate(onPlay: (controller) => controller.repeat()).shimmer(
      duration: 1500.ms,
      color: colors.primaryBrand.withAlpha(20),
    );
  }

  Widget _shimmerBox(SemanticColors colors, {
    required double width,
    required double height,
    double radius = 4,
  }) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: colors.textSubtle.withAlpha(30),
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}
