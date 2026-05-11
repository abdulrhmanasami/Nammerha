import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/services/api_services.dart';
import '../../../core/theme/semantic_colors.dart';
import '../bloc/donations_bloc.dart';
import '../bloc/donations_event.dart';
import '../bloc/donations_state.dart';
import '../models/donation_model.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Donations Screen — تبرعاتي
/// ═══════════════════════════════════════════════════════════════════════════
/// P0-003 REMEDIATION: Migrated from raw setState to BLoC pattern.
/// Uses DonationsBloc for state management, typed DonationEntry model,
/// and semantic color tokens for dark mode compliance.
/// ═══════════════════════════════════════════════════════════════════════════
class DonationsScreen extends StatelessWidget {
  const DonationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => DonationsBloc()..add(const DonationsLoadRequested()),
      child: const _DonationsView(),
    );
  }
}

class _DonationsView extends StatelessWidget {
  const _DonationsView();

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: const Text('تبرعاتي'),
        actions: [
          IconButton(
            icon: Icon(Icons.refresh_rounded, color: colors.textSecondary),
            onPressed: () => context
                .read<DonationsBloc>()
                .add(const DonationsRefreshRequested()),
          ),
        ],
      ),
      body: BlocBuilder<DonationsBloc, DonationsState>(
        builder: (context, state) {
          return switch (state) {
            DonationsInitial() ||
            DonationsLoading() =>
              _buildLoading(colors),
            DonationsError(:final message) =>
              _buildError(context, colors, message),
            DonationsLoaded(:final donations, :final summary) =>
              _buildLoaded(context, colors, donations, summary),
          };
        },
      ),
    );
  }

  Widget _buildLoading(SemanticColors colors) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          NammerhaShimmerLoader(colors: colors, isList: false),
          const SizedBox(height: 16),
          Text('جارٍ تحميل التبرعات...',
              style: TextStyle(color: colors.textSecondary)),
        ],
      ),
    );
  }

  Widget _buildError(
      BuildContext context, SemanticColors colors, String message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.cloud_off_rounded,
                size: 64, color: colors.textSecondary),
            const SizedBox(height: 16),
            Text(message,
                style: TextStyle(color: colors.error, fontSize: 16),
                textAlign: TextAlign.center),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: () => context
                  .read<DonationsBloc>()
                  .add(const DonationsLoadRequested()),
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('إعادة المحاولة'),
              style: ElevatedButton.styleFrom(
                  backgroundColor: colors.primaryBrand),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLoaded(
    BuildContext context,
    SemanticColors colors,
    List<DonationEntry> donations,
    EscrowSummary summary,
  ) {
    return RefreshIndicator(
      onRefresh: () async => context
          .read<DonationsBloc>()
          .add(const DonationsRefreshRequested()),
      color: colors.primaryBrand,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Summary Cards Row
            Row(
              children: [
                _buildSummaryCard(
                  context,
                  'مُؤمّن في الضمان',
                  formatCurrency(summary.totalLocked),
                  Icons.lock_clock_rounded,
                  colors.success,
                  colors.successLight,
                ),
                const SizedBox(width: 12),
                _buildSummaryCard(
                  context,
                  'تم الإفراج',
                  formatCurrency(summary.totalReleased),
                  Icons.check_circle_rounded,
                  colors.primaryBrand,
                  colors.primaryBrandLight,
                ),
              ],
            ).animate().fadeIn().slideY(begin: -0.1, end: 0),
            const SizedBox(height: 24),

            // Donations List Header
            Text(
              'سجل التبرعات',
              style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: colors.textPrimary),
            ),
            const SizedBox(height: 14),

            if (donations.isEmpty)
              Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    children: [
                      Icon(Icons.volunteer_activism_rounded,
                          size: 48, color: colors.textSecondary),
                      const SizedBox(height: 12),
                      Text('لا توجد تبرعات بعد',
                          style: TextStyle(color: colors.textSecondary)),
                    ],
                  ),
                ),
              )
            else
              ...List.generate(donations.length, (index) {
                return _buildDonationItem(donations[index], colors, index);
              }),

            const SizedBox(height: 16),

            // Trust Badge
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: colors.primaryBrandLight,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: colors.primaryBrand.withAlpha(30)),
              ),
              child: Row(
                children: [
                  Icon(Icons.shield_rounded,
                      color: colors.primaryBrand, size: 24),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'أموالك مؤمّنة بنظام الضمان المشفّر. لا يتم الإفراج إلا بإثبات مكاني مُوثّق.',
                      style: TextStyle(
                          fontSize: 12,
                          color: colors.primaryBrand,
                          height: 1.6),
                    ),
                  ),
                ],
              ),
            ).animate(delay: 600.ms).fadeIn(),
          ],
        ),
      ),
    );
  }

  Widget _buildDonationItem(
      DonationEntry d, SemanticColors colors, int index) {
    Color statusColor;
    String statusLabel;
    IconData statusIcon;

    if (d.isReleased) {
      statusColor = colors.primaryBrand;
      statusLabel = 'تم الإفراج';
      statusIcon = Icons.check_circle_rounded;
    } else if (d.isLocked) {
      statusColor = colors.success;
      statusLabel = 'مُؤمّن';
      statusIcon = Icons.lock_rounded;
    } else if (d.isRefunded) {
      statusColor = colors.textSecondary;
      statusLabel = 'مُسترد';
      statusIcon = Icons.undo_rounded;
    } else {
      statusColor = colors.warning;
      statusLabel = 'قيد المعالجة';
      statusIcon = Icons.hourglass_top_rounded;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: statusColor.withAlpha(15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(statusIcon, color: statusColor, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(d.materialName,
                    style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: colors.textPrimary)),
                Text(d.projectTitle,
                    style: TextStyle(
                        fontSize: 12, color: colors.textSecondary),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(formatCurrency(d.amountLocked),
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: colors.textPrimary)),
              const SizedBox(height: 2),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                    color: statusColor.withAlpha(15),
                    borderRadius: BorderRadius.circular(6)),
                child: Text(statusLabel,
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: statusColor)),
              ),
            ],
          ),
        ],
      ),
    )
        .animate(delay: (200 + index * 100).ms)
        .fadeIn()
        .slideX(begin: 0.05, end: 0);
  }

  Widget _buildSummaryCard(BuildContext context, String title, String amount,
      IconData icon, Color color, Color bgColor) {
    final colors = context.colors;
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: colors.surfaceElevated,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: colors.strokeSubtle),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                  color: bgColor, borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(height: 12),
            Text(amount,
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: colors.textPrimary)),
            const SizedBox(height: 2),
            Text(title,
                style:
                    TextStyle(fontSize: 11, color: colors.textSecondary)),
          ],
        ),
      ),
    );
  }
}
