import 'package:phosphor_flutter/phosphor_flutter.dart';
import '../../../core/widgets/error_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/services/api_services.dart';
import '../bloc/admin_revenue_bloc.dart';
import '../widgets/admin_kpi_card.dart';
import '../models/admin_models.dart';
import '../../../core/i18n/t.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';

/// Admin Revenue Dashboard — Commissions, tips, and revenue KPIs.
class AdminRevenueScreen extends StatelessWidget {
  const AdminRevenueScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => AdminRevenueBloc()..add(LoadRevenueDashboard()),
      child: const _RevenueView(),
    );
  }
}

class _RevenueView extends StatelessWidget {
  const _RevenueView();

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text(
          context.tr('admin_revenue'),
          style: TextStyle(fontWeight: FontWeight.w800, color: colors.textHeading),
        ),
        backgroundColor: colors.surfaceElevated,
        elevation: 0,
        iconTheme: IconThemeData(color: colors.textHeading),
      ),
      body: BlocBuilder<AdminRevenueBloc, AdminRevenueState>(
        builder: (context, state) {
          if (state is AdminRevenueLoading) {
            return NammerhaShimmerLoader(colors: colors);
          }
          if (state is AdminRevenueError) {
            return NammerhaErrorState(
              message: state.message,
              onRetry: () => context.read<AdminRevenueBloc>().add(LoadRevenueDashboard()),
              iconSize: 48,
            );
          }
          if (state is AdminRevenueLoaded) {
            return _buildLoaded(context, state);
          }
          return const SizedBox.shrink();
        },
      ),
    );
  }

  Widget _buildLoaded(BuildContext context, AdminRevenueLoaded state) {
    final colors = context.colors;
    final summary = state.summary;

    return RefreshIndicator(
      color: colors.primaryBrand,
      onRefresh: () async {
        context.read<AdminRevenueBloc>().add(LoadRevenueDashboard());
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // KPI Cards
          GridView.count(
            crossAxisCount: 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            children: [
              AdminKpiCard(
                title: context.tr('admin_revenue_commission'),
                value: summary.totalCommissionRevenue,
                icon: PhosphorIconsRegular.bank,
                accentColor: colors.primaryBrand,
                isCurrency: true,
              ),
              AdminKpiCard(
                title: context.tr('admin_revenue_tips'),
                value: summary.totalTipRevenue,
                icon: PhosphorIconsRegular.heart,
                accentColor: colors.secondaryAccent,
                isCurrency: true,
              ),
              AdminKpiCard(
                title: context.tr('admin_revenue_transactions'),
                value: summary.transactionCount,
                icon: PhosphorIconsRegular.receipt,
                accentColor: colors.warmEarth,
              ),
              AdminKpiCard(
                title: context.tr('admin_revenue_monthly'),
                value: summary.mtdCommissions,
                icon: PhosphorIconsRegular.calendarBlank,
                accentColor: colors.info,
                isCurrency: true,
              ),
            ],
          ),

          const SizedBox(height: 20),

          // Commission Tiers
          _buildSection(
            colors,
            context.tr('admin_revenue_tiers'),
            PhosphorIconsRegular.stack,
            state.tiers.isEmpty
                ? _emptyState(colors, context.tr('admin_no_tiers'))
                : Column(
                    children: state.tiers.map((t) => _buildTierRow(colors, t)).toList(),
                  ),
          ),

          const SizedBox(height: 16),

          // Recent Commissions
          _buildSection(
            colors,
            context.tr('admin_revenue_recent_commissions'),
            PhosphorIconsRegular.receipt,
            state.commissions.isEmpty
                ? _emptyState(colors, context.tr('admin_no_commissions'))
                : Column(
                    children: state.commissions.map((c) => _buildCommissionRow(context, colors, c)).toList(),
                  ),
          ),

          const SizedBox(height: 16),

          // Recent Tips
          _buildSection(
            colors,
            context.tr('admin_revenue_recent_tips'),
            PhosphorIconsRegular.heart,
            state.tips.isEmpty
                ? _emptyState(colors, context.tr('admin_no_tips'))
                : Column(
                    children: state.tips.map((t) => _buildTipRow(context, colors, t)).toList(),
                  ),
          ),

          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _buildSection(SemanticColors colors, String title, IconData icon, Widget content) {
    return Container(
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.strokeBorder.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Icon(icon, size: 18, color: colors.primaryBrand),
                const SizedBox(width: 8),
                Text(
                  title,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textHeading),
                ),
              ],
            ),
          ),
          content,
          const SizedBox(height: 8),
        ],
      ),
    );
  }

  Widget _emptyState(SemanticColors colors, String text) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Center(child: Text(text, style: TextStyle(color: colors.textMuted, fontSize: 13))),
    );
  }

  Widget _buildTierRow(SemanticColors colors, CommissionTier tier) {
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 4, 16, 4),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: tier.isActive ? colors.success : colors.textMuted,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              tier.tierName.isNotEmpty ? tier.tierName : tier.tierId,
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.textPrimary),
            ),
          ),
          Container(
            padding: const EdgeInsetsDirectional.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: colors.primaryBrandLight,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              tier.ratePercent,
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: colors.primaryBrand),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCommissionRow(BuildContext context, SemanticColors colors, CommissionEntry entry) {
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 6, 16, 6),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: colors.secondaryAccentLight,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(PhosphorIconsRegular.receipt, size: 16, color: colors.secondaryAccent),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.sourceType.isNotEmpty ? entry.sourceType : context.tr('admin_revenue_commission_label'),
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: colors.textPrimary),
                ),
                Text(
                  '${(entry.rateBps / 100).toStringAsFixed(1)}%',
                  style: TextStyle(fontSize: 10, color: colors.textMuted),
                ),
              ],
            ),
          ),
          Text(
            formatCurrency(entry.amountCents),
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: colors.success),
          ),
        ],
      ),
    );
  }

  Widget _buildTipRow(BuildContext context, SemanticColors colors, TipEntry tip) {
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 6, 16, 6),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: colors.warningLight,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(PhosphorIconsRegular.heart, size: 16, color: colors.goldFunding),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              tip.funderName.isNotEmpty ? tip.funderName : context.tr('admin_revenue_funder_label'),
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: colors.textPrimary),
            ),
          ),
          Text(
            formatCurrency(tip.amountCents),
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: colors.secondaryAccent),
          ),
        ],
      ),
    );
  }
}
