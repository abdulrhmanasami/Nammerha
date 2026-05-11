import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/i18n/t.dart';
import '../bloc/open_data_bloc.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Open Data Portal — بوابة البيانات المفتوحة
/// ═══════════════════════════════════════════════════════════════════════════
/// GAP-H3 FIX: OCDS transparency portal — previously web-only.
/// Shows platform stats, public projects, and OCDS compliance badge.
/// Platinum BLoC integration: Zero setState.
/// ═══════════════════════════════════════════════════════════════════════════
class OpenDataScreen extends StatelessWidget {
  const OpenDataScreen({super.key});

  String _formatCurrency(num amount) {
    if (amount >= 1000000) return '${(amount / 1000000).toStringAsFixed(1)}M';
    if (amount >= 1000) return '${(amount / 1000).toStringAsFixed(0)}K';
    return amount.toStringAsFixed(0);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return BlocProvider(
      create: (_) => OpenDataBloc()..add(LoadOpenDataDashboard()),
      child: Scaffold(
        backgroundColor: colors.backgroundPrimary,
        appBar: AppBar(
          title: Text('بوابة البيانات المفتوحة', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: colors.textPrimary)),
          backgroundColor: colors.backgroundPrimary, elevation: 0,
          iconTheme: IconThemeData(color: colors.textPrimary),
        ),
        body: BlocConsumer<OpenDataBloc, OpenDataState>(
          listener: (context, state) {
            if (state.error != null) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(state.error!), backgroundColor: colors.error)
              );
            }
          },
          builder: (context, state) {
            if (state.isLoading && state.projects.isEmpty && state.stats.isEmpty) {
              return NammerhaShimmerLoader(colors: colors);
            }

            final total = state.stats['total_projects'] as int? ?? state.projects.length;

            return RefreshIndicator(
              onRefresh: () async => context.read<OpenDataBloc>().add(LoadOpenDataDashboard()),
              color: colors.primaryBrand,
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  _buildOCDSBadge(colors),
                  const SizedBox(height: 20),
                  _buildStatsGrid(context, colors, state.stats, total),
                  const SizedBox(height: 20),
                  _buildProjectsList(colors, state.projects, total),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildOCDSBadge(SemanticColors colors) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: NammerhaGradients.brandPrimary,
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [NammerhaShadows.cta],
      ),
      child: Column(children: [
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(PhosphorIconsRegular.sealCheck, color: Colors.white, size: 28),
          const SizedBox(width: 10),
          const Text('OCDS 1.1', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: 1)),
        ]),
        const SizedBox(height: 10),
        Text(
          'معيار البيانات المفتوحة للتعاقد\nOpen Contracting Data Standard',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: Colors.white.withAlpha(200), height: 1.6),
        ),
        const SizedBox(height: 14),
        OutlinedButton.icon(
          onPressed: () => launchUrl(Uri.parse('https://standard.open-contracting.org/'), mode: LaunchMode.externalApplication),
          icon: Icon(PhosphorIconsRegular.warningCircle, size: 16, color: Colors.white),
          label: const Text('اعرف المزيد', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
          style: OutlinedButton.styleFrom(side: const BorderSide(color: Colors.white38), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
        ),
      ]),
    ).animate().fadeIn(duration: 400.ms);
  }

  Widget _buildStatsGrid(BuildContext context, SemanticColors colors, Map<String, dynamic> stats, int total) {
    final items = [
      _StatItem('المشاريع المنشورة', '${stats['total_projects'] ?? total}', PhosphorIconsRegular.article, colors.primaryBrand),
      _StatItem('إجمالي التمويل', '${_formatCurrency((stats['total_funding'] ?? 0) as num)} ل.س', PhosphorIconsRegular.bank, colors.secondaryAccent),
      _StatItem(context.tr('str_9ddc2404'), '${stats['total_donors'] ?? 0}', PhosphorIconsRegular.warningCircle, colors.info),
      _StatItem(context.tr('admin_contractors'), '${stats['total_contractors'] ?? 0}', PhosphorIconsRegular.hardHat, colors.success),
      _StatItem('المشاريع المكتملة', '${stats['completed_projects'] ?? 0}', PhosphorIconsRegular.checkCircle, colors.success),
      _StatItem('المناطق المغطاة', '${stats['total_regions'] ?? 0}', PhosphorIconsRegular.mapTrifold, colors.warning),
    ];

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('إحصائيات المنصة', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.textPrimary)),
      const SizedBox(height: 12),
      GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 1.6,
        ),
        itemCount: items.length,
        itemBuilder: (_, i) {
          final item = items[i];
          return Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: colors.surfaceElevated,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: colors.strokeSubtle),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(item.icon, size: 22, color: item.color),
              const SizedBox(height: 8),
              Text(item.value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: colors.textPrimary)),
              Text(item.label, style: TextStyle(fontSize: 11, color: colors.textSecondary)),
            ]),
          ).animate(delay: (i * 80).ms).fadeIn().slideY(begin: 0.03);
        },
      ),
    ]);
  }

  Widget _buildProjectsList(SemanticColors colors, List<Map<String, dynamic>> projects, int total) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Text('المشاريع المنشورة', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.textPrimary)),
        const Spacer(),
        Text('$total مشروع', style: TextStyle(fontSize: 12, color: colors.textSubtle)),
      ]),
      const SizedBox(height: 12),
      if (projects.isEmpty)
        Center(child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(children: [
            Icon(PhosphorIconsRegular.warningCircle, size: 48, color: colors.textSubtle),
            const SizedBox(height: 12),
            Text('لا توجد مشاريع منشورة بعد', style: TextStyle(fontSize: 14, color: colors.textSecondary)),
          ]),
        ))
      else
        ...List.generate(projects.length, (i) => _projectCard(projects[i], colors, i)),
    ]);
  }

  Widget _projectCard(Map<String, dynamic> p, SemanticColors colors, int index) {
    final title = p['title']?.toString() ?? '';
    final status = p['status']?.toString() ?? '';
    final region = p['region']?.toString() ?? '';
    final ocdsId = p['ocds_id']?.toString() ?? '';
    final funding = (p['total_estimated_cost'] ?? p['funding_goal'] ?? 0) as num;

    Color statusColor;
    switch (status) {
      case 'completed': statusColor = colors.success; break;
      case 'in_progress': statusColor = colors.warning; break;
      case 'funded': statusColor = colors.info; break;
      default: statusColor = colors.textSecondary;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary), maxLines: 2, overflow: TextOverflow.ellipsis)),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(color: statusColor.withAlpha(15), borderRadius: BorderRadius.circular(6)),
            child: Text(status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: statusColor)),
          ),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          if (region.isNotEmpty) ...[
            Icon(PhosphorIconsRegular.mapPin, size: 13, color: colors.textSubtle),
            const SizedBox(width: 3),
            Text(region, style: TextStyle(fontSize: 12, color: colors.textSecondary)),
            const SizedBox(width: 12),
          ],
          Icon(PhosphorIconsRegular.wallet, size: 13, color: colors.textSubtle),
          const SizedBox(width: 3),
          Text('${_formatCurrency(funding)} ل.س', style: TextStyle(fontSize: 12, color: colors.textSecondary, fontWeight: FontWeight.w600)),
        ]),
        if (ocdsId.isNotEmpty) ...[
          const SizedBox(height: 6),
          Row(children: [
            Icon(PhosphorIconsRegular.fingerprint, size: 13, color: colors.secondaryAccent),
            const SizedBox(width: 4),
            Text(ocdsId, style: TextStyle(fontSize: 10, color: colors.secondaryAccent, fontFamily: 'monospace')),
          ]),
        ],
      ]),
    ).animate(delay: (index * 60).ms).fadeIn();
  }
}

class _StatItem {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  const _StatItem(this.label, this.value, this.icon, this.color);
}
