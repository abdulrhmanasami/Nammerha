import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/services/api_services.dart';
import '../bloc/admin_revenue_bloc.dart';
import '../widgets/admin_kpi_card.dart';
import '../models/admin_models.dart';

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
          'الإيرادات',
          style: TextStyle(fontWeight: FontWeight.w800, color: colors.textHeading),
        ),
        backgroundColor: colors.surfaceElevated,
        elevation: 0,
        iconTheme: IconThemeData(color: colors.textHeading),
      ),
      body: BlocBuilder<AdminRevenueBloc, AdminRevenueState>(
        builder: (context, state) {
          if (state is AdminRevenueLoading) {
            return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
          }
          if (state is AdminRevenueError) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.error_outline_rounded, size: 48, color: colors.error),
                  const SizedBox(height: 12),
                  Text(state.message, style: TextStyle(color: colors.textSecondary)),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: () => context.read<AdminRevenueBloc>().add(LoadRevenueDashboard()),
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('إعادة المحاولة'),
                    style: FilledButton.styleFrom(backgroundColor: colors.primaryBrand),
                  ),
                ],
              ),
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
                title: 'إيرادات العمولات',
                value: summary.totalCommissionRevenue,
                icon: Icons.account_balance_rounded,
                accentColor: colors.primaryBrand,
                isCurrency: true,
              ),
              AdminKpiCard(
                title: 'إيرادات الإكراميات',
                value: summary.totalTipRevenue,
                icon: Icons.volunteer_activism_rounded,
                accentColor: colors.secondaryAccent,
                isCurrency: true,
              ),
              AdminKpiCard(
                title: 'عدد المعاملات',
                value: summary.transactionCount,
                icon: Icons.swap_horiz_rounded,
                accentColor: colors.warmEarth,
              ),
              AdminKpiCard(
                title: 'عمولات الشهر',
                value: summary.mtdCommissions,
                icon: Icons.calendar_month_rounded,
                accentColor: colors.info,
                isCurrency: true,
              ),
            ],
          ),

          const SizedBox(height: 20),

          // Commission Tiers
          _buildSection(
            colors,
            'مستويات العمولة',
            Icons.layers_rounded,
            state.tiers.isEmpty
                ? _emptyState(colors, 'لا توجد مستويات')
                : Column(
                    children: state.tiers.map((t) => _buildTierRow(colors, t)).toList(),
                  ),
          ),

          const SizedBox(height: 16),

          // Recent Commissions
          _buildSection(
            colors,
            'العمولات الأخيرة',
            Icons.receipt_rounded,
            state.commissions.isEmpty
                ? _emptyState(colors, 'لا توجد عمولات')
                : Column(
                    children: state.commissions.map((c) => _buildCommissionRow(colors, c)).toList(),
                  ),
          ),

          const SizedBox(height: 16),

          // Recent Tips
          _buildSection(
            colors,
            'الإكراميات الأخيرة',
            Icons.favorite_rounded,
            state.tips.isEmpty
                ? _emptyState(colors, 'لا توجد إكراميات')
                : Column(
                    children: state.tips.map((t) => _buildTipRow(colors, t)).toList(),
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

  Widget _buildCommissionRow(SemanticColors colors, CommissionEntry entry) {
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
            child: Icon(Icons.receipt_long_rounded, size: 16, color: colors.secondaryAccent),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.sourceType.isNotEmpty ? entry.sourceType : 'عمولة',
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

  Widget _buildTipRow(SemanticColors colors, TipEntry tip) {
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
            child: Icon(Icons.favorite_rounded, size: 16, color: colors.goldFunding),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              tip.donorName.isNotEmpty ? tip.donorName : 'متبرع',
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
