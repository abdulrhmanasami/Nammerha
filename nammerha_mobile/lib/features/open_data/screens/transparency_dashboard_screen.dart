import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/network/api_client.dart';
import '../../../core/services/open_data_api.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/utils/error_localizer.dart';
import '../../../core/services/api_services.dart' show formatCurrency;
import '../../../core/i18n/t.dart';
import '../bloc/transparency_dashboard_cubit.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Transparency Dashboard — لوحة الشفافية والبيانات المفتوحة (OCDS)
/// ═══════════════════════════════════════════════════════════════════════════
/// P0-001 REMEDIATION: Replaced hardcoded mock data with live API integration.
/// P0-004 REMEDIATION: Replaced GoogleFonts.cairo with semantic theme system.
///
/// Data sources:
///   - OpenDataApi.getOCDSRelease(projectId) → OCDS compliance data
///   - DonationsApi.getMyEscrow() → Escrow ledger entries (if authenticated)
///   - OpenDataApi.getProjectCard(projectId) → Project metadata
///
/// Standard: Nammerha Domain Law §2 — Radical Transparency / OCDS.
/// ═══════════════════════════════════════════════════════════════════════════
class TransparencyDashboardScreen extends StatelessWidget {
  final String projectId;

  const TransparencyDashboardScreen({super.key, required this.projectId});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => TransparencyDashboardCubit(),
      child: _TransparencyDashboardContent(projectId: projectId),
    );
  }
}

class _TransparencyDashboardContent extends StatefulWidget {
  final String projectId;
  const _TransparencyDashboardContent({required this.projectId});

  @override
  State<_TransparencyDashboardContent> createState() => _TransparencyDashboardContentState();
}

class _TransparencyDashboardContentState
    extends State<_TransparencyDashboardContent> {
  final OpenDataApi _openDataApi = OpenDataApi();

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    final cubit = context.read<TransparencyDashboardCubit>();
    cubit.setLoading();

    try {
      final results = await Future.wait<Map<String, dynamic>>([
        _openDataApi.getProjectCard(widget.projectId),
        _openDataApi.getOCDSRelease(widget.projectId),
      ]);

      final card = results[0];
      final ocds = results[1];

      // Extract escrow ledger entries from OCDS release or project card
      final List<dynamic> rawLedger = (ocds['escrow_ledger'] ??
              ocds['transactions'] ??
              card['escrow_entries'] ??
              []) as List<dynamic>;

      cubit.setLoaded(
        projectCard: card,
        ocdsRelease: ocds,
        ledgerEntries: rawLedger.cast<Map<String, dynamic>>(),
      );
    } on ApiException catch (e) {
      if (mounted) {
        cubit.setError(localizeApiError(e.message));
      }
    } catch (e) {
      if (mounted) {
        cubit.setError('تعذر تحميل بيانات الشفافية');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        backgroundColor: colors.backgroundPrimary,
        elevation: 0,
        title: Text(
          'الشفافية والبيانات المفتوحة (OCDS)',
          style: TextStyle(
            color: colors.textPrimary,
            fontWeight: FontWeight.bold,
            fontSize: 16,
          ),
        ),
        iconTheme: IconThemeData(color: colors.textPrimary),
      ),
      body: BlocBuilder<TransparencyDashboardCubit, TransparencyDashboardState>(
        builder: (context, tState) => _buildBody(colors, tState),
      ),
    );
  }

  Widget _buildBody(SemanticColors colors, TransparencyDashboardState tState) {
    if (tState.isLoading) {
      return NammerhaShimmerLoader(colors: colors);
    }

    if (tState.error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(PhosphorIconsRegular.cloudSlash,
                  size: 64, color: colors.textSecondary),
              const SizedBox(height: 16),
              Text(
                tState.error!,
                style: TextStyle(color: colors.error, fontSize: 16),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                onPressed: _loadData,
                icon: Icon(PhosphorIconsRegular.arrowsClockwise),
                label: const Text('إعادة المحاولة'),
                style: ElevatedButton.styleFrom(
                    backgroundColor: colors.primaryBrand),
              ),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      color: colors.primaryBrand,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildInfoCard(
              title: 'الشفافية المطلقة',
              description:
                  'يتوافق هذا المشروع مع معايير التعاقد المفتوح (OCDS). يمكنك تتبع كل ليرة تم التبرع بها حتى لحظة صرفها.',
              icon: PhosphorIconsRegular.warningCircle,
              color: colors.primaryBrand,
              colors: colors,
            ).animate().fadeIn(duration: 400.ms),
            const SizedBox(height: 20),

            // OCDS Release Summary (if available)
            if (tState.ocdsRelease.isNotEmpty) ...[
              _buildOCDSSummary(colors, tState),
              const SizedBox(height: 20),
            ],

            // Escrow Ledger Timeline
            Text(
              'سجل الضمان (Escrow Ledger)',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: colors.textPrimary,
              ),
            ),
            const SizedBox(height: 16),
            _buildLedgerTimeline(colors, tState.ledgerEntries),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoCard({
    required String title,
    required String description,
    required IconData icon,
    required Color color,
    required SemanticColors colors,
  }) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.strokeSubtle),
        boxShadow: [
          BoxShadow(
            color: colors.glassOverlay.withAlpha(10),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: color.withAlpha(20),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: color, size: 32),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                    color: colors.textPrimary,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  description,
                  style: TextStyle(
                    color: colors.textSecondary,
                    height: 1.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOCDSSummary(SemanticColors colors, TransparencyDashboardState tState) {
    final ocdsRelease = tState.ocdsRelease;
    final projectCard = tState.projectCard;
    final ocid = ocdsRelease['ocid']?.toString() ?? '';
    final releaseDate = ocdsRelease['date']?.toString() ?? '';
    final tag = (ocdsRelease['tag'] as List<dynamic>?)?.join(', ') ??
        ocdsRelease['tag']?.toString() ??
        '';
    final totalAmount = projectCard['total_estimated_cost'] ??
        projectCard['funding_goal'] ??
        0;
    final fundedAmount = projectCard['total_funded'] ?? 0;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: NammerhaGradients.brandPrimary,
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [NammerhaShadows.cta],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(PhosphorIconsRegular.sealCheck,
                  color: Colors.white, size: 24),
              const SizedBox(width: 8),
              const Text(
                'OCDS 1.1 — Release',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (ocid.isNotEmpty)
            _buildOCDSField('OCID', ocid, colors),
          if (releaseDate.isNotEmpty)
            _buildOCDSField('تاريخ الإصدار', releaseDate, colors),
          if (tag.isNotEmpty)
            _buildOCDSField(context.tr('str_91b260c9'), tag, colors),
          _buildOCDSField(
            'إجمالي التكلفة',
            formatCurrency(totalAmount as num),
            colors,
          ),
          _buildOCDSField(
            'إجمالي المموّل',
            formatCurrency(fundedAmount as num),
            colors,
          ),
        ],
      ),
    ).animate(delay: 200.ms).fadeIn().slideY(begin: 0.03);
  }

  Widget _buildOCDSField(
      String label, String value, SemanticColors colors) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Text(
            '$label: ',
            style: TextStyle(
              fontSize: 12,
              color: Colors.white.withAlpha(180),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLedgerTimeline(SemanticColors colors, List<Map<String, dynamic>> ledgerEntries) {
    if (ledgerEntries.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            children: [
              Icon(PhosphorIconsRegular.receipt,
                  size: 48, color: colors.textSubtle),
              const SizedBox(height: 12),
              Text(
                'لا توجد سجلات ضمان لهذا المشروع بعد',
                style: TextStyle(
                    fontSize: 14, color: colors.textSecondary),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: ledgerEntries.length,
      itemBuilder: (context, index) {
        final entry = ledgerEntries[index];
        final status = (entry['status']?.toString() ?? '').toLowerCase();
        final isReleased =
            status == 'released' || status == 'escrow_released';
        final amount = entry['amount'] ??
            entry['amount_locked'] ??
            entry['amount_released'] ??
            0;
        final note = entry['note'] ??
            entry['description'] ??
            entry['reason'] ??
            '';
        final date = entry['date'] ??
            entry['created_at'] ??
            entry['released_at'] ??
            entry['locked_at'] ??
            '';

        return Container(
          margin: const EdgeInsets.only(bottom: 16),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: colors.surfaceElevated,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isReleased
                  ? colors.secondaryAccent.withAlpha(80)
                  : colors.goldFunding.withAlpha(130),
              width: 1,
            ),
            boxShadow: [
              BoxShadow(
                color: colors.glassOverlay.withAlpha(5),
                blurRadius: 5,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    amount is num
                        ? formatCurrency(amount)
                        : amount.toString(),
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 18,
                      color: isReleased
                          ? colors.secondaryAccent
                          : colors.textPrimary,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 4),
                    decoration: BoxDecoration(
                      color: isReleased
                          ? colors.secondaryAccentLight
                          : colors.warningLight,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      isReleased
                          ? 'مُفرج (Released)'
                          : 'محتجز (Locked)',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: isReleased
                            ? colors.secondaryAccent
                            : colors.warningText,
                      ),
                    ),
                  ),
                ],
              ),
              if (note.toString().isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  note.toString(),
                  style: TextStyle(color: colors.textBody),
                ),
              ],
              if (date.toString().isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  date.toString(),
                  style: TextStyle(
                      fontSize: 12, color: colors.textMuted),
                ),
              ],
            ],
          ),
        ).animate(delay: (index * 100).ms).fadeIn().slideY(begin: 0.03);
      },
    );
  }
}
