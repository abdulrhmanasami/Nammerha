import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';

import '../models/tradesperson_models.dart';
import '../data/tradesperson_repository.dart';
import '../bloc/tradesperson_bloc.dart';
import '../bloc/tradesperson_event.dart';
import '../bloc/tradesperson_state.dart';
import '../../../core/i18n/t.dart';

class TradespersonPortalScreen extends StatelessWidget {
  const TradespersonPortalScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => TradespersonBloc(repository: TradespersonRepository())
        ..add(LoadProfileEvent()) // Ensure availability is known
        ..add(const LoadTradespersonTabEvent(0)),
      child: const _TradespersonPortalView(),
    );
  }
}

class _TradespersonPortalView extends StatefulWidget {
  const _TradespersonPortalView();

  @override
  State<_TradespersonPortalView> createState() => _TradespersonPortalViewState();
}

class _TradespersonPortalViewState extends State<_TradespersonPortalView> with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 5, vsync: this);
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) {
        context.read<TradespersonBloc>().add(LoadTradespersonTabEvent(_tabController.index));
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
        title: const Text('بوابة الحرفي'),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          indicatorColor: colors.primaryBrand,
          labelColor: colors.primaryBrand,
          unselectedLabelColor: colors.textSecondary,
          labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
          tabs: const [
            Tab(text: 'لوحة التحكم'),
            Tab(text: 'الطلبات'),
            Tab(text: 'المهام'),
            Tab(text: 'الأرباح'),
            Tab(text: 'الملف'),
          ],
        ),
      ),
      body: BlocConsumer<TradespersonBloc, TradespersonState>(
        listener: (context, state) {
          if (state is TradespersonError) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(state.error), backgroundColor: colors.error));
          } else if (state is ActionSuccess) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(state.message), backgroundColor: colors.success));
          }
        },
        builder: (context, state) {
          final isLoading = state is TradespersonLoading;
          final data = state.data;

          return TabBarView(
            controller: _tabController,
            children: [
              _buildDashboard(data, isLoading, colors),
              _buildRequests(data, isLoading, colors),
              _buildAssignments(data, isLoading, colors),
              _buildEarnings(data, isLoading, colors),
              _buildProfile(data, isLoading, colors),
            ],
          );
        },
      ),
    );
  }

  // ─── Tab 1: Dashboard ─────────────────────────────────────────────────

  Widget _buildDashboard(TradespersonDashboardModel data, bool isLoading, SemanticColors colors) {
    if (isLoading && data.stats.isEmpty) {
      return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    }
    return RefreshIndicator(
      onRefresh: () async { context.read<TradespersonBloc>().add(const LoadTradespersonTabEvent(0)); },
      color: colors.primaryBrand,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildAvailabilityRow(data.availability, colors),
          const SizedBox(height: 16),
          Row(children: [
            _kpiCard('مهام نشطة', '${data.stats['active_jobs'] ?? 0}', colors.primaryBrand, colors),
            const SizedBox(width: 8),
            _kpiCard(context.tr('str_03eacf6f'), '${data.stats['completed_jobs'] ?? 0}', colors.success, colors),
          ]).animate().fadeIn(),
          const SizedBox(height: 8),
          Row(children: [
            _kpiCard(context.tr('str_e3a4dbca'), _formatCurrency(data.stats['total_earnings'] ?? 0), colors.secondaryAccent, colors),
            const SizedBox(width: 8),
            _kpiCard(context.tr('str_e0efcd03'), data.stats['average_rating'] != null ? '${(data.stats['average_rating'] as num).toStringAsFixed(1)} ★' : '—', colors.warning, colors),
          ]).animate(delay: 100.ms).fadeIn(),
          const SizedBox(height: 8),
          Row(children: [
            _kpiCard('طلبات معلقة', '${data.stats['pending_requests'] ?? 0}', colors.info, colors),
            const SizedBox(width: 8),
            _kpiCard('مهام نشطة', '${data.stats['active_assignments'] ?? 0}', colors.warning, colors),
          ]).animate(delay: 200.ms).fadeIn(),
        ],
      ),
    );
  }

  Widget _buildAvailabilityRow(String currentAvailability, SemanticColors colors) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('حالة التواجد', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: colors.textPrimary)),
          const SizedBox(height: 10),
          Row(
            children: ['available', 'busy', 'offline'].map((s) {
              final isActive = currentAvailability == s;
              Color c;
              String label;
              switch (s) {
                case 'available': c = colors.success; label = context.tr('str_e73a19f1'); break;
                case 'busy': c = colors.warning; label = context.tr('str_005a79cf'); break;
                default: c = colors.textSecondary; label = 'غير متصل';
              }
              return Expanded(
                child: GestureDetector(
                  onTap: () {
                    context.read<TradespersonBloc>().add(UpdateAvailabilityEvent(s));
                  },
                  child: AnimatedContainer(
                    duration: NammerhaAnimations.fast,
                    margin: const EdgeInsetsDirectional.only(end: 6),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: isActive ? c.withAlpha(15) : colors.backgroundSecondary,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: isActive ? c : colors.strokeSubtle, width: isActive ? 1.5 : 1),
                    ),
                    child: Center(child: Text(label, style: TextStyle(fontSize: 12, fontWeight: isActive ? FontWeight.w700 : FontWeight.w500, color: isActive ? c : colors.textSecondary))),
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _kpiCard(String label, String value, Color accent, SemanticColors colors) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: colors.surfaceElevated,
          borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
          border: Border.all(color: colors.strokeSubtle),
        ),
        child: Column(
          children: [
            Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: accent), maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 4),
            Text(label, style: TextStyle(fontSize: 11, color: colors.textSecondary)),
          ],
        ),
      ),
    );
  }

  // ─── Tab 2: Requests (Thumbtack) ──────────────────────────────────────

  Widget _buildRequests(TradespersonDashboardModel data, bool isLoading, SemanticColors colors) {
    if (isLoading && data.requests.isEmpty) {
      return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    }
    if (data.requests.isEmpty) {
      return _emptyState(colors, Icons.search_rounded, 'لا توجد طلبات تتناسب مع حرفتك', 'ستظهر الطلبات الجديدة تلقائياً');
    }
    return RefreshIndicator(
      onRefresh: () async { context.read<TradespersonBloc>().add(const LoadTradespersonTabEvent(1)); },
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: data.requests.length,
        itemBuilder: (_, i) {
          final r = data.requests[i];
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
                    Expanded(child: Text(r['title']?.toString() ?? '', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary))),
                    _urgencyBadge(r['urgency']?.toString() ?? '', colors),
                  ],
                ),
                if (r['description'] != null) ...[
                  const SizedBox(height: 6),
                  Text(r['description'].toString(), style: TextStyle(fontSize: 12, color: colors.textSecondary), maxLines: 2, overflow: TextOverflow.ellipsis),
                ],
                const SizedBox(height: 10),
                Wrap(
                  spacing: 12,
                  children: [
                    _infoChip(Icons.person_rounded, r['homeowner_name']?.toString() ?? '', colors),
                    if (r['address_text'] != null) _infoChip(Icons.location_on_rounded, r['address_text'].toString(), colors),
                    if (r['budget_max'] != null) _infoChip(Icons.monetization_on_rounded, _formatCurrency(r['budget_max']), colors),
                  ],
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      context.read<TradespersonBloc>().add(AcceptRequestEvent(r['request_id']?.toString() ?? ''));
                    },
                    icon: const Icon(Icons.check_rounded, size: 18),
                    label: const Text('قبول المهمة'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: colors.secondaryAccent,
                      foregroundColor: const Color(0xFFFFFFFF),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ),
              ],
            ),
          ).animate(delay: (i * 80).ms).fadeIn();
        },
      ),
    );
  }

  Widget _urgencyBadge(String urgency, SemanticColors colors) {
    Color c;
    switch (urgency.toLowerCase()) {
      case 'urgent': c = colors.error; break;
      case 'high': c = colors.warning; break;
      default: c = colors.info;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: c.withAlpha(15), borderRadius: BorderRadius.circular(6)),
      child: Text(urgency, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: c)),
    );
  }

  Widget _infoChip(IconData icon, String text, SemanticColors colors) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 12, color: colors.textSubtle),
        const SizedBox(width: 3),
        Text(text, style: TextStyle(fontSize: 11, color: colors.textSecondary)),
      ],
    );
  }

  // ─── Tab 3: Assignments ───────────────────────────────────────────────

  Widget _buildAssignments(TradespersonDashboardModel data, bool isLoading, SemanticColors colors) {
    if (isLoading && data.assignments.isEmpty) {
      return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    }
    if (data.assignments.isEmpty) {
      return _emptyState(colors, Icons.assignment_rounded, 'لا توجد مهام من المقاولين', '');
    }
    return RefreshIndicator(
      onRefresh: () async { context.read<TradespersonBloc>().add(const LoadTradespersonTabEvent(2)); },
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: data.assignments.length,
        itemBuilder: (_, i) {
          final a = data.assignments[i];
          final status = a['status']?.toString() ?? '';
          final isPending = status.toLowerCase() == 'pending';
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
                    Expanded(child: Text(a['project_title']?.toString() ?? '', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary))),
                    _statusBadge(status, colors),
                  ],
                ),
                const SizedBox(height: 6),
                _infoChip(Icons.business_rounded, a['contractor_name']?.toString() ?? '', colors),
                if (a['scope_description'] != null) ...[
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(color: colors.backgroundSecondary, borderRadius: BorderRadius.circular(8)),
                    child: Text(a['scope_description'].toString(), style: TextStyle(fontSize: 12, color: colors.textSecondary)),
                  ),
                ],
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('${_formatCurrency(a['agreed_rate'] ?? 0)}/${a['rate_type'] ?? context.tr('str_10954620')}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: colors.secondaryAccent)),
                    if (isPending)
                      Row(
                        children: [
                          _actionChip(context.tr('admin_reject'), colors.error, () {
                            context.read<TradespersonBloc>().add(RespondToAssignmentEvent(a['assignment_id']?.toString() ?? '', false));
                          }),
                          const SizedBox(width: 8),
                          _actionChip(context.tr('admin_approve'), colors.primaryBrand, () {
                            context.read<TradespersonBloc>().add(RespondToAssignmentEvent(a['assignment_id']?.toString() ?? '', true));
                          }),
                        ],
                      ),
                  ],
                ),
              ],
            ),
          ).animate(delay: (i * 80).ms).fadeIn();
        },
      ),
    );
  }

  Widget _actionChip(String label, Color c, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(color: c.withAlpha(15), borderRadius: BorderRadius.circular(8), border: Border.all(color: c.withAlpha(40))),
        child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: c)),
      ),
    );
  }

  Widget _statusBadge(String status, SemanticColors colors) {
    Color c;
    switch (status.toLowerCase()) {
      case 'in_progress': c = colors.warning; break;
      case 'completed': c = colors.success; break;
      case 'pending': c = colors.info; break;
      default: c = colors.textSecondary;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: c.withAlpha(15), borderRadius: BorderRadius.circular(6)),
      child: Text(status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: c)),
    );
  }

  // ─── Tab 4: Earnings ──────────────────────────────────────────────────

  Widget _buildEarnings(TradespersonDashboardModel data, bool isLoading, SemanticColors colors) {
    if (isLoading && data.earnings.isEmpty) {
      return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    }
    if (data.earnings.isEmpty) {
      return _emptyState(colors, Icons.monetization_on_rounded, 'لا توجد أرباح بعد', '');
    }
    return RefreshIndicator(
      onRefresh: () async { context.read<TradespersonBloc>().add(const LoadTradespersonTabEvent(3)); },
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: data.earnings.length,
        itemBuilder: (_, i) {
          final e = data.earnings[i];
          final isContractor = e['source_type'] == 'assignment';
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
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(e['title']?.toString() ?? '', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary)),
                      const SizedBox(height: 4),
                      Row(children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(color: (isContractor ? colors.primaryBrand : colors.secondaryAccent).withAlpha(15), borderRadius: BorderRadius.circular(4)),
                          child: Text(isContractor ? context.tr('role_contractor') : context.tr('str_d9e423c5'), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: isContractor ? colors.primaryBrand : colors.secondaryAccent)),
                        ),
                        if (e['completed_at'] != null) ...[
                          const SizedBox(width: 8),
                          Text(_formatDate(e['completed_at'].toString()), style: TextStyle(fontSize: 11, color: colors.textSubtle)),
                        ],
                      ]),
                    ],
                  ),
                ),
                Text(_formatCurrency(e['amount'] ?? 0), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: colors.secondaryAccent)),
              ],
            ),
          ).animate(delay: (i * 80).ms).fadeIn();
        },
      ),
    );
  }

  // ─── Tab 5: Profile ───────────────────────────────────────────────────

  Widget _buildProfile(TradespersonDashboardModel data, bool isLoading, SemanticColors colors) {
    if (isLoading && data.profile.isEmpty) {
      return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    }
    return RefreshIndicator(
      onRefresh: () async { context.read<TradespersonBloc>().add(const LoadTradespersonTabEvent(4)); },
      color: colors.primaryBrand,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: NammerhaGradients.brandPrimary,
              borderRadius: BorderRadius.circular(NammerhaTheme.radiusXl),
            ),
            child: Column(
              children: [
                CircleAvatar(radius: 36, backgroundColor: const Color(0xFFFFFFFF).withAlpha(25), child: Text((data.profile['full_name']?.toString() ?? '?')[0], style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: Color(0xFFFFFFFF)))),
                const SizedBox(height: 12),
                Text(data.profile['full_name']?.toString() ?? '', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Color(0xFFFFFFFF))),
                const SizedBox(height: 4),
                Text(data.profile['trade']?.toString() ?? 'غير محدد', style: TextStyle(fontSize: 14, color: const Color(0xFFFFFFFF).withAlpha(200))),
              ],
            ),
          ).animate().fadeIn(duration: 500.ms),
          const SizedBox(height: 16),
          _profileRow('سنوات الخبرة', '${data.profile['years_experience'] ?? '—'}', colors),
          _profileRow('الأجر بالساعة', data.profile['hourly_rate'] != null ? _formatCurrency(data.profile['hourly_rate']) : '—', colors),
          _profileRow('الأجر اليومي', data.profile['daily_rate'] != null ? _formatCurrency(data.profile['daily_rate']) : '—', colors),
          _profileRow('نقاط الأداء', '${data.profile['dynamic_score'] ?? 0}/100', colors),
          _profileRow('المهام المكتملة', '${data.profile['completed_jobs_count'] ?? 0}', colors),
          _profileRow(context.tr('str_e0efcd03'), data.profile['average_rating'] != null ? '${(data.profile['average_rating'] as num).toStringAsFixed(1)} ★' : 'لا تقييمات بعد', colors),
        ],
      ),
    );
  }

  Widget _profileRow(String label, String value, SemanticColors colors) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontSize: 13, color: colors.textSecondary)),
          Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary)),
        ],
      ),
    );
  }

  // ─── Shared ───────────────────────────────────────────────────────────

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
