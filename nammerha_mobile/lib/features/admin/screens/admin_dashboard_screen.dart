import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/semantic_colors.dart';
import '../bloc/admin_dashboard_bloc.dart';
import '../widgets/admin_kpi_card.dart';
import '../widgets/admin_stat_chart.dart';
import '../models/admin_models.dart';
import '../../../core/i18n/t.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';

/// Admin Dashboard — Platform Command Center
/// KPIs + bar charts + projects table + audit trail.
class AdminDashboardScreen extends StatelessWidget {
  const AdminDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => AdminDashboardBloc()..add(LoadDashboard()),
      child: const _DashboardView(),
    );
  }
}

class _DashboardView extends StatelessWidget {
  const _DashboardView();

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text(
          context.tr('ad_command_center'),
          style: TextStyle(fontWeight: FontWeight.w800, color: colors.textHeading),
        ),
        backgroundColor: colors.surfaceElevated,
        elevation: 0,
        iconTheme: IconThemeData(color: colors.textHeading),
        actions: [
          IconButton(
            icon: Icon(PhosphorIconsRegular.arrowsClockwise, color: colors.primaryBrand),
            onPressed: () => context.read<AdminDashboardBloc>().add(RefreshDashboard()),
          ),
        ],
      ),
      body: BlocBuilder<AdminDashboardBloc, AdminDashboardState>(
        builder: (context, state) {
          if (state is AdminDashboardLoading) {
            return NammerhaShimmerLoader(colors: colors);
          }
          if (state is AdminDashboardError) {
            return _buildError(context, state.message);
          }
          if (state is AdminDashboardLoaded) {
            return _buildLoaded(context, state);
          }
          return const SizedBox.shrink();
        },
      ),
    );
  }

  Widget _buildError(BuildContext context, String message) {
    final colors = context.colors;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(PhosphorIconsRegular.cloudSlash, size: 48, color: colors.error),
          const SizedBox(height: 12),
          Text(message, style: TextStyle(color: colors.textSecondary, fontSize: 14)),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: () => context.read<AdminDashboardBloc>().add(LoadDashboard()),
            icon: Icon(PhosphorIconsRegular.arrowsClockwise),
            label: Text(context.tr('ct_retry')),
            style: FilledButton.styleFrom(backgroundColor: colors.primaryBrand),
          ),
        ],
      ),
    );
  }

  Widget _buildLoaded(BuildContext context, AdminDashboardLoaded state) {
    final colors = context.colors;
    final overview = state.overview;

    return RefreshIndicator(
      color: colors.primaryBrand,
      onRefresh: () async {
        context.read<AdminDashboardBloc>().add(RefreshDashboard());
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ─── KPI Grid ───────────────────────────────────────
          GridView.count(
            crossAxisCount: 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            children: [
              AdminKpiCard(
                title: context.tr('ad_total_funding'),
                value: overview.totalFundedAmount,
                icon: PhosphorIconsRegular.currencyDollar,
                accentColor: colors.primaryBrand,
                isCurrency: true,
              ),
              AdminKpiCard(
                title: context.tr('ad_active_projects'),
                value: overview.totalProjects,
                icon: PhosphorIconsRegular.buildings,
                accentColor: colors.secondaryAccent,
              ),
              AdminKpiCard(
                title: context.tr('admin_engineers'),
                value: overview.activeEngineers,
                icon: PhosphorIconsRegular.hardHat,
                accentColor: colors.warmEarth,
              ),
              AdminKpiCard(
                title: context.tr('ad_verified_proofs'),
                value: overview.verifiedProofs,
                icon: PhosphorIconsRegular.sealCheck,
                accentColor: colors.success,
              ),
            ],
          ),

          const SizedBox(height: 20),

          // ─── Summary Row ────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: colors.surfaceElevated,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: colors.strokeBorder.withValues(alpha: 0.5)),
            ),
            child: Row(
              children: [
                _buildMiniStat(colors, context.tr('admin_users'), overview.totalUsers.toString(), PhosphorIconsRegular.users),
                _divider(colors),
                _buildMiniStat(colors, context.tr('admin_funding'), overview.totalDonations.toString(), PhosphorIconsRegular.heart),
                _divider(colors),
                _buildMiniStat(colors, context.tr('admin_contractors'), overview.activeContractors.toString(), PhosphorIconsRegular.wrench),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // ─── Charts ─────────────────────────────────────────
          AdminStatChart(
            title: context.tr('ad_projects_by_month'),
            data: state.projectsByMonth.map((p) => ChartDataPoint(
              label: p.month,
              value: p.count.toDouble(),
            )).toList(),
            barColor: colors.primaryBrand,
          ),

          const SizedBox(height: 16),

          AdminStatChart(
            title: context.tr('ad_funding_by_month'),
            data: state.fundingByMonth.map((d) => ChartDataPoint(
              label: d.month,
              value: (d.totalAmount / 100).toDouble(),
            )).toList(),
            barColor: colors.secondaryAccent,
          ),

          const SizedBox(height: 20),

          // ─── Recent Audit Trail ─────────────────────────────
          Container(
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
                  child: Text(
                    context.tr('ad_audit_trail'),
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: colors.textHeading,
                    ),
                  ),
                ),
                if (state.recentAudit.isEmpty)
                  Padding(
                    padding: const EdgeInsets.all(24),
                    child: Center(
                      child: Text(
                        context.tr('ad_no_audit_entries'),
                        style: TextStyle(color: colors.textMuted, fontSize: 13),
                      ),
                    ),
                  )
                else
                  ...state.recentAudit.map((c) => _buildAuditItem(context, colors, c)),
                const SizedBox(height: 8),
              ],
            ),
          ),

          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _buildMiniStat(SemanticColors colors, String label, String value, IconData icon) {
    return Expanded(
      child: Column(
        children: [
          Icon(icon, color: colors.primaryBrand, size: 20),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: colors.textHeading,
            ),
          ),
          Text(
            label,
            style: TextStyle(fontSize: 10, color: colors.textMuted),
          ),
        ],
      ),
    );
  }

  Widget _divider(SemanticColors colors) {
    return Container(width: 1, height: 40, color: colors.strokeBorder);
  }

  Widget _buildAuditItem(BuildContext context, SemanticColors colors, EscrowCase c) {
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 4, 16, 4),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: colors.primaryBrandLight,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(PhosphorIconsRegular.receipt, color: colors.primaryBrand, size: 16),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  c.poNumber.isNotEmpty ? c.poNumber : (c.description ?? context.tr('ad_pending_check')),
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: colors.textPrimary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (c.vendorName.isNotEmpty)
                  Text(
                    c.vendorName,
                    style: TextStyle(fontSize: 11, color: colors.textMuted),
                  ),
              ],
            ),
          ),
          if (c.submittedAt != null)
            Text(
              _relativeTime(c.submittedAt!),
              style: TextStyle(fontSize: 10, color: colors.textMuted),
            ),
        ],
      ),
    );
  }

  String _relativeTime(String isoDate) {
    try {
      final date = DateTime.parse(isoDate);
      final diff = DateTime.now().difference(date);
      if (diff.inMinutes < 60) return '${diff.inMinutes}د';
      if (diff.inHours < 24) return '${diff.inHours}س';
      if (diff.inDays < 30) return '${diff.inDays}ي';
      return '${diff.inDays ~/ 30}ش';
    } catch (_) {
      return '—';
    }
  }
}
