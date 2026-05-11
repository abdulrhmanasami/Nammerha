import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/shimmer_loader.dart';
import '../models/wallet_model.dart';
import '../bloc/wallet_bloc.dart';
import '../bloc/wallet_event.dart';
import '../bloc/wallet_state.dart';
import '../data/wallet_repository.dart';

class WalletScreen extends StatelessWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => WalletBloc(repository: WalletRepository())..add(LoadWalletEvent()),
      child: const _WalletView(),
    );
  }
}

class _WalletView extends StatelessWidget {
  const _WalletView();

  String formatCurrency(num amount) {
    if (amount >= 1000000) {
      return '${(amount / 1000000).toStringAsFixed(1)}M ل.س';
    } else if (amount >= 1000) {
      return '${(amount / 1000).toStringAsFixed(0)}k ل.س';
    }
    return '${amount.toStringAsFixed(0)} ل.س';
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(title: const Text('المحفظة')),
      body: BlocBuilder<WalletBloc, WalletState>(
        builder: (context, state) {
          if (state is WalletLoading || state is WalletInitial) {
            return NammerhaShimmerLoader(colors: colors, itemCount: 4);
          }

          if (state is WalletError) {
            return _buildError(context, state.message, colors);
          }

          if (state is WalletLoaded) {
            final data = state.walletData;
            return RefreshIndicator(
              onRefresh: () async {
                context.read<WalletBloc>().add(LoadWalletEvent());
              },
              color: colors.primaryBrand,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _buildBalanceCard(data.totalLocked, colors),
                  const SizedBox(height: 20),
                  _buildStatsRow(data, colors),
                  const SizedBox(height: 24),
                  _buildTransactionHeader(colors),
                  const SizedBox(height: 12),
                  ...data.transactions.asMap().entries.map(
                    (e) => _buildTransactionItem(e.value, colors, e.key),
                  ),
                  if (data.transactions.isEmpty) _buildEmptyTransactions(colors),
                ],
              ),
            );
          }

          return const SizedBox.shrink();
        },
      ),
    );
  }

  Widget _buildError(BuildContext context, String errorMsg, SemanticColors colors) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(PhosphorIconsRegular.cloudSlash, size: 64, color: colors.textSecondary),
          const SizedBox(height: 16),
          Text(errorMsg, style: TextStyle(color: colors.error, fontSize: 16), textAlign: TextAlign.center),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            onPressed: () => context.read<WalletBloc>().add(LoadWalletEvent()),
            icon: Icon(PhosphorIconsRegular.arrowsClockwise),
            label: const Text('إعادة المحاولة'),
          ),
        ],
      ),
    );
  }

  Widget _buildBalanceCard(num totalLocked, SemanticColors colors) {
    // Replacing raw Colors.white with strict transparency configurations for the gradient
    final textColorLight = const Color(0xFFFFFFFF).withAlpha(180);
    final textColorSolid = const Color(0xFFFFFFFF);
    final bgChipColor = const Color(0xFFFFFFFF).withAlpha(25);

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: NammerhaGradients.brandPrimary,
        borderRadius: BorderRadius.circular(NammerhaTheme.radiusXl),
        boxShadow: const [NammerhaShadows.cta],
      ),
      child: Column(
        children: [
          Text(
            'رصيد الضمان',
            style: TextStyle(fontSize: 14, color: textColorLight),
          ),
          const SizedBox(height: 8),
          Text(
            formatCurrency(totalLocked),
            style: TextStyle(
              fontSize: 36,
              fontWeight: FontWeight.w800,
              color: textColorSolid,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 4),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: bgChipColor,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              'مُحتجز في حساب الضمان',
              style: TextStyle(fontSize: 12, color: textColorLight),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 500.ms).slideY(begin: -0.1, end: 0);
  }

  Widget _buildStatsRow(WalletSummaryModel data, SemanticColors colors) {
    return Row(
      children: [
        _statCard('محتجز', '${data.lockedCount}', colors.warning, colors),
        const SizedBox(width: 10),
        _statCard('مُحرَّر', '${data.releasedCount}', colors.success, colors),
        const SizedBox(width: 10),
        _statCard('مُستردّ', '${data.refundedCount}', colors.info, colors),
      ],
    ).animate(delay: 200.ms).fadeIn();
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
            Text(
              value,
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: accent,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(fontSize: 12, color: colors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTransactionHeader(SemanticColors colors) {
    return Text(
      'سجل المعاملات',
      style: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: colors.textPrimary,
      ),
    );
  }

  Widget _buildTransactionItem(WalletTransactionModel tx, SemanticColors colors, int index) {
    Color statusColor;
    IconData statusIcon;
    String statusLabel;

    switch (tx.status.toLowerCase()) {
      case 'locked':
      case 'pending':
        statusColor = colors.warning;
        statusIcon = PhosphorIconsRegular.lockKey;
        statusLabel = 'محتجز';
        break;
      case 'released':
      case 'completed':
        statusColor = colors.success;
        statusIcon = PhosphorIconsRegular.checkCircle;
        statusLabel = 'مُحرَّر';
        break;
      case 'refunded':
        statusColor = colors.info;
        statusIcon = PhosphorIconsRegular.arrowCounterClockwise;
        statusLabel = 'مُستردّ';
        break;
      default:
        statusColor = colors.textSecondary;
        statusIcon = PhosphorIconsRegular.circle;
        statusLabel = tx.status;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: statusColor.withAlpha(15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(statusIcon, color: statusColor, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tx.materialName,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: colors.textPrimary,
                  ),
                ),
                if (tx.createdAt.isNotEmpty)
                  Text(
                    _formatDate(tx.createdAt),
                    style: TextStyle(fontSize: 12, color: colors.textSubtle),
                  ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                formatCurrency(tx.amount),
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: colors.textPrimary,
                ),
              ),
              Container(
                margin: const EdgeInsets.only(top: 4),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: statusColor.withAlpha(15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  statusLabel,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: statusColor,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    ).animate(delay: (index * 80).ms).fadeIn().slideY(begin: 0.05, end: 0);
  }

  Widget _buildEmptyTransactions(SemanticColors colors) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Column(
        children: [
          Icon(PhosphorIconsRegular.receipt, size: 48, color: colors.textSubtle),
          const SizedBox(height: 12),
          Text(
            'لم تقم بأي تبرع بعد',
            style: TextStyle(fontSize: 15, color: colors.textSecondary),
          ),
        ],
      ),
    );
  }

  String _formatDate(String dateStr) {
    try {
      final dt = DateTime.parse(dateStr);
      return '${dt.year}/${dt.month.toString().padLeft(2, '0')}/${dt.day.toString().padLeft(2, '0')}';
    } catch (_) {
      return dateStr;
    }
  }
}
