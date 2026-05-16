import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/shimmer_loader.dart';
import '../../../core/widgets/bottom_sheet_grabber.dart';
import '../../../core/i18n/t.dart';
import '../../../core/utils/date_utils.dart';
import '../models/wallet_model.dart';
import '../bloc/wallet_bloc.dart';
import '../bloc/wallet_event.dart';
import '../bloc/wallet_state.dart';
import '../data/wallet_repository.dart';

import '../../../core/utils/format_utils.dart';

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

class _WalletView extends StatefulWidget {
  const _WalletView();

  @override
  State<_WalletView> createState() => _WalletViewState();
}

class _WalletViewState extends State<_WalletView> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  /// Wave 4: Infinite scroll trigger — 80% threshold.
  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent * 0.8) {
      context.read<WalletBloc>().add(const LoadMoreTransactionsEvent());
    }
  }

  String formatCurrency(num amount) => FormatUtils.currency(amount);

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(title: Text(context.tr('wallet'))),
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
                controller: _scrollController,
                padding: const EdgeInsets.all(16),
                children: [
                  _buildBalanceCard(context, data.totalLocked, colors),
                  const SizedBox(height: 20),
                  _buildStatsRow(context, data, colors),
                  const SizedBox(height: 24),
                  _buildTransactionHeader(context, colors),
                  const SizedBox(height: 12),
                  ...data.transactions.asMap().entries.map(
                    (e) => _buildTransactionItem(context, e.value, colors, e.key),
                  ),
                  if (data.transactions.isEmpty) _buildEmptyTransactions(context, colors),
                  // Wave 4: Pagination loading footer
                  if (state.isLoadingMore)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      child: Center(
                        child: Text(
                          context.tr('loading_more'),
                          style: TextStyle(color: colors.textSecondary, fontSize: 13),
                        ),
                      ),
                    ),
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
          // AUD-013 FIX: Explicit brand styling — prevents default Material blue
          // on unstyled ElevatedButton. Matches notifications & impact error screens.
          ElevatedButton.icon(
            onPressed: () => context.read<WalletBloc>().add(LoadWalletEvent()),
            icon: Icon(PhosphorIconsRegular.arrowsClockwise),
            label: Text(context.tr('retry')),
            style: ElevatedButton.styleFrom(
              backgroundColor: colors.primaryBrand,
              foregroundColor: Colors.white,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBalanceCard(BuildContext context, num totalLocked, SemanticColors colors) {
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
            context.tr('escrow_balance'),
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
              context.tr('escrow_held'),
              style: TextStyle(fontSize: 12, color: textColorLight),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 500.ms).slideY(begin: -0.1, end: 0);
  }

  Widget _buildStatsRow(BuildContext context, WalletSummaryModel data, SemanticColors colors) {
    return Row(
      children: [
        _statCard(context.tr('escrow_locked_label'), '${data.lockedCount}', colors.warning, colors),
        const SizedBox(width: 10),
        _statCard(context.tr('escrow_released_label'), '${data.releasedCount}', colors.success, colors),
        const SizedBox(width: 10),
        _statCard(context.tr('escrow_refunded_label'), '${data.refundedCount}', colors.info, colors),
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

  Widget _buildTransactionHeader(BuildContext context, SemanticColors colors) {
    return Text(
      context.tr('transaction_log'),
      style: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: colors.textPrimary,
      ),
    );
  }

  Widget _buildTransactionItem(BuildContext context, WalletTransactionModel tx, SemanticColors colors, int index) {
    Color statusColor;
    IconData statusIcon;
    String statusLabel;

    switch (tx.status.toLowerCase()) {
      case 'locked':
      case 'pending':
        statusColor = colors.warning;
        statusIcon = PhosphorIconsRegular.lockKey;
        statusLabel = context.tr('escrow_locked_label');
        break;
      case 'released':
      case 'completed':
        statusColor = colors.success;
        statusIcon = PhosphorIconsRegular.checkCircle;
        statusLabel = context.tr('escrow_released_label');
        break;
      case 'refunded':
        statusColor = colors.info;
        statusIcon = PhosphorIconsRegular.arrowCounterClockwise;
        statusLabel = context.tr('escrow_refunded_label');
        break;
      default:
        statusColor = colors.textSecondary;
        statusIcon = PhosphorIconsRegular.circle;
        statusLabel = tx.status;
    }

    // AUD-027 FIX: Transaction items are now tappable — shows detail sheet.
    return GestureDetector(
      onTap: () => _showTransactionDetail(context, tx, colors, statusColor, statusIcon, statusLabel),
      child: Container(
      margin: const EdgeInsetsDirectional.only(bottom: 10),
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
                    NammerhaDateUtils.relativeTimeFromString(context, tx.createdAt),
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
                margin: const EdgeInsetsDirectional.only(top: 4),
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
      ),
    ).animate(delay: (index * 80).ms).fadeIn().slideY(begin: 0.05, end: 0);
  }

  Widget _buildEmptyTransactions(BuildContext context, SemanticColors colors) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Column(
        children: [
          Icon(PhosphorIconsRegular.receipt, size: 48, color: colors.textSubtle),
          const SizedBox(height: 12),
          Text(
            context.tr('wallet_no_transactions'),
            style: TextStyle(fontSize: 15, color: colors.textSecondary),
          ),
        ],
      ),
    );
  }

  // AUD-027 FIX: Transaction detail bottom sheet.
  // Shows full transaction info: material, amount, status, date, project link.
  void _showTransactionDetail(
    BuildContext context,
    WalletTransactionModel tx,
    SemanticColors colors,
    Color statusColor,
    IconData statusIcon,
    String statusLabel,
  ) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        decoration: BoxDecoration(
          color: colors.surfaceElevated,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            BottomSheetGrabber(colors: colors),
            const SizedBox(height: 16),
            // Header
            Row(
              children: [
                Container(
                  width: 48, height: 48,
                  decoration: BoxDecoration(
                    color: statusColor.withAlpha(15),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(statusIcon, color: statusColor, size: 24),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(tx.materialName, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
                      const SizedBox(height: 2),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: statusColor.withAlpha(15),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(statusLabel, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: statusColor)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            // Details
            _detailRow(context, colors, PhosphorIconsRegular.currencyDollar, context.tr('wallet_amount'), formatCurrency(tx.amount)),
            _detailRow(context, colors, PhosphorIconsRegular.clock, context.tr('wallet_date'), tx.createdAt.isNotEmpty ? NammerhaDateUtils.relativeTimeFromString(context, tx.createdAt) : '—'),
            if (tx.projectTitle.isNotEmpty)
              _detailRow(context, colors, PhosphorIconsRegular.buildings, context.tr('wallet_project'), tx.projectTitle),
            SizedBox(height: MediaQuery.of(context).viewPadding.bottom + 8),
          ],
        ),
      ),
    );
  }

  Widget _detailRow(BuildContext context, SemanticColors colors, IconData icon, String label, String value) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.backgroundPrimary,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: colors.textSubtle),
          const SizedBox(width: 10),
          Text(label, style: TextStyle(fontSize: 12, color: colors.textSubtle)),
          const Spacer(),
          Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.textPrimary)),
        ],
      ),
    );
  }
}
