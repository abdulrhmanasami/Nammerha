import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/services/api_services.dart';
import '../../../core/widgets/gradient_button.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Contractor Portal — Multi-tab Dashboard
/// ═══════════════════════════════════════════════════════════════════════════
/// Mirrors web: frontend/src/pages/contractor-portal.ts
/// 4 tabs: Dashboard, Marketplace, Bids, Payments
/// ═══════════════════════════════════════════════════════════════════════════
class ContractorPortalScreen extends StatefulWidget {
  const ContractorPortalScreen({super.key});

  @override
  State<ContractorPortalScreen> createState() => _ContractorPortalScreenState();
}

class _ContractorPortalScreenState extends State<ContractorPortalScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  final ContractorApi _api = ContractorApi();

  Map<String, dynamic> _stats = {};
  List<Map<String, dynamic>> _projects = [];
  List<Map<String, dynamic>> _marketplace = [];
  List<Map<String, dynamic>> _bids = [];
  List<Map<String, dynamic>> _payments = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) _loadTabData(_tabController.index);
    });
    _loadTabData(0);
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

  Future<void> _loadTabData(int index) async {
    setState(() => _isLoading = true);
    try {
      switch (index) {
        case 0:
          // Load independently — one failing should not kill both
          try {
            _stats = await _api.getStats();
          } catch (_) {
            _stats = {'assigned_projects': 0, 'active_bids': 0, 'completed_projects': 0, 'total_earnings': 0};
          }
          try {
            _projects = await _api.getProjects();
          } catch (_) {}
          break;
        case 1:
          try { _marketplace = await _api.getMarketplace(); } catch (_) {}
          break;
        case 2:
          try { _bids = await _api.getBids(); } catch (_) {}
          break;
        case 3:
          try { _payments = await _api.getPayments(); } catch (_) {}
          break;
      }
    } catch (_) {}
    if (mounted) setState(() => _isLoading = false);
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
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildDashboard(colors),
          _buildMarketplace(colors),
          _buildBids(colors),
          _buildPayments(colors),
        ],
      ),
    );
  }

  // ─── Tab 1: Dashboard ─────────────────────────────────────────────────

  Widget _buildDashboard(SemanticColors colors) {
    if (_isLoading && _stats.isEmpty) {
      return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    }
    return RefreshIndicator(
      onRefresh: () => _loadTabData(0),
      color: colors.primaryBrand,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildKpiRow(colors),
          const SizedBox(height: 20),
          Text('المشاريع المُسندة', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.textPrimary)),
          const SizedBox(height: 12),
          if (_projects.isEmpty)
            _emptyState(colors, Icons.assignment_rounded, 'لا توجد مشاريع مُسندة بعد', 'تصفح السوق وقدّم عروضك')
          else
            ..._projects.asMap().entries.map((e) => _projectCard(e.value, colors, e.key)),
        ],
      ),
    );
  }

  Widget _buildKpiRow(SemanticColors colors) {
    return Row(
      children: [
        _kpiCard('مشاريع نشطة', '${_stats['assigned_projects'] ?? 0}', colors.primaryBrand, colors),
        const SizedBox(width: 8),
        _kpiCard('عروض معلقة', '${_stats['active_bids'] ?? 0}', colors.warning, colors),
        const SizedBox(width: 8),
        _kpiCard('مكتملة', '${_stats['completed_projects'] ?? 0}', colors.success, colors),
        const SizedBox(width: 8),
        _kpiCard('الأرباح', formatCurrency(_stats['total_earnings'] ?? 0), colors.secondaryAccent, colors),
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
            Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: accent), maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 2),
            Text(label, style: TextStyle(fontSize: 9, color: colors.textSecondary), maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );
  }

  Widget _projectCard(Map<String, dynamic> p, SemanticColors colors, int index) {
    final progress = (p['progress'] ?? 0) as num;
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
              Expanded(child: Text(p['title']?.toString() ?? '', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary))),
              _phaseBadge(p['phase']?.toString() ?? '', colors),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(Icons.location_on_rounded, size: 14, color: colors.textSubtle),
              const SizedBox(width: 4),
              Text(p['region']?.toString() ?? '', style: TextStyle(fontSize: 12, color: colors.textSecondary)),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: progress / 100,
                    backgroundColor: colors.backgroundSecondary,
                    valueColor: AlwaysStoppedAnimation(colors.warning),
                    minHeight: 6,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text('${progress.toInt()}%', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: colors.textPrimary)),
            ],
          ),
        ],
      ),
    ).animate(delay: (index * 80).ms).fadeIn().slideY(begin: 0.05, end: 0);
  }

  Widget _phaseBadge(String phase, SemanticColors colors) {
    Color c;
    switch (phase.toLowerCase()) {
      case 'planning': c = colors.info; break;
      case 'in_progress': c = colors.warning; break;
      case 'completed': c = colors.success; break;
      default: c = colors.textSecondary;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: c.withAlpha(15), borderRadius: BorderRadius.circular(6)),
      child: Text(phase, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: c)),
    );
  }

  // ─── Tab 2: Marketplace ───────────────────────────────────────────────

  Widget _buildMarketplace(SemanticColors colors) {
    if (_isLoading && _marketplace.isEmpty) {
      return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    }
    if (_marketplace.isEmpty) {
      return _emptyState(colors, Icons.search_rounded, 'لا توجد مشاريع متاحة', 'ستظهر المشاريع الجديدة هنا');
    }
    return RefreshIndicator(
      onRefresh: () => _loadTabData(1),
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _marketplace.length,
        itemBuilder: (_, i) => _marketplaceCard(_marketplace[i], colors, i),
      ),
    );
  }

  Widget _marketplaceCard(Map<String, dynamic> p, SemanticColors colors, int index) {
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
              Expanded(child: Text(p['title']?.toString() ?? '', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary), maxLines: 2, overflow: TextOverflow.ellipsis)),
              Text(formatCurrency(p['total_estimated_cost'] ?? 0), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: colors.primaryBrand)),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: colors.backgroundSecondary, borderRadius: BorderRadius.circular(10)),
            child: Row(
              children: [
                Icon(Icons.location_on_rounded, size: 14, color: colors.textSubtle),
                const SizedBox(width: 4),
                Text(p['region']?.toString() ?? '', style: TextStyle(fontSize: 12, color: colors.textSecondary)),
                const SizedBox(width: 12),
                Icon(Icons.build_rounded, size: 14, color: colors.textSubtle),
                const SizedBox(width: 4),
                Text(p['damage_type']?.toString() ?? '', style: TextStyle(fontSize: 12, color: colors.textSecondary)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  _miniStat('بنود', '${p['boq_count'] ?? 0}', colors),
                  const SizedBox(width: 16),
                  _miniStat('عروض', '${p['bid_count'] ?? 0}', colors),
                ],
              ),
              GradientButton(
                label: 'قدّم عرض',
                icon: Icons.gavel_rounded,
                onPressed: () => _openBidModal(p['project_id']?.toString() ?? ''),
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
        Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: colors.textSubtle)),
        Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary)),
      ],
    );
  }

  // ─── Tab 3: Bids ──────────────────────────────────────────────────────

  Widget _buildBids(SemanticColors colors) {
    if (_isLoading && _bids.isEmpty) {
      return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    }
    if (_bids.isEmpty) {
      return _emptyState(colors, Icons.flag_rounded, 'لم تقدم أي عروض بعد', '');
    }
    return RefreshIndicator(
      onRefresh: () => _loadTabData(2),
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _bids.length,
        itemBuilder: (_, i) => _bidCard(_bids[i], colors, i),
      ),
    );
  }

  Widget _bidCard(Map<String, dynamic> b, SemanticColors colors, int index) {
    final status = b['status']?.toString() ?? '';
    Color statusColor;
    switch (status.toLowerCase()) {
      case 'accepted': statusColor = colors.success; break;
      case 'pending': statusColor = colors.warning; break;
      case 'rejected': statusColor = colors.error; break;
      default: statusColor = colors.textSecondary;
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
              Expanded(child: Text(b['project_title']?.toString() ?? '', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: statusColor.withAlpha(15), borderRadius: BorderRadius.circular(6)),
                child: Text(status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: statusColor)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _miniStat('التكلفة المقترحة', formatCurrency(b['proposed_cost'] ?? 0), colors),
              _miniStat('المدة', '${b['estimated_days'] ?? 0} يوم', colors),
              _miniStat('التاريخ', _formatDate(b['created_at']?.toString() ?? ''), colors),
            ],
          ),
        ],
      ),
    ).animate(delay: (index * 80).ms).fadeIn();
  }

  // ─── Tab 4: Payments ──────────────────────────────────────────────────

  Widget _buildPayments(SemanticColors colors) {
    if (_isLoading && _payments.isEmpty) {
      return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    }
    if (_payments.isEmpty) {
      return _emptyState(colors, Icons.wallet_rounded, 'لا توجد مدفوعات بعد', '');
    }
    return RefreshIndicator(
      onRefresh: () => _loadTabData(3),
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _payments.length,
        itemBuilder: (_, i) {
          final p = _payments[i];
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
                  width: 44, height: 44,
                  decoration: BoxDecoration(color: colors.success.withAlpha(15), borderRadius: BorderRadius.circular(12)),
                  child: Icon(Icons.payments_rounded, color: colors.success, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(p['project_title']?.toString() ?? '', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.textPrimary)),
                      Text(_formatDate(p['created_at']?.toString() ?? ''), style: TextStyle(fontSize: 11, color: colors.textSubtle)),
                    ],
                  ),
                ),
                Text(formatCurrency(p['amount'] ?? 0), style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: colors.secondaryAccent)),
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

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: colors.surfaceElevated,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('تقديم عرض', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: colors.textPrimary)),
            const SizedBox(height: 16),
            TextField(
              controller: costController,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(labelText: 'التكلفة المقترحة (ل.س)', filled: true, fillColor: colors.backgroundSecondary, border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: daysController,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(labelText: 'المدة التقديرية (أيام)', filled: true, fillColor: colors.backgroundSecondary, border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: letterController,
              maxLines: 3,
              decoration: InputDecoration(labelText: 'رسالة تعريفية', filled: true, fillColor: colors.backgroundSecondary, border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
            ),
            const SizedBox(height: 16),
            GradientButton(
              label: 'إرسال العرض',
              icon: Icons.send_rounded,
              onPressed: () async {
                final cost = int.tryParse(costController.text) ?? 0;
                final days = int.tryParse(daysController.text) ?? 0;
                if (cost <= 0 || days <= 0) return;
                try {
                  await _api.submitBid(
                    projectId: projectId,
                    proposedCost: cost * 100,
                    estimatedDays: days,
                    coverLetter: letterController.text.isNotEmpty ? letterController.text : null,
                  );
                  if (ctx.mounted) Navigator.pop(ctx);
                  _loadTabData(0);
                  _loadTabData(1);
                } catch (_) {}
              },
            ),
          ],
        ),
      ),
    );
  }

  // ─── Shared Helpers ───────────────────────────────────────────────────

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
            if (subtitle.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(subtitle, style: TextStyle(fontSize: 13, color: colors.textSecondary), textAlign: TextAlign.center),
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
    } catch (_) { return dateStr; }
  }
}
