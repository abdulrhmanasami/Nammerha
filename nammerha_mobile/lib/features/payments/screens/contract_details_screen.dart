import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

import '../../../core/i18n/t.dart';
import '../../../core/widgets/error_state.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/utils/format_utils.dart';
import '../../../core/widgets/shimmer_loader.dart';
import '../bloc/contract_payment_bloc.dart';
import '../bloc/contract_payment_event.dart';
import '../bloc/contract_payment_state.dart';
import '../models/contract_milestone.dart';
import '../models/contract_payment.dart';
import '../models/payment_enums.dart';
import '../models/service_contract.dart';
import 'service_payment_screen.dart';
import '../../../core/utils/animation_budget.dart';

/// Contract Details Screen — shows milestones, payment progress, and history.
class ContractDetailsScreen extends StatelessWidget {
  final String contractId;
  const ContractDetailsScreen({super.key, required this.contractId});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => ContractPaymentBloc()..add(LoadContractDetailsEvent(contractId)),
      child: _ContractDetailsView(contractId: contractId),
    );
  }
}

class _ContractDetailsView extends StatelessWidget {
  final String contractId;
  const _ContractDetailsView({required this.contractId});

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(title: Text(context.tr('contract_details'))),
      body: BlocConsumer<ContractPaymentBloc, ContractPaymentState>(
        
        // PLAT-UX-007 FIX: Prevent Screen Wipeout Blink
        buildWhen: (previous, current) {
          if (current is ContractPaymentLoading || current is ContractDetailsLoaded) return true;
          if (current is ContractPaymentError && previous is! ContractDetailsLoaded) return true;
          return false;
        },
        listener: (context, state) {
          if (state is PaymentCreated) {
            HapticFeedback.mediumImpact();
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(context.tr('payment_recorded')),
                backgroundColor: colors.success,
              ),
            );
          }
          if (state is PaymentConfirmed) {
            HapticFeedback.heavyImpact();
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(context.tr('payment_confirmed')),
                backgroundColor: colors.success,
              ),
            );
          }
        },
        builder: (context, state) {
          if (state is ContractPaymentLoading) {
            return NammerhaShimmerLoader(colors: colors, isList: false);
          }
          if (state is ContractPaymentError) {
            return _buildError(context, state.message, colors);
          }
          if (state is ContractDetailsLoaded) {
            return _buildContent(context, state.contract, colors);
          }
          return const SizedBox.shrink();
        },
      ),
      floatingActionButton: BlocBuilder<ContractPaymentBloc, ContractPaymentState>(
        builder: (context, state) {
          if (state is ContractDetailsLoaded && state.contract.isActive) {
            return FloatingActionButton.extended(
              onPressed: () => _openPaymentScreen(context, state.contract),
              backgroundColor: colors.primaryBrand,
              foregroundColor: Colors.white,
              icon: const Icon(PhosphorIconsRegular.money, size: 20),
              label: Text(context.tr('new_payment')),
            );
          }
          return const SizedBox.shrink();
        },
      ),
    );
  }

  void _openPaymentScreen(BuildContext context, ServiceContract contract) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ServicePaymentScreen(contract: contract),
      ),
    ).then((_) {
      if (context.mounted) {
        context.read<ContractPaymentBloc>().add(LoadContractDetailsEvent(contractId));
      }
    });
  }

  Widget _buildContent(BuildContext context, ServiceContract contract, SemanticColors colors) {
    return RefreshIndicator(
      onRefresh: () async {
        context.read<ContractPaymentBloc>().add(LoadContractDetailsEvent(contractId));
      },
      color: colors.primaryBrand,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildSummaryCard(context, contract, colors),
          const SizedBox(height: 20),
          _buildProgressSection(context, contract, colors),
          const SizedBox(height: 24),
          if (contract.milestones.isNotEmpty) ...[
            _buildMilestonesSection(context, contract, colors),
            const SizedBox(height: 24),
          ],
          _buildPaymentHistory(context, contract, colors),
          const SizedBox(height: 80),
        ],
      ),
    );
  }

  Widget _buildSummaryCard(BuildContext context, ServiceContract c, SemanticColors colors) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: NammerhaGradients.brandPrimary,
        borderRadius: BorderRadius.circular(NammerhaTheme.radiusXl),
        boxShadow: const [NammerhaShadows.cta],
      ),
      child: Column(
        children: [
          Row(
            children: [
              Icon(_providerIcon(c.providerType.apiValue), color: Colors.white, size: 24),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  '${context.tr('contract_with')} ${c.providerName ?? context.tr(c.providerType.i18nKey)}',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            FormatUtils.currency(c.totalAgreedAmount),
            style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: Colors.white),
          ),
          const SizedBox(height: 4),
          Text(
            context.tr('total_agreed'),
            style: TextStyle(fontSize: 13, color: Colors.white.withAlpha(180)),
          ),
        ],
      ),
    ).nmAnimate(context).fadeIn(duration: 500.ms).slideY(begin: -0.1);
  }

  Widget _buildProgressSection(BuildContext context, ServiceContract c, SemanticColors colors) {
    return Row(
      children: [
        _statCard(context.tr('total_paid'), FormatUtils.currency(c.totalPaid), colors.success, colors),
        const SizedBox(width: 10),
        _statCard(context.tr('remaining_balance'), FormatUtils.currency(c.remainingBalance), colors.warning, colors),
      ],
    ).nmAnimate(context, delay: 200.ms).fadeIn();
  }

  Widget _statCard(String label, String value, Color accent, SemanticColors colors) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: colors.surfaceElevated,
          borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
          border: Border.all(color: colors.strokeSubtle),
        ),
        child: Column(
          children: [
            Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: accent)),
            const SizedBox(height: 4),
            Text(label, style: TextStyle(fontSize: 12, color: colors.textSecondary)),
          ],
        ),
      ),
    );
  }

  Widget _buildMilestonesSection(BuildContext context, ServiceContract c, SemanticColors colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(PhosphorIconsRegular.flagBanner, color: colors.primaryBrand, size: 20),
            const SizedBox(width: 8),
            Text(context.tr('project_milestones'), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.textPrimary)),
          ],
        ),
        const SizedBox(height: 14),
        ...c.milestones.asMap().entries.map((e) => _buildMilestoneCard(context, e.value, e.key, c, colors)),
      ],
    );
  }

  Widget _buildMilestoneCard(BuildContext context, ContractMilestone m, int idx, ServiceContract c, SemanticColors colors) {
    final statusColor = _milestoneStatusColor(m.status, colors);
    final isLocked = idx > 0 && !c.milestones[idx - 1].isCompleted && m.isPending;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isLocked ? colors.backgroundSecondary : colors.surfaceElevated,
        borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
        border: Border.all(color: isLocked ? colors.strokeSubtle : statusColor.withAlpha(40), width: m.isCompleted ? 2 : 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32, height: 32,
                decoration: BoxDecoration(color: statusColor.withAlpha(20), borderRadius: BorderRadius.circular(8)),
                child: Center(child: Text('${idx + 1}', style: TextStyle(fontWeight: FontWeight.w800, color: statusColor))),
              ),
              const SizedBox(width: 10),
              Expanded(child: Text(m.title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: statusColor.withAlpha(15), borderRadius: BorderRadius.circular(6)),
                child: Text(context.tr(m.statusI18nKey), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: statusColor)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(FormatUtils.currency(m.amount), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.primaryBrand)),
              Text('${m.percentage.toStringAsFixed(0)}% ${context.tr('milestone_of_total')}', style: TextStyle(fontSize: 11, color: colors.textSecondary)),
            ],
          ),
          if (m.gpsVerified) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(PhosphorIconsRegular.mapPin, size: 14, color: colors.success),
                const SizedBox(width: 4),
                Text(context.tr('gps_verified'), style: TextStyle(fontSize: 11, color: colors.success, fontWeight: FontWeight.w600)),
              ],
            ),
          ],
          if (isLocked) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(PhosphorIconsRegular.lockKey, size: 14, color: colors.textSecondary),
                const SizedBox(width: 4),
                Text(context.tr('milestone_locked'), style: TextStyle(fontSize: 11, color: colors.textSecondary)),
              ],
            ),
          ],
        ],
      ),
    ).nmAnimate(context, delay: (idx * 100).ms).fadeIn().slideY(begin: 0.03);
  }

  Widget _buildPaymentHistory(BuildContext context, ServiceContract c, SemanticColors colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(PhosphorIconsRegular.receipt, color: colors.primaryBrand, size: 20),
            const SizedBox(width: 8),
            Text(context.tr('payment_history'), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.textPrimary)),
          ],
        ),
        const SizedBox(height: 14),
        if (c.payments.isEmpty)
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 32),
              child: Column(
                children: [
                  Icon(PhosphorIconsRegular.receipt, size: 48, color: colors.textSubtle),
                  const SizedBox(height: 12),
                  Text(context.tr('no_payments_yet'), style: TextStyle(fontSize: 14, color: colors.textSecondary)),
                ],
              ),
            ),
          )
        else
          ...c.payments.asMap().entries.map((e) => _buildPaymentItem(context, e.value, e.key, colors)),
      ],
    );
  }

  Widget _buildPaymentItem(BuildContext context, ContractPayment p, int idx, SemanticColors colors) {
    final methodIcon = _methodIcon(p.method);
    final statusColor = _paymentStatusColor(p.status, colors);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Row(
        children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(color: statusColor.withAlpha(15), borderRadius: BorderRadius.circular(10)),
            child: Icon(methodIcon, color: statusColor, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(context.tr(p.method.i18nKey), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.textPrimary)),
                Text(context.tr(p.status.i18nKey), style: TextStyle(fontSize: 11, color: statusColor)),
              ],
            ),
          ),
          Text(FormatUtils.currency(p.amount), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary)),
        ],
      ),
    ).nmAnimate(context, delay: (idx * 60).ms).fadeIn();
  }

  Widget _buildError(BuildContext context, String msg, SemanticColors colors) {
    return NammerhaErrorState(
      message: msg,
      onRetry: () => context.read<ContractPaymentBloc>().add(LoadContractDetailsEvent(contractId)),
    );
  }

  Color _milestoneStatusColor(String s, SemanticColors c) {
    switch (s) {
      case 'completed': return c.success;
      case 'in_progress': return c.primaryBrand;
      case 'verification': return c.warning;
      case 'disputed': return c.error;
      default: return c.textSecondary;
    }
  }

  Color _paymentStatusColor(PaymentStatus s, SemanticColors c) {
    switch (s) {
      case PaymentStatus.completed: return c.success;
      case PaymentStatus.payerConfirmed:
      case PaymentStatus.payeeConfirmed: return c.warning;
      case PaymentStatus.disputed: return c.error;
      case PaymentStatus.cancelled: return c.textSecondary;
      default: return c.info;
    }
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
}
