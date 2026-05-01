import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';

import '../models/homeowner_models.dart';
import '../data/homeowner_repository.dart';
import '../bloc/homeowner_bloc.dart';
import '../bloc/homeowner_event.dart';
import '../bloc/homeowner_state.dart';
import '../../../core/i18n/t.dart';
import '../../damage_report/screens/damage_report_screen.dart';

class HomeownerPortalScreen extends StatelessWidget {
  const HomeownerPortalScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => HomeownerBloc(repository: HomeownerRepository())..add(const LoadHomeownerTabEvent(0)),
      child: const _HomeownerPortalView(),
    );
  }
}

class _HomeownerPortalView extends StatefulWidget {
  const _HomeownerPortalView();

  @override
  State<_HomeownerPortalView> createState() => _HomeownerPortalViewState();
}

class _HomeownerPortalViewState extends State<_HomeownerPortalView> with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 5, vsync: this);
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) {
        context.read<HomeownerBloc>().add(LoadHomeownerTabEvent(_tabController.index));
      }
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  String _formatCurrency(num amount) {
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
        title: const Text('بوابة المتضرر'),
        actions: [
          IconButton(
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const DamageReportScreen())),
            icon: Icon(Icons.add_circle_rounded, color: colors.primaryBrand),
            tooltip: 'تقرير أضرار',
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          indicatorColor: colors.primaryBrand,
          labelColor: colors.primaryBrand,
          unselectedLabelColor: colors.textSecondary,
          labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
          tabs: const [
            Tab(text: 'لوحة التحكم'),
            Tab(text: 'مشاريعي'),
            Tab(text: 'طلبات الخدمة'),
            Tab(text: 'الموافقات'),
            Tab(text: 'الضمان المالي'),
          ],
        ),
      ),
      body: BlocConsumer<HomeownerBloc, HomeownerState>(
        listener: (context, state) {
          if (state is HomeownerError) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(state.error), backgroundColor: colors.error));
          } else if (state is ApprovalResponseSuccess) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: const Text('تم تسجيل استجابتك بنجاح'), backgroundColor: colors.success));
          }
        },
        builder: (context, state) {
          final isLoading = state is HomeownerLoading;
          final data = state.data;
          
          return TabBarView(
            controller: _tabController,
            children: [
              _buildDashboard(data, isLoading, colors),
              _buildProjects(data, isLoading, colors),
              _buildServiceRequests(data, isLoading, colors),
              _buildApprovals(data, isLoading, colors),
              _buildEscrow(data, isLoading, colors),
            ],
          );
        },
      ),
    );
  }

  // ─── Tab 1: Dashboard ─────────────────────────────────────────────────

  Widget _buildDashboard(HomeownerDashboardModel data, bool isLoading, SemanticColors colors) {
    if (isLoading && data.stats.isEmpty) {
      return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    }
    return RefreshIndicator(
      onRefresh: () async { context.read<HomeownerBloc>().add(const LoadHomeownerTabEvent(0)); },
      color: colors.primaryBrand,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(children: [
            _kpiCard('مشاريع نشطة', '${data.stats['active_projects'] ?? 0}', colors.primaryBrand, Icons.business_rounded, colors),
            const SizedBox(width: 8),
            _kpiCard('عروض واردة', '${data.stats['total_bids_received'] ?? 0}', colors.info, Icons.gavel_rounded, colors),
          ]).animate().fadeIn(),
          const SizedBox(height: 8),
          Row(children: [
            _kpiCard('موافقات معلقة', '${data.stats['pending_approvals'] ?? 0}', colors.warning, Icons.pending_actions_rounded, colors),
            const SizedBox(width: 8),
            _kpiCard('المبلغ المودع', _formatCurrency(data.stats['total_invested'] ?? 0), colors.secondaryAccent, Icons.account_balance_rounded, colors),
          ]).animate(delay: 100.ms).fadeIn(),
          const SizedBox(height: 20),

          Text('المشاريع النشطة', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.textPrimary)),
          const SizedBox(height: 12),
          ...data.projects.where((p) => !['completed', 'cancelled'].contains(p['status'])).toList().asMap().entries.map(
            (e) => _activeProjectCard(e.value, colors, e.key),
          ),
          if (data.projects.where((p) => !['completed', 'cancelled'].contains(p['status'])).isEmpty)
            _emptyState(colors, Icons.house_rounded, 'لا توجد مشاريع نشطة', 'أبلغ عن أضرار لبدء مشروع جديد'),
        ],
      ),
    );
  }

  Widget _kpiCard(String label, String value, Color accent, IconData icon, SemanticColors colors) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: colors.surfaceElevated,
          borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
          border: Border.all(color: colors.strokeSubtle),
        ),
        child: Row(
          children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(color: accent.withAlpha(15), borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, size: 20, color: accent),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: accent), maxLines: 1, overflow: TextOverflow.ellipsis),
                  Text(label, style: TextStyle(fontSize: 10, color: colors.textSecondary), maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _activeProjectCard(Map<String, dynamic> p, SemanticColors colors, int index) {
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
          Row(children: [
            Expanded(child: Text(p['title']?.toString() ?? '', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary))),
            _statusBadge(p['status']?.toString() ?? '', colors),
          ]),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: colors.backgroundSecondary, borderRadius: BorderRadius.circular(8)),
            child: Row(children: [
              _infoChip(Icons.label_rounded, p['damage_type']?.toString() ?? '', colors),
              const SizedBox(width: 12),
              if (p['engineer_name'] != null) _infoChip(Icons.engineering_rounded, p['engineer_name'].toString(), colors),
              const SizedBox(width: 12),
              if (p['contractor_name'] != null) _infoChip(Icons.construction_rounded, p['contractor_name'].toString(), colors),
            ]),
          ),
          const SizedBox(height: 8),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            if ((p['bid_count'] as int?) != null && p['bid_count']! > 0)
              Text('${p['bid_count']} عروض', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: colors.primaryBrand)),
            if ((p['total_boq_cost'] as num?) != null && p['total_boq_cost']! > 0)
              Text(_formatCurrency(p['total_boq_cost']), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: colors.secondaryAccent)),
          ]),
        ],
      ),
    ).animate(delay: (index * 80).ms).fadeIn().slideY(begin: 0.04, end: 0);
  }

  // ─── Tab 2: All Projects ──────────────────────────────────────────────

  Widget _buildProjects(HomeownerDashboardModel data, bool isLoading, SemanticColors colors) {
    if (isLoading && data.projects.isEmpty) return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    if (data.projects.isEmpty) return _emptyState(colors, Icons.house_siding_rounded, 'لا توجد مشاريع بعد', '');
    return RefreshIndicator(
      onRefresh: () async { context.read<HomeownerBloc>().add(const LoadHomeownerTabEvent(1)); },
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: data.projects.length,
        itemBuilder: (_, i) => _activeProjectCard(data.projects[i], colors, i),
      ),
    );
  }

  // ─── Tab 3: Service Requests ──────────────────────────────────────────

  Widget _buildServiceRequests(HomeownerDashboardModel data, bool isLoading, SemanticColors colors) {
    if (isLoading && data.serviceRequests.isEmpty) return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    return RefreshIndicator(
      onRefresh: () async { context.read<HomeownerBloc>().add(const LoadHomeownerTabEvent(2)); },
      color: colors.primaryBrand,
      child: data.serviceRequests.isEmpty
          ? ListView(children: [_emptyState(colors, Icons.handyman_rounded, 'لا توجد طلبات خدمة', 'أنشئ طلباً للحصول على خدمة من الحرفيين')])
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: data.serviceRequests.length,
              itemBuilder: (_, i) {
                final r = data.serviceRequests[i];
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
                      Row(children: [
                        Expanded(child: Text(r['title']?.toString() ?? '', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary))),
                        _statusBadge(r['status']?.toString() ?? '', colors),
                      ]),
                      const SizedBox(height: 8),
                      Wrap(spacing: 8, children: [
                        _tradeBadge(r['trade_needed']?.toString() ?? '', colors),
                        _urgencyBadge(r['urgency']?.toString() ?? '', colors),
                      ]),
                      if (r['description'] != null) ...[
                        const SizedBox(height: 6),
                        Text(r['description'].toString(), style: TextStyle(fontSize: 12, color: colors.textSecondary), maxLines: 2, overflow: TextOverflow.ellipsis),
                      ],
                    ],
                  ),
                ).animate(delay: (i * 80).ms).fadeIn();
              },
            ),
    );
  }

  Widget _tradeBadge(String trade, SemanticColors colors) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: colors.primaryBrand.withAlpha(12), borderRadius: BorderRadius.circular(6)),
      child: Text(trade, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: colors.primaryBrand)),
    );
  }

  Widget _urgencyBadge(String urgency, SemanticColors colors) {
    Color c;
    switch (urgency.toLowerCase()) {
      case 'emergency': c = colors.error; break;
      case 'high': c = colors.warning; break;
      case 'medium': c = colors.info; break;
      default: c = colors.textSecondary;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: c.withAlpha(12), borderRadius: BorderRadius.circular(6)),
      child: Text(urgency, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: c)),
    );
  }

  // ─── Tab 4: Approvals ─────────────────────────────────────────────────

  Widget _buildApprovals(HomeownerDashboardModel data, bool isLoading, SemanticColors colors) {
    if (isLoading && data.approvals.isEmpty) return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    if (data.approvals.isEmpty) return _emptyState(colors, Icons.check_circle_rounded, 'لا توجد موافقات معلقة', '');
    return RefreshIndicator(
      onRefresh: () async { context.read<HomeownerBloc>().add(const LoadHomeownerTabEvent(3)); },
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: data.approvals.length,
        itemBuilder: (_, i) {
          final a = data.approvals[i];
          final isPending = a['status']?.toString().toLowerCase() == 'pending';
          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: colors.surfaceElevated,
              borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
              border: Border.all(color: isPending ? colors.warning.withAlpha(40) : colors.strokeSubtle),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Expanded(child: Text(a['title']?.toString() ?? '', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary))),
                  _statusBadge(a['status']?.toString() ?? '', colors),
                ]),
                const SizedBox(height: 6),
                if (a['description'] != null)
                  Text(a['description'].toString(), style: TextStyle(fontSize: 12, color: colors.textSecondary)),
                const SizedBox(height: 6),
                Wrap(spacing: 10, children: [
                  _infoChip(Icons.business_rounded, a['project_title']?.toString() ?? '', colors),
                  _infoChip(Icons.engineering_rounded, a['engineer_name']?.toString() ?? '', colors),
                ]),
                if (isPending) ...[
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(
                      child: _actionButton(context.tr('admin_reject'), colors.error, () {
                        context.read<HomeownerBloc>().add(RespondToApprovalEvent(a['approval_id'].toString(), 'rejected'));
                      }),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _actionButton(context.tr('str_bd78c08e'), colors.success, () {
                        context.read<HomeownerBloc>().add(RespondToApprovalEvent(a['approval_id'].toString(), 'approved'));
                      }),
                    ),
                  ]),
                ],
              ],
            ),
          ).animate(delay: (i * 80).ms).fadeIn();
        },
      ),
    );
  }

  Widget _actionButton(String label, Color c, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: c.withAlpha(12),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: c.withAlpha(30)),
        ),
        child: Center(child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c))),
      ),
    );
  }

  // ─── Tab 5: Escrow ────────────────────────────────────────────────────

  Widget _buildEscrow(HomeownerDashboardModel data, bool isLoading, SemanticColors colors) {
    if (isLoading && data.escrow.isEmpty) return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    return RefreshIndicator(
      onRefresh: () async { context.read<HomeownerBloc>().add(const LoadHomeownerTabEvent(4)); },
      color: colors.primaryBrand,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(children: [
            _escrowCard(context.tr('str_ab95b0d8'), _formatCurrency(data.escrow['total_deposited'] ?? 0), colors.primaryBrand, colors),
            const SizedBox(width: 10),
            _escrowCard(context.tr('str_99ef4a75'), _formatCurrency(data.escrow['total_released'] ?? 0), colors.success, colors),
          ]).animate().fadeIn(),
          const SizedBox(height: 10),
          Row(children: [
            _escrowCard(context.tr('str_f013adbb'), _formatCurrency(data.escrow['held_in_escrow'] ?? 0), colors.warning, colors),
            const SizedBox(width: 10),
            _escrowCard(context.tr('str_aac24d04'), '${data.escrow['projects_with_escrow'] ?? 0}', colors.textPrimary, colors),
          ]).animate(delay: 100.ms).fadeIn(),

          if ((data.escrow['held_in_escrow'] as num?) != null && (data.escrow['held_in_escrow'] as num) > 0) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: colors.primaryBrand.withAlpha(8),
                borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
                border: Border.all(color: colors.primaryBrand.withAlpha(20)),
              ),
              child: Row(
                children: [
                  Icon(Icons.verified_user_rounded, size: 22, color: colors.primaryBrand),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'أموالك محفوظة في حساب الضمان وسيتم تحريرها عند الموافقة على مراحل البناء.',
                      style: TextStyle(fontSize: 12, color: colors.primaryBrand, fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ).animate(delay: 200.ms).fadeIn(),
          ],
        ],
      ),
    );
  }

  Widget _escrowCard(String label, String value, Color accent, SemanticColors colors) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: accent.withAlpha(6),
          borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
          border: Border.all(color: accent.withAlpha(20)),
        ),
        child: Column(
          children: [
            Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: accent), maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 4),
            Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: accent.withAlpha(160))),
          ],
        ),
      ),
    );
  }

  // ─── Shared Widgets ───────────────────────────────────────────────────

  Widget _statusBadge(String status, SemanticColors colors) {
    Color c;
    switch (status.toLowerCase()) {
      case 'completed': c = colors.success; break;
      case 'in_progress': c = colors.warning; break;
      case 'pending': case 'pending_assessment': c = colors.info; break;
      case 'cancelled': c = colors.error; break;
      default: c = colors.textSecondary;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: c.withAlpha(15), borderRadius: BorderRadius.circular(6)),
      child: Text(status.replaceAll('_', ' '), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: c)),
    );
  }

  Widget _infoChip(IconData icon, String text, SemanticColors colors) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 12, color: colors.textSubtle),
        const SizedBox(width: 3),
        Flexible(child: Text(text, style: TextStyle(fontSize: 11, color: colors.textSecondary), maxLines: 1, overflow: TextOverflow.ellipsis)),
      ],
    );
  }

  Widget _emptyState(SemanticColors colors, IconData icon, String title, String subtitle) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 56, color: colors.textSubtle),
            const SizedBox(height: 16),
            Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary), textAlign: TextAlign.center),
            if (subtitle.isNotEmpty) ...[const SizedBox(height: 6), Text(subtitle, style: TextStyle(fontSize: 13, color: colors.textSecondary), textAlign: TextAlign.center)],
          ],
        ),
      ),
    );
  }
}
