import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../models/compliance_models.dart';
import '../bloc/compliance_bloc.dart';
import '../bloc/compliance_event.dart';
import '../bloc/compliance_state.dart';
import '../data/compliance_repository.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Compliance Dashboard — OCDS Audit & Escrow Review (Platinum Standard)
/// ═══════════════════════════════════════════════════════════════════════════
/// NEW: This screen was completely missing from the mobile app.
/// Mirrors web: frontend/src/pages/compliance-dashboard.ts
///
/// 3 sections:
///   1. KPIs (total audited, pending, flagged, resolved)
///   2. OCDS Compliance Metrics (compliance rate + spatial accuracy bars)
///   3. Escrow Review Queue (approve/flag actions)
/// ═══════════════════════════════════════════════════════════════════════════
class ComplianceDashboardScreen extends StatelessWidget {
  const ComplianceDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => ComplianceBloc(repository: ComplianceRepository())
        ..add(LoadComplianceDashboard()),
      child: const _ComplianceDashboardView(),
    );
  }
}

class _ComplianceDashboardView extends StatelessWidget {
  const _ComplianceDashboardView();

  String _formatCurrency(num amount) {
    if (amount >= 1000000) {
      return '${(amount / 1000000).toStringAsFixed(1)}M ل.س';
    } else if (amount >= 1000) {
      return '${(amount / 1000).toStringAsFixed(0)}k ل.س';
    }
    return '${amount.toStringAsFixed(0)} ل.س';
  }

  String _formatDate(String dateStr) {
    try {
      final dt = DateTime.parse(dateStr);
      return '${dt.year}/${dt.month.toString().padLeft(2, '0')}/${dt.day.toString().padLeft(2, '0')}';
    } catch (_) {
      return dateStr;
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: const Text('لوحة الامتثال'),
        actions: [
          IconButton(
            icon: Icon(Icons.shield_rounded, color: colors.primaryBrand),
            onPressed: () {},
            tooltip: 'فحص العقوبات SDN',
          ),
        ],
      ),
      body: BlocConsumer<ComplianceBloc, ComplianceState>(
        listener: (context, state) {
          if (state is ComplianceActionSuccess) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.message), backgroundColor: colors.success),
            );
          } else if (state is ComplianceError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.message), backgroundColor: colors.error),
            );
          }
        },
        buildWhen: (previous, current) => current is! ComplianceActionSuccess,
        builder: (context, state) {
          if (state is ComplianceLoading || state is ComplianceInitial) {
            return Center(
              child: CircularProgressIndicator(color: colors.primaryBrand),
            );
          }

          if (state is ComplianceError && state.message.contains('فشل')) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.error_outline, size: 64, color: colors.error),
                  const SizedBox(height: 16),
                  Text('فشل تحميل بيانات الامتثال',
                      style: TextStyle(color: colors.textPrimary, fontSize: 16)),
                  const SizedBox(height: 12),
                  ElevatedButton(
                    onPressed: () => context.read<ComplianceBloc>().add(LoadComplianceDashboard()),
                    child: const Text('إعادة المحاولة'),
                  ),
                ],
              ),
            );
          }

          if (state is ComplianceLoaded) {
            final dashboard = state.dashboard;
            return RefreshIndicator(
              onRefresh: () async {
                context.read<ComplianceBloc>().add(LoadComplianceDashboard());
              },
              color: colors.primaryBrand,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // ─── Section 1: KPIs ──────────────────────────
                  _buildKpiSection(dashboard.stats, colors),
                  const SizedBox(height: 20),

                  // ─── Section 2: OCDS Metrics ──────────────────
                  _buildMetricsSection(dashboard.stats, colors),
                  const SizedBox(height: 20),

                  // ─── Section 3: Escrow Review Queue ───────────
                  _buildReviewQueueSection(context, dashboard.reviews, colors),
                ],
              ),
            );
          }

          return const SizedBox.shrink();
        },
      ),
    );
  }

  // ─── Section 1: KPIs ──────────────────────────────────────────────────

  Widget _buildKpiSection(ComplianceStatsModel stats, SemanticColors colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('نظرة عامة',
            style: TextStyle(
                fontSize: 18, fontWeight: FontWeight.w700, color: colors.textPrimary)),
        const SizedBox(height: 12),
        Row(
          children: [
            _kpiCard('إجمالي المدقق', '${stats.totalAudited}', colors.primaryBrand, colors),
            const SizedBox(width: 8),
            _kpiCard('مراجعات معلقة', '${stats.pendingReviews}', colors.warning, colors),
            const SizedBox(width: 8),
            _kpiCard('مشاكل', '${stats.flaggedIssues}', colors.error, colors),
            const SizedBox(width: 8),
            _kpiCard('تم حلها', '${stats.resolvedThisMonth}', colors.success, colors),
          ],
        ).animate().fadeIn(duration: 400.ms),
      ],
    );
  }

  Widget _kpiCard(String label, String value, Color accent, SemanticColors colors) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: colors.surfaceElevated,
          borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
          border: Border.all(color: colors.strokeSubtle),
        ),
        child: Column(
          children: [
            Text(value,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: accent),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
            const SizedBox(height: 2),
            Text(label,
                style: TextStyle(fontSize: 9, color: colors.textSecondary),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );
  }

  // ─── Section 2: OCDS Compliance Metrics ───────────────────────────────

  Widget _buildMetricsSection(ComplianceStatsModel stats, SemanticColors colors) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.verified_rounded, size: 20, color: colors.primaryBrand),
              const SizedBox(width: 8),
              Text('مقاييس OCDS',
                  style: TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
            ],
          ),
          const SizedBox(height: 16),

          // Compliance Rate Bar
          _metricBar(
            label: 'معدل الامتثال',
            value: stats.complianceRate,
            color: stats.complianceRate >= 90
                ? colors.success
                : stats.complianceRate >= 70
                    ? colors.warning
                    : colors.error,
            colors: colors,
          ),
          const SizedBox(height: 14),

          // Spatial Accuracy Bar
          _metricBar(
            label: 'دقة الإثبات المكاني',
            value: stats.spatialAccuracy,
            color: stats.spatialAccuracy >= 90
                ? colors.success
                : stats.spatialAccuracy >= 70
                    ? colors.warning
                    : colors.error,
            colors: colors,
          ),
        ],
      ),
    ).animate().fadeIn(delay: 200.ms);
  }

  Widget _metricBar({
    required String label,
    required double value,
    required Color color,
    required SemanticColors colors,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.textPrimary)),
            Text('${value.toStringAsFixed(1)}%',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: color)),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: (value / 100).clamp(0.0, 1.0),
            backgroundColor: colors.backgroundSecondary,
            valueColor: AlwaysStoppedAnimation(color),
            minHeight: 8,
          ),
        ),
      ],
    );
  }

  // ─── Section 3: Escrow Review Queue ───────────────────────────────────

  Widget _buildReviewQueueSection(
      BuildContext context, List<EscrowReviewModel> reviews, SemanticColors colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text('طابور مراجعة الضمان',
                style: TextStyle(
                    fontSize: 18, fontWeight: FontWeight.w700, color: colors.textPrimary)),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                  color: colors.warning.withAlpha(20),
                  borderRadius: BorderRadius.circular(10)),
              child: Text('${reviews.length}',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: colors.warning)),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (reviews.isEmpty)
          _emptyState(colors)
        else
          ...reviews.asMap().entries.map(
              (e) => _reviewCard(context, e.value, colors, e.key)),
      ],
    );
  }

  Widget _reviewCard(BuildContext context, EscrowReviewModel review, SemanticColors colors, int index) {
    Color statusColor;
    switch (review.status.toLowerCase()) {
      case 'approved':
        statusColor = colors.success;
        break;
      case 'flagged':
        statusColor = colors.error;
        break;
      case 'pending':
        statusColor = colors.warning;
        break;
      default:
        statusColor = colors.textSecondary;
    }
    final isPending = review.status.toLowerCase() == 'pending';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
        border: Border.all(color: isPending ? colors.warning.withAlpha(40) : colors.strokeSubtle),
        boxShadow: const [NammerhaShadows.elevation],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: project title + status badge
          Row(
            children: [
              Expanded(
                  child: Text(review.projectTitle,
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: colors.textPrimary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis)),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                    color: statusColor.withAlpha(15),
                    borderRadius: BorderRadius.circular(6)),
                child: Text(review.status,
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: statusColor)),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // Material + amount
          Row(
            children: [
              Icon(Icons.inventory_2_rounded, size: 14, color: colors.textSubtle),
              const SizedBox(width: 4),
              Expanded(
                  child: Text(review.materialName,
                      style: TextStyle(fontSize: 12, color: colors.textSecondary))),
              Text(_formatCurrency(review.amount),
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: colors.secondaryAccent)),
            ],
          ),
          const SizedBox(height: 8),

          // GPS accuracy + submission date
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
                color: colors.backgroundSecondary,
                borderRadius: BorderRadius.circular(8)),
            child: Row(
              children: [
                if (review.gpsAccuracy != null) ...[
                  Icon(Icons.gps_fixed_rounded, size: 14, color: colors.textSubtle),
                  const SizedBox(width: 4),
                  Text('±${review.gpsAccuracy!.toStringAsFixed(0)}م',
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: review.gpsAccuracy! <= 150
                              ? colors.success
                              : colors.error)),
                  const SizedBox(width: 12),
                ],
                Icon(Icons.calendar_today_rounded, size: 14, color: colors.textSubtle),
                const SizedBox(width: 4),
                Text(_formatDate(review.submittedAt),
                    style: TextStyle(fontSize: 11, color: colors.textSecondary)),
                const Spacer(),
                Text(review.reference,
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        fontFamily: 'monospace',
                        color: colors.textSubtle)),
              ],
            ),
          ),

          // Action buttons (only for pending reviews)
          if (isPending) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () {
                      context.read<ComplianceBloc>().add(ApproveEscrowReview(review.reference));
                    },
                    icon: const Icon(Icons.check_circle_rounded, size: 16),
                    label: const Text('موافقة'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: colors.success,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () {
                      context.read<ComplianceBloc>().add(FlagEscrowReview(review.reference));
                    },
                    icon: const Icon(Icons.flag_rounded, size: 16),
                    label: const Text('إبلاغ'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: colors.error,
                      side: BorderSide(color: colors.error),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    ).animate(delay: (index * 80).ms).fadeIn().slideY(begin: 0.05, end: 0);
  }

  Widget _emptyState(SemanticColors colors) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.verified_rounded, size: 56, color: colors.success.withAlpha(100)),
            const SizedBox(height: 16),
            Text('لا توجد مراجعات معلقة',
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: colors.textPrimary),
                textAlign: TextAlign.center),
            const SizedBox(height: 6),
            Text('جميع تحريرات الضمان تمت مراجعتها',
                style: TextStyle(fontSize: 13, color: colors.textSecondary),
                textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
