import 'package:phosphor_flutter/phosphor_flutter.dart';
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
import '../../../core/utils/format_utils.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';
import '../../../core/utils/animation_budget.dart';
import '../../../core/utils/date_utils.dart';

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

  // Centralized formatter via FormatUtils (Platinum Standard)
  String _formatCurrency(num amount) => FormatUtils.currency(amount);

  // P2-002 FIX: Inline _formatDate() removed → NammerhaDateUtils.formatDateShort()

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text(context.tr('tp_portal_title')),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          indicatorColor: colors.primaryBrand,
          labelColor: colors.primaryBrand,
          unselectedLabelColor: colors.textSecondary,
          labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
          tabs: [
            Tab(text: context.tr('ct_tab_dashboard')),
            Tab(text: context.tr('tp_tab_requests')),
            Tab(text: context.tr('tp_tab_tasks')),
            Tab(text: context.tr('tp_tab_earnings')),
            Tab(text: context.tr('tp_tab_profile')),
          ],
        ),
      ),
      body: BlocConsumer<TradespersonBloc, TradespersonState>(
        
        buildWhen: (previous, current) => current is! TradespersonError && current is! ActionSuccess,listener: (context, state) {
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
    if (isLoading && data.stats == TradespersonStatsModel.empty) {
      return NammerhaShimmerLoader(colors: colors);
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
            _kpiCard(context.tr('tp_active_jobs'), '${data.stats.activeJobs}', colors.primaryBrand, colors),
            const SizedBox(width: 8),
            _kpiCard(context.tr('ct_completed'), '${data.stats.completedJobs}', colors.success, colors),
          ]).nmAnimate(context).fadeIn(),
          const SizedBox(height: 8),
          Row(children: [
            _kpiCard(context.tr('ct_earnings'), _formatCurrency(data.stats.totalEarnings), colors.secondaryAccent, colors),
            const SizedBox(width: 8),
            _kpiCard(context.tr('tp_avg_rating'), data.stats.averageRating != null ? '${data.stats.averageRating!.toStringAsFixed(1)} ★' : '—', colors.warning, colors),
          ]).nmAnimate(context, delay: 100.ms).fadeIn(),
          const SizedBox(height: 8),
          Row(children: [
            _kpiCard(context.tr('tp_pending_requests'), '${data.stats.pendingRequests}', colors.info, colors),
            const SizedBox(width: 8),
            _kpiCard(context.tr('tp_active_assignments'), '${data.stats.activeAssignments}', colors.warning, colors),
          ]).nmAnimate(context, delay: 200.ms).fadeIn(),
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
          Text(context.tr('tp_availability'), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: colors.textPrimary)),
          const SizedBox(height: 10),
          Row(
            children: ['available', 'busy', 'offline'].map((s) {
              final isActive = currentAvailability == s;
              Color c;
              String label;
              switch (s) {
                case 'available': c = colors.success; label = context.tr('tp_available'); break;
                case 'busy': c = colors.warning; label = context.tr('tp_busy'); break;
                default: c = colors.textSecondary; label = context.tr('tp_offline');
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
      return NammerhaShimmerLoader(colors: colors);
    }
    if (data.requests.isEmpty) {
      return _emptyState(colors, PhosphorIconsRegular.magnifyingGlass, context.tr('tp_no_requests'), context.tr('tp_requests_hint'));
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
                    Expanded(child: Text(r.title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary))),
                    _urgencyBadge(r.urgency, colors),
                  ],
                ),
                if (r.description != null) ...[
                  const SizedBox(height: 6),
                  Text(r.description!, style: TextStyle(fontSize: 12, color: colors.textSecondary), maxLines: 2, overflow: TextOverflow.ellipsis),
                ],
                const SizedBox(height: 10),
                Wrap(
                  spacing: 12,
                  children: [
                    _infoChip(PhosphorIconsRegular.user, r.homeownerName, colors),
                    if (r.addressText != null) _infoChip(PhosphorIconsRegular.mapPin, r.addressText!, colors),
                    if (r.budgetMax != null) _infoChip(PhosphorIconsRegular.coin, _formatCurrency(r.budgetMax!), colors),
                  ],
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      context.read<TradespersonBloc>().add(AcceptRequestEvent(r.requestId));
                    },
                    icon: Icon(PhosphorIconsRegular.check, size: 18),
                    label: Text(context.tr('tp_accept_task')),
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
          ).nmAnimate(context, delay: (i * 80).ms).fadeIn();
        },
      ),
    );
  }

  Widget _urgencyBadge(String urgency, SemanticColors colors) {
    Color c;
    switch (urgency.toLowerCase()) {
      case 'urgent': c = colors.error; break;
      case 'emergency': c = colors.error; break;
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
      return NammerhaShimmerLoader(colors: colors);
    }
    if (data.assignments.isEmpty) {
      return _emptyState(colors, PhosphorIconsRegular.clipboardText, context.tr('tp_no_assignments'), '');
    }
    return RefreshIndicator(
      onRefresh: () async { context.read<TradespersonBloc>().add(const LoadTradespersonTabEvent(2)); },
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: data.assignments.length,
        itemBuilder: (_, i) {
          final a = data.assignments[i];
          final isPending = a.status.toLowerCase() == 'pending';
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
                    Expanded(child: Text(a.projectTitle, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary))),
                    _statusBadge(a.status, colors),
                  ],
                ),
                const SizedBox(height: 6),
                _infoChip(PhosphorIconsRegular.buildings, a.contractorName, colors),
                if (a.scopeDescription.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(color: colors.backgroundSecondary, borderRadius: BorderRadius.circular(8)),
                    child: Text(a.scopeDescription, style: TextStyle(fontSize: 12, color: colors.textSecondary)),
                  ),
                ],
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('${_formatCurrency(a.agreedRate)}/${a.rateType}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: colors.secondaryAccent)),
                    if (isPending)
                      Row(
                        children: [
                          _actionChip(context.tr('admin_reject'), colors.error, () {
                            context.read<TradespersonBloc>().add(RespondToAssignmentEvent(a.assignmentId, false));
                          }),
                          const SizedBox(width: 8),
                          _actionChip(context.tr('admin_approve'), colors.primaryBrand, () {
                            context.read<TradespersonBloc>().add(RespondToAssignmentEvent(a.assignmentId, true));
                          }),
                        ],
                      ),
                  ],
                ),
              ],
            ),
          ).nmAnimate(context, delay: (i * 80).ms).fadeIn();
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
      return NammerhaShimmerLoader(colors: colors);
    }
    if (data.earnings.isEmpty) {
      return _emptyState(colors, PhosphorIconsRegular.coin, context.tr('tp_no_earnings'), '');
    }
    return RefreshIndicator(
      onRefresh: () async { context.read<TradespersonBloc>().add(const LoadTradespersonTabEvent(3)); },
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: data.earnings.length,
        itemBuilder: (_, i) {
          final e = data.earnings[i];
          final isContractor = e.sourceType == 'assignment';
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
                      Text(e.title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary)),
                      const SizedBox(height: 4),
                      Row(children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(color: (isContractor ? colors.primaryBrand : colors.secondaryAccent).withAlpha(15), borderRadius: BorderRadius.circular(4)),
                          child: Text(isContractor ? context.tr('role_contractor') : context.tr('tp_direct_request'), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: isContractor ? colors.primaryBrand : colors.secondaryAccent)),
                        ),
                        if (e.completedAt != null) ...[
                          const SizedBox(width: 8),
                          Text(e.completedAt != null ? NammerhaDateUtils.formatDateShort(e.completedAt!) : '—', style: TextStyle(fontSize: 11, color: colors.textSubtle)),
                        ],
                      ]),
                    ],
                  ),
                ),
                Text(_formatCurrency(e.amount), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: colors.secondaryAccent)),
              ],
            ),
          ).nmAnimate(context, delay: (i * 80).ms).fadeIn();
        },
      ),
    );
  }

  // ─── Tab 5: Profile ───────────────────────────────────────────────────

  Widget _buildProfile(TradespersonDashboardModel data, bool isLoading, SemanticColors colors) {
    if (isLoading && data.profile == TradespersonProfileModel.empty) {
      return NammerhaShimmerLoader(colors: colors);
    }
    final p = data.profile;
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
                CircleAvatar(radius: 36, backgroundColor: const Color(0xFFFFFFFF).withAlpha(25), child: Text(p.fullName.isNotEmpty ? p.fullName[0] : '?', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: Color(0xFFFFFFFF)))),
                const SizedBox(height: 12),
                Text(p.fullName, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Color(0xFFFFFFFF))),
                const SizedBox(height: 4),
                Text(p.trade ?? context.tr('tp_unspecified'), style: TextStyle(fontSize: 14, color: const Color(0xFFFFFFFF).withAlpha(200))),
              ],
            ),
          ).nmAnimate(context).fadeIn(duration: 500.ms),
          const SizedBox(height: 16),
          _profileRow(context.tr('tp_experience_years'), '${p.yearsExperience ?? '—'}', colors),
          _profileRow(context.tr('tp_hourly_rate'), p.hourlyRate != null ? _formatCurrency(p.hourlyRate!) : '—', colors),
          _profileRow(context.tr('tp_daily_rate'), p.dailyRate != null ? _formatCurrency(p.dailyRate!) : '—', colors),
          _profileRow(context.tr('tp_performance'), '${p.dynamicScore.toStringAsFixed(0)}/100', colors),
          _profileRow(context.tr('tp_completed_jobs'), '${p.completedJobsCount}', colors),
          _profileRow(context.tr('tp_avg_rating'), p.averageRating != null ? '${p.averageRating!.toStringAsFixed(1)} ★' : context.tr('tp_no_ratings'), colors),
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
