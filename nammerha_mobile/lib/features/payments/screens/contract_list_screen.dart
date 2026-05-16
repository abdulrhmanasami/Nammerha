import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

import '../../../core/i18n/t.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/utils/format_utils.dart';
import '../../../core/widgets/shimmer_loader.dart';
import '../bloc/contract_payment_bloc.dart';
import '../bloc/contract_payment_event.dart';
import '../bloc/contract_payment_state.dart';
import '../models/service_contract.dart';
import 'contract_details_screen.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Contract List Screen — "عقودي"
/// ═══════════════════════════════════════════════════════════════════════════
/// Shows all service contracts for the current user (as payer or payee).
/// Accessible from Dashboard bento grid.
/// ═══════════════════════════════════════════════════════════════════════════
class ContractListScreen extends StatelessWidget {
  const ContractListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => ContractPaymentBloc()..add(const LoadMyContractsEvent()),
      child: const _ContractListView(),
    );
  }
}

class _ContractListView extends StatelessWidget {
  const _ContractListView();

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text(context.tr('my_contracts')),
      ),
      body: BlocBuilder<ContractPaymentBloc, ContractPaymentState>(
        builder: (context, state) {
          if (state is ContractPaymentLoading) {
            return NammerhaShimmerLoader(colors: colors, itemCount: 4);
          }

          if (state is ContractPaymentError) {
            return _buildError(context, state.message, colors);
          }

          if (state is ContractsListLoaded) {
            if (state.contracts.isEmpty) {
              return _buildEmpty(context, colors);
            }
            return RefreshIndicator(
              onRefresh: () async {
                context.read<ContractPaymentBloc>().add(const LoadMyContractsEvent());
              },
              color: colors.primaryBrand,
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: state.contracts.length,
                itemBuilder: (context, index) {
                  return _buildContractCard(
                    context,
                    state.contracts[index],
                    colors,
                    index,
                  );
                },
              ),
            );
          }

          return const SizedBox.shrink();
        },
      ),
    );
  }

  Widget _buildContractCard(
    BuildContext context,
    ServiceContract contract,
    SemanticColors colors,
    int index,
  ) {
    final statusColor = _statusColor(contract.status, colors);
    final providerIcon = _providerIcon(contract.providerType.apiValue);

    return GestureDetector(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ContractDetailsScreen(contractId: contract.contractId),
          ),
        );
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 14),
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: colors.surfaceElevated,
          borderRadius: BorderRadius.circular(NammerhaTheme.radiusLg),
          border: Border.all(color: colors.strokeSubtle),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header: provider name + status badge
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: colors.primaryBrandLight,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(providerIcon, color: colors.primaryBrand, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        contract.providerName ?? context.tr(contract.providerType.i18nKey),
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: colors.textPrimary,
                        ),
                      ),
                      if (contract.projectTitle != null)
                        Text(
                          contract.projectTitle!,
                          style: TextStyle(fontSize: 12, color: colors.textSecondary),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withAlpha(15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    context.tr(contract.statusI18nKey),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: statusColor,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Payment progress bar
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: contract.paymentProgress,
                minHeight: 8,
                backgroundColor: colors.strokeSubtle,
                color: contract.paymentProgress >= 1.0 ? colors.success : colors.primaryBrand,
              ),
            ),
            const SizedBox(height: 10),

            // Amount info row
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _amountChip(
                  context.tr('total_paid'),
                  FormatUtils.currency(contract.totalPaid),
                  colors.success,
                  colors,
                ),
                _amountChip(
                  context.tr('remaining_balance'),
                  FormatUtils.currency(contract.remainingBalance),
                  colors.warning,
                  colors,
                ),
                _amountChip(
                  context.tr('total_agreed'),
                  FormatUtils.currency(contract.totalAgreedAmount),
                  colors.primaryBrand,
                  colors,
                ),
              ],
            ),

            // Milestones count
            if (contract.milestones.isNotEmpty) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  Icon(PhosphorIconsRegular.flagBanner, size: 14, color: colors.textSecondary),
                  const SizedBox(width: 4),
                  Text(
                    '${contract.completedMilestoneCount}/${contract.milestones.length} ${context.tr('project_milestones')}',
                    style: TextStyle(fontSize: 12, color: colors.textSecondary),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    ).animate(delay: (index * 100).ms).fadeIn().slideY(begin: 0.05);
  }

  Widget _amountChip(String label, String value, Color accent, SemanticColors colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 10, color: colors.textSecondary)),
        Text(
          value,
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: accent),
        ),
      ],
    );
  }

  Widget _buildEmpty(BuildContext context, SemanticColors colors) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(PhosphorIconsRegular.fileText, size: 64, color: colors.textSecondary),
            const SizedBox(height: 16),
            Text(
              context.tr('no_contracts'),
              style: TextStyle(fontSize: 16, color: colors.textSecondary),
            ),
            const SizedBox(height: 8),
            Text(
              context.tr('empty_contracts_subtitle'),
              style: TextStyle(fontSize: 13, color: colors.textSubtle),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: () => Navigator.pop(context),
              icon: const Icon(PhosphorIconsRegular.arrowLeft, size: 18),
              label: Text(context.tr('cta_explore_marketplace')),
              style: ElevatedButton.styleFrom(
                backgroundColor: colors.primaryBrand,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildError(BuildContext context, String msg, SemanticColors colors) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(PhosphorIconsRegular.cloudSlash, size: 64, color: colors.textSecondary),
            const SizedBox(height: 16),
            Text(msg, style: TextStyle(color: colors.error), textAlign: TextAlign.center),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: () =>
                  context.read<ContractPaymentBloc>().add(const LoadMyContractsEvent()),
              icon: const Icon(PhosphorIconsRegular.arrowsClockwise),
              label: Text(context.tr('retry')),
              style: ElevatedButton.styleFrom(backgroundColor: colors.primaryBrand),
            ),
          ],
        ),
      ),
    );
  }

  Color _statusColor(String status, SemanticColors colors) {
    switch (status) {
      case 'active':
        return colors.success;
      case 'completed':
        return colors.info;
      case 'disputed':
        return colors.error;
      case 'cancelled':
        return colors.textSecondary;
      default:
        return colors.warning;
    }
  }

  IconData _providerIcon(String type) {
    switch (type) {
      case 'contractor':
        return PhosphorIconsRegular.hardHat;
      case 'engineer':
        return PhosphorIconsRegular.compass;
      case 'tradesperson':
        return PhosphorIconsRegular.wrench;
      case 'supplier':
        return PhosphorIconsRegular.package;
      default:
        return PhosphorIconsRegular.user;
    }
  }
}
