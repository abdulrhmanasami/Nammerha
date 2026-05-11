import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/services/api_services.dart';
import '../bloc/admin_fintech_bloc.dart';
import '../widgets/admin_kpi_card.dart';
import '../models/admin_models.dart';
import '../../../core/i18n/t.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';

/// Admin FinTech Dashboard — Escrow fees, fee configs, enterprise orgs.
class AdminFintechScreen extends StatelessWidget {
  const AdminFintechScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => AdminFintechBloc()..add(LoadFintechData()),
      child: const _FintechView(),
    );
  }
}

class _FintechView extends StatelessWidget {
  const _FintechView();

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text(
          'الرسوم المالية',
          style: TextStyle(fontWeight: FontWeight.w800, color: colors.textHeading),
        ),
        backgroundColor: colors.surfaceElevated,
        elevation: 0,
        iconTheme: IconThemeData(color: colors.textHeading),
      ),
      body: BlocBuilder<AdminFintechBloc, AdminFintechState>(
        builder: (context, state) {
          if (state is AdminFintechLoading) {
            return NammerhaShimmerLoader(colors: colors);
          }
          if (state is AdminFintechError) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.error_outline_rounded, size: 48, color: colors.error),
                  const SizedBox(height: 12),
                  Text(state.message, style: TextStyle(color: colors.textSecondary)),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: () => context.read<AdminFintechBloc>().add(LoadFintechData()),
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('إعادة المحاولة'),
                    style: FilledButton.styleFrom(backgroundColor: colors.primaryBrand),
                  ),
                ],
              ),
            );
          }
          if (state is AdminFintechLoaded) {
            return _buildLoaded(context, state);
          }
          return const SizedBox.shrink();
        },
      ),
    );
  }

  Widget _buildLoaded(BuildContext context, AdminFintechLoaded state) {
    final colors = context.colors;
    final fees = state.feeSummary;

    return RefreshIndicator(
      color: colors.primaryBrand,
      onRefresh: () async {
        context.read<AdminFintechBloc>().add(LoadFintechData());
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Fee KPIs
          GridView.count(
            crossAxisCount: 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            children: [
              AdminKpiCard(
                title: 'إيرادات الرسوم',
                value: fees.totalFeeRevenue,
                icon: Icons.account_balance_rounded,
                accentColor: colors.primaryBrand,
                isCurrency: true,
              ),
              AdminKpiCard(
                title: 'رسوم الشهر',
                value: fees.mtdFeeRevenue,
                icon: Icons.calendar_month_rounded,
                accentColor: colors.secondaryAccent,
                isCurrency: true,
              ),
              AdminKpiCard(
                title: 'عدد الرسوم',
                value: fees.totalFeesCount,
                icon: Icons.tag_rounded,
                accentColor: colors.warmEarth,
              ),
              AdminKpiCard(
                title: 'متوسط الرسم',
                value: fees.averageFeeCents,
                icon: Icons.analytics_rounded,
                accentColor: colors.info,
                isCurrency: true,
              ),
            ],
          ),

          const SizedBox(height: 20),

          // Fee Configurations
          _sectionHeader(colors, 'إعدادات الرسوم', Icons.tune_rounded),
          const SizedBox(height: 8),
          if (state.feeConfigs.isEmpty)
            _emptyCard(colors, 'لا توجد إعدادات')
          else
            ...state.feeConfigs.map((f) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _buildFeeConfigCard(colors, f),
            )),

          const SizedBox(height: 20),

          // Enterprise Organizations
          _sectionHeader(colors, context.tr('admin_organizations'), Icons.business_center_rounded),
          const SizedBox(height: 8),
          if (state.organizations.isEmpty)
            _emptyCard(colors, 'لا توجد مؤسسات')
          else
            ...state.organizations.map((o) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _buildOrgCard(colors, o),
            )),

          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _sectionHeader(SemanticColors colors, String title, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 18, color: colors.primaryBrand),
        const SizedBox(width: 8),
        Text(
          title,
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textHeading),
        ),
      ],
    );
  }

  Widget _emptyCard(SemanticColors colors, String text) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.strokeBorder.withValues(alpha: 0.5)),
      ),
      child: Center(child: Text(text, style: TextStyle(color: colors.textMuted, fontSize: 13))),
    );
  }

  Widget _buildFeeConfigCard(SemanticColors colors, FeeConfig config) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.strokeBorder.withValues(alpha: 0.5)),
      ),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: config.isActive ? colors.success : colors.textMuted,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  config.feeName,
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.textHeading),
                ),
                Text(
                  'يُطبّق على: ${config.appliesTo}',
                  style: TextStyle(fontSize: 11, color: colors.textMuted),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                padding: const EdgeInsetsDirectional.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: colors.primaryBrandLight,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  config.ratePercent,
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: colors.primaryBrand),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'أدنى: ${formatCurrency(config.minFeeCents)}',
                style: TextStyle(fontSize: 9, color: colors.textMuted),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildOrgCard(SemanticColors colors, EnterpriseOrg org) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.strokeBorder.withValues(alpha: 0.5)),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: colors.secondaryAccentLight,
            child: Text(
              org.orgName.isNotEmpty ? org.orgName[0].toUpperCase() : '?',
              style: TextStyle(fontWeight: FontWeight.w700, color: colors.secondaryAccent),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  org.orgName,
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: colors.textHeading),
                ),
                Text(
                  '${org.orgType} • ${org.contactEmail}',
                  style: TextStyle(fontSize: 11, color: colors.textMuted),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsetsDirectional.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: org.isActive ? colors.successLight : colors.errorLight,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              org.tier,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: org.isActive ? colors.success : colors.error,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
