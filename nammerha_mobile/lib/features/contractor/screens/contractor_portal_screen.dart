import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/gradient_button.dart';
import '../models/contractor_models.dart';
import '../bloc/contractor_bloc.dart';
import '../bloc/contractor_event.dart';
import '../bloc/contractor_state.dart';
import '../data/contractor_repository.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Contractor Portal — Multi-tab Dashboard (Platinum Standard)
/// ═══════════════════════════════════════════════════════════════════════════
/// Mirrors web: frontend/src/pages/contractor-portal.ts
/// 4 tabs: Dashboard, Marketplace, Bids, Payments
///
/// P0.2 UPGRADE: Migrated from StatefulWidget+setState to BLoC architecture.
/// P0.3 FIX: All `catch (_) {}` replaced with structured error handling.
/// ═══════════════════════════════════════════════════════════════════════════
class ContractorPortalScreen extends StatelessWidget {
  const ContractorPortalScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => ContractorBloc(repository: ContractorRepository())
        ..add(LoadContractorDashboard()),
      child: const _ContractorPortalView(),
    );
  }
}

class _ContractorPortalView extends StatefulWidget {
  const _ContractorPortalView();

  @override
  State<_ContractorPortalView> createState() => _ContractorPortalViewState();
}

class _ContractorPortalViewState extends State<_ContractorPortalView>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

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
      appBar: AppBar(
        title: const Text('بوابة المقاول'),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          indicatorColor: colors.primaryBrand,
          labelColor: colors.primaryBrand,
          unselectedLabelColor: colors.textSecondary,
          labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
          tabs: const [
            Tab(text: 'لوحة التحكم'),
            Tab(text: 'السوق'),
            Tab(text: 'عروضي'),
            Tab(text: 'المدفوعات'),
          ],
        ),
      ),
      body: BlocConsumer<ContractorBloc, ContractorState>(
        listener: (context, state) {
          if (state is ContractorActionSuccess) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.message), backgroundColor: colors.success),
            );
          } else if (state is ContractorError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.message), backgroundColor: colors.error),
            );
          }
        },
        buildWhen: (previous, current) => current is! ContractorActionSuccess,
        builder: (context, state) {
          if (state is ContractorLoading || state is ContractorInitial) {
            return Center(
              child: CircularProgressIndicator(color: colors.primaryBrand),
            );
          }

          if (state is ContractorError && state.message.contains('فشل')) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.error_outline, size: 64, color: colors.error),
                  const SizedBox(height: 16),
                  Text('حدث خطأ أثناء تحميل البيانات',
                      style: TextStyle(color: colors.textPrimary)),
                  const SizedBox(height: 12),
                  ElevatedButton(
                    onPressed: () => context.read<ContractorBloc>().add(LoadContractorDashboard()),
                    child: const Text('إعادة المحاولة'),
                  ),
                ],
              ),
            );
          }

          if (state is ContractorLoaded) {
            final dashboard = state.dashboard;
            return TabBarView(
              controller: _tabController,
              children: [
                _buildDashboard(dashboard, colors),
                _buildMarketplace(dashboard.marketplace, colors),
                _buildBids(dashboard.bids, colors),
                _buildPayments(dashboard.payments, colors),
              ],
            );
          }

          return const SizedBox.shrink();
        },
      ),
    );
  }

  // ─── Tab 1: Dashboard ─────────────────────────────────────────────────

  Widget _buildDashboard(ContractorDashboardModel dashboard, SemanticColors colors) {
    return RefreshIndicator(
      onRefresh: () async {
        context.read<ContractorBloc>().add(LoadContractorDashboard());
      },
      color: colors.primaryBrand,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildKpiRow(dashboard.stats, colors),
          const SizedBox(height: 20),
          Text('المشاريع المُسندة',
              style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: colors.textPrimary)),
          const SizedBox(height: 12),
          if (dashboard.projects.isEmpty)
            _emptyState(colors, Icons.assignment_rounded,
                'لا توجد مشاريع مُسندة بعد', 'تصفح السوق وقدّم عروضك')
          else
            ...dashboard.projects.asMap().entries.map(
                (e) => _projectCard(e.value, colors, e.key)),
        ],
      ),
    );
  }

  Widget _buildKpiRow(ContractorStatsModel stats, SemanticColors colors) {
    return Row(
      children: [
        _kpiCard('مشاريع نشطة', '${stats.assignedProjects}', colors.primaryBrand, colors),
        const SizedBox(width: 8),
        _kpiCard('عروض معلقة', '${stats.activeBids}', colors.warning, colors),
        const SizedBox(width: 8),
        _kpiCard('مكتملة', '${stats.completedProjects}', colors.success, colors),
        const SizedBox(width: 8),
        _kpiCard('الأرباح', formatCurrency(stats.totalEarnings), colors.secondaryAccent, colors),
      ],
    ).animate().fadeIn(duration: 400.ms);
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
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: accent),
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

  Widget _projectCard(ContractorProjectModel p, SemanticColors colors, int index) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
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
              Expanded(
                  child: Text(p.title,
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: colors.textPrimary))),
              _phaseBadge(p.phase, colors),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(Icons.location_on_rounded, size: 14, color: colors.textSubtle),
              const SizedBox(width: 4),
              Text(p.region,
                  style: TextStyle(fontSize: 12, color: colors.textSecondary)),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: p.progress / 100,
                    backgroundColor: colors.backgroundSecondary,
                    valueColor: AlwaysStoppedAnimation(colors.warning),
                    minHeight: 6,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text('${p.progress}%',
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: colors.textPrimary)),
            ],
          ),
        ],
      ),
    ).animate(delay: (index * 80).ms).fadeIn().slideY(begin: 0.05, end: 0);
  }

  Widget _phaseBadge(String phase, SemanticColors colors) {
    Color c;
    switch (phase.toLowerCase()) {
      case 'planning':
        c = colors.info;
        break;
      case 'in_progress':
        c = colors.warning;
        break;
      case 'completed':
        c = colors.success;
        break;
      default:
        c = colors.textSecondary;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
          color: c.withAlpha(15), borderRadius: BorderRadius.circular(6)),
      child: Text(phase,
          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: c)),
    );
  }

  // ─── Tab 2: Marketplace ───────────────────────────────────────────────

  Widget _buildMarketplace(List<ContractorProjectModel> marketplace, SemanticColors colors) {
    if (marketplace.isEmpty) {
      return _emptyState(
          colors, Icons.search_rounded, 'لا توجد مشاريع متاحة', 'ستظهر المشاريع الجديدة هنا');
    }
    return RefreshIndicator(
      onRefresh: () async {
        context.read<ContractorBloc>().add(LoadContractorDashboard());
      },
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: marketplace.length,
        itemBuilder: (_, i) => _marketplaceCard(marketplace[i], colors, i),
      ),
    );
  }

  Widget _marketplaceCard(ContractorProjectModel p, SemanticColors colors, int index) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
        border: Border.all(color: colors.strokeSubtle),
        boxShadow: const [NammerhaShadows.elevation],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                  child: Text(p.title,
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: colors.textPrimary),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis)),
              Text(formatCurrency(p.totalEstimatedCost),
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: colors.primaryBrand)),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
                color: colors.backgroundSecondary,
                borderRadius: BorderRadius.circular(10)),
            child: Row(
              children: [
                Icon(Icons.location_on_rounded, size: 14, color: colors.textSubtle),
                const SizedBox(width: 4),
                Text(p.region,
                    style: TextStyle(fontSize: 12, color: colors.textSecondary)),
                const SizedBox(width: 12),
                Icon(Icons.build_rounded, size: 14, color: colors.textSubtle),
                const SizedBox(width: 4),
                Text(p.damageType,
                    style: TextStyle(fontSize: 12, color: colors.textSecondary)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  _miniStat('بنود', '${p.boqCount}', colors),
                  const SizedBox(width: 16),
                  _miniStat('عروض', '${p.bidCount}', colors),
                ],
              ),
              GradientButton(
                label: 'قدّم عرض',
                icon: Icons.gavel_rounded,
                onPressed: () => _openBidModal(p.projectId),
                height: 36,
                borderRadius: 10,
              ),
            ],
          ),
        ],
      ),
    ).animate(delay: (index * 80).ms).fadeIn().slideY(begin: 0.05, end: 0);
  }

  Widget _miniStat(String label, String value, SemanticColors colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: colors.textSubtle)),
        Text(value,
            style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: colors.textPrimary)),
      ],
    );
  }

  // ─── Tab 3: Bids ──────────────────────────────────────────────────────

  Widget _buildBids(List<ContractorBidModel> bids, SemanticColors colors) {
    if (bids.isEmpty) {
      return _emptyState(colors, Icons.flag_rounded, 'لم تقدم أي عروض بعد', '');
    }
    return RefreshIndicator(
      onRefresh: () async {
        context.read<ContractorBloc>().add(LoadContractorDashboard());
      },
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: bids.length,
        itemBuilder: (_, i) => _bidCard(bids[i], colors, i),
      ),
    );
  }

  Widget _bidCard(ContractorBidModel b, SemanticColors colors, int index) {
    Color statusColor;
    switch (b.status.toLowerCase()) {
      case 'accepted':
        statusColor = colors.success;
        break;
      case 'pending':
        statusColor = colors.warning;
        break;
      case 'rejected':
        statusColor = colors.error;
        break;
      default:
        statusColor = colors.textSecondary;
    }
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
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
              Expanded(
                  child: Text(b.projectTitle,
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: colors.textPrimary))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                    color: statusColor.withAlpha(15),
                    borderRadius: BorderRadius.circular(6)),
                child: Text(b.status,
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: statusColor)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _miniStat('التكلفة المقترحة', formatCurrency(b.proposedCost), colors),
              _miniStat('المدة', '${b.estimatedDays} يوم', colors),
              _miniStat('التاريخ', _formatDate(b.createdAt), colors),
            ],
          ),
        ],
      ),
    ).animate(delay: (index * 80).ms).fadeIn();
  }

  // ─── Tab 4: Payments ──────────────────────────────────────────────────

  Widget _buildPayments(List<ContractorPaymentModel> payments, SemanticColors colors) {
    if (payments.isEmpty) {
      return _emptyState(colors, Icons.wallet_rounded, 'لا توجد مدفوعات بعد', '');
    }
    return RefreshIndicator(
      onRefresh: () async {
        context.read<ContractorBloc>().add(LoadContractorDashboard());
      },
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: payments.length,
        itemBuilder: (_, i) {
          final p = payments[i];
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
                      color: colors.success.withAlpha(15),
                      borderRadius: BorderRadius.circular(12)),
                  child: Icon(Icons.payments_rounded,
                      color: colors.success, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(p.projectTitle,
                          style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: colors.textPrimary)),
                      Text(_formatDate(p.createdAt),
                          style: TextStyle(
                              fontSize: 11, color: colors.textSubtle)),
                    ],
                  ),
                ),
                Text(formatCurrency(p.amount),
                    style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: colors.secondaryAccent)),
              ],
            ),
          ).animate(delay: (i * 80).ms).fadeIn();
        },
      ),
    );
  }

  // ─── Bid Modal ────────────────────────────────────────────────────────

  void _openBidModal(String projectId) {
    final costController = TextEditingController();
    final daysController = TextEditingController();
    final letterController = TextEditingController();
    final colors = context.colors;
    final bloc = context.read<ContractorBloc>();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: colors.surfaceElevated,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('تقديم عرض',
                style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: colors.textPrimary)),
            const SizedBox(height: 16),
            TextField(
              controller: costController,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                  labelText: 'التكلفة المقترحة (ل.س)',
                  filled: true,
                  fillColor: colors.backgroundSecondary,
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12))),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: daysController,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                  labelText: 'المدة التقديرية (أيام)',
                  filled: true,
                  fillColor: colors.backgroundSecondary,
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12))),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: letterController,
              maxLines: 3,
              decoration: InputDecoration(
                  labelText: 'رسالة تعريفية',
                  filled: true,
                  fillColor: colors.backgroundSecondary,
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12))),
            ),
            const SizedBox(height: 16),
            GradientButton(
              label: 'إرسال العرض',
              icon: Icons.send_rounded,
              onPressed: () {
                final cost = int.tryParse(costController.text) ?? 0;
                final days = int.tryParse(daysController.text) ?? 0;
                if (cost <= 0 || days <= 0) return;

                bloc.add(SubmitContractorBid(
                  projectId: projectId,
                  proposedCost: cost * 100,
                  estimatedDays: days,
                  coverLetter: letterController.text.isNotEmpty
                      ? letterController.text
                      : null,
                ));

                Navigator.pop(ctx);
              },
            ),
          ],
        ),
      ),
    );
  }

  // ─── Shared Helpers ───────────────────────────────────────────────────

  Widget _emptyState(
      SemanticColors colors, IconData icon, String title, String subtitle) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 56, color: colors.textSubtle),
            const SizedBox(height: 16),
            Text(title,
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: colors.textPrimary),
                textAlign: TextAlign.center),
            if (subtitle.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(subtitle,
                  style: TextStyle(fontSize: 13, color: colors.textSecondary),
                  textAlign: TextAlign.center),
            ],
          ],
        ),
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
