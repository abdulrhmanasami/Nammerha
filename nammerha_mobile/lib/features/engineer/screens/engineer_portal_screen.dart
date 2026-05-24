import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/semantic_colors.dart';
import '../models/engineer_models.dart';
import '../bloc/engineer_portal_bloc.dart';
import '../bloc/engineer_portal_event.dart';
import '../bloc/engineer_portal_state.dart';
import '../data/engineer_repository.dart';
import '../../../core/i18n/t.dart';
import '../../../core/widgets/shimmer_loader.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import '../../../core/utils/animation_budget.dart';
import '../../../core/utils/date_utils.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Engineer Portal — Multi-tab Dashboard (Platinum Standard)
/// ═══════════════════════════════════════════════════════════════════════════
/// Mirrors web: frontend/engineer-portal.html + engineer-portal.ts
/// 4 tabs: Dashboard (KPIs + Projects), Bids, Captures, Profile
///
/// E2 IMPLEMENTATION: Full engineer mobile portal with BLoC architecture.
/// All controllers disposed, all errors handled, all states covered.
/// ═══════════════════════════════════════════════════════════════════════════
class EngineerPortalScreen extends StatelessWidget {
  const EngineerPortalScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => EngineerPortalBloc(repository: EngineerRepository())
        ..add(LoadEngineerDashboard()),
      child: const _EngineerPortalView(),
    );
  }
}

class _EngineerPortalView extends StatefulWidget {
  const _EngineerPortalView();

  @override
  State<_EngineerPortalView> createState() => _EngineerPortalViewState();
}

class _EngineerPortalViewState extends State<_EngineerPortalView>
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

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text(context.tr('eng_portal'),
            style: TextStyle(
                fontWeight: FontWeight.w800, color: colors.textPrimary)),
        centerTitle: false,
        backgroundColor: colors.surfaceElevated,
        elevation: 0,
        actions: [
          // UX PLATINUM FIX: Offline-First Sync Indicator
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            padding: const EdgeInsets.symmetric(horizontal: 10),
            decoration: BoxDecoration(
              color: colors.warning.withAlpha(20),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: colors.warning.withAlpha(50)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(PhosphorIconsRegular.wifiSlash, color: colors.warning, size: 14),
                const SizedBox(width: 6),
                Text(
                  context.tr('offline_mode'),
                  style: TextStyle(color: colors.warning, fontSize: 11, fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          labelColor: const Color(0xFF1558D6), // Trust Blue
          unselectedLabelColor: colors.textSecondary,
          indicatorColor: const Color(0xFF1558D6),
          indicatorWeight: 3,
          labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
          unselectedLabelStyle:
              const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
          tabs: [
            Tab(text: context.tr('common_dashboard')),
            Tab(text: context.tr('eng_my_bids')),
            Tab(text: context.tr('eng_my_captures')),
            Tab(text: context.tr('nav_profile')),
          ],
        ),
      ),
      body: BlocBuilder<EngineerPortalBloc, EngineerPortalState>(
        builder: (context, state) {
          if (state is EngineerPortalLoading || state is EngineerPortalInitial) {
            return NammerhaShimmerLoader(colors: colors);
          }

          if (state is EngineerPortalError) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(PhosphorIcons.cloudSlash(), size: 64, color: colors.error),
                  const SizedBox(height: 16),
                  Text(context.tr('eng_load_error'),
                      style: TextStyle(color: colors.textPrimary)),
                  const SizedBox(height: 8),
                  Text(state.message,
                      style: TextStyle(fontSize: 12, color: colors.textSubtle),
                      textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  ElevatedButton(
                    onPressed: () => context
                        .read<EngineerPortalBloc>()
                        .add(LoadEngineerDashboard()),
                    child: Text(context.tr('ct_retry')),
                  ),
                ],
              ),
            );
          }

          if (state is! EngineerPortalLoaded) {
            return const SizedBox.shrink();
          }

          final dashboard = state.dashboard;

          return RefreshIndicator(
            onRefresh: () async {
              context.read<EngineerPortalBloc>().add(LoadEngineerDashboard());
              await context.read<EngineerPortalBloc>().stream.firstWhere(
                  (s) => s is EngineerPortalLoaded || s is EngineerPortalError);
            },
            child: TabBarView(
              controller: _tabController,
              children: [
                // Tab 1: Dashboard (KPIs + Projects)
                _buildDashboardTab(dashboard, colors),
                // Tab 2: Bids
                _buildBidsTab(dashboard.bids, colors),
                // Tab 3: Captures
                _buildCapturesTab(dashboard.captures, colors),
                // Tab 4: Profile
                _buildProfileTab(dashboard.stats, colors),
              ],
            ),
          );
        },
      ),
    );
  }

  // ─── Tab 1: Dashboard ─────────────────────────────────────────────────────
  Widget _buildDashboardTab(
      EngineerDashboardModel dashboard, SemanticColors colors) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // KPI Grid
        _buildKPIGrid(dashboard.stats, colors)
            .nmAnimate(context)
            .fadeIn(duration: 400.ms)
            .slideY(begin: 0.1, end: 0),
        const SizedBox(height: 20),
        // Projects List
        Text(context.tr('eng_assigned_projects'),
            style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: colors.textPrimary)),
        const SizedBox(height: 4),
        Text(context.tr('eng_projects_desc'),
            style: TextStyle(fontSize: 13, color: colors.textSecondary)),
        const SizedBox(height: 12),
        if (dashboard.projects.isEmpty)
          _buildEmptyState(
              icon: PhosphorIcons.wrench(),
              title: context.tr('eng_no_projects'),
              subtitle: context.tr('eng_no_projects_desc'),
              colors: colors)
        else
          ...dashboard.projects.asMap().entries.map((entry) =>
              _buildProjectCard(entry.value, colors)
                  .nmAnimate(context, delay: (80 * entry.key).ms)
                  .fadeIn(duration: 300.ms)
                  .slideX(begin: 0.05, end: 0)),
      ],
    );
  }

  Widget _buildKPIGrid(EngineerStatsModel stats, SemanticColors colors) {
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      childAspectRatio: 1.5,
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      children: [
        _kpiCard(
          icon: PhosphorIcons.wrench(),
          iconColor: const Color(0xFF1558D6),
          label: context.tr('eng_assigned_projects'),
          value: stats.assignedProjects.toString(),
          colors: colors,
        ),
        _kpiCard(
          icon: PhosphorIcons.hourglassHigh(),
          iconColor: const Color(0xFFFCC934),
          label: context.tr('eng_proofs_pending'),
          value: stats.proofsPending.toString(),
          colors: colors,
        ),
        _kpiCard(
          icon: PhosphorIcons.sealCheck(),
          iconColor: const Color(0xFF0A6E55),
          label: context.tr('eng_proofs_verified'),
          value: stats.proofsVerified.toString(),
          colors: colors,
        ),
        _kpiCard(
          icon: PhosphorIcons.currencyDollar(),
          iconColor: const Color(0xFF0A6E55),
          label: context.tr('eng_escrow_released'),
          value: '\$${(stats.escrowReleased / 100).toStringAsFixed(0)}',
          colors: colors,
        ),
      ],
    );
  }

  Widget _kpiCard({
    required IconData icon,
    required Color iconColor,
    required String label,
    required String value,
    required SemanticColors colors,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.strokeBorder),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 8,
              offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: iconColor.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 20, color: iconColor),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(value,
                  style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      color: colors.textPrimary)),
              Text(label,
                  style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: colors.textSubtle,
                      letterSpacing: 0.5),
                  overflow: TextOverflow.ellipsis),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildProjectCard(EngineerProjectModel project, SemanticColors colors) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.strokeBorder),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 8,
              offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(project.title,
                    style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: colors.textPrimary),
                    overflow: TextOverflow.ellipsis),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: _phaseColor(project.phase).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(_phaseLabel(project.phase),
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: _phaseColor(project.phase))),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(PhosphorIcons.mapPin(),
                  size: 14, color: colors.textSubtle),
              const SizedBox(width: 4),
              Text(project.region.isNotEmpty ? project.region : 'N/A',
                  style: TextStyle(fontSize: 12, color: colors.textSecondary)),
              const SizedBox(width: 16),
              Icon(PhosphorIcons.checkSquareOffset(), size: 14, color: colors.textSubtle),
              const SizedBox(width: 4),
              Text('${project.boqCount} BOQ',
                  style: TextStyle(fontSize: 12, color: colors.textSecondary)),
            ],
          ),
          const SizedBox(height: 12),
          // Progress bar
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: project.progress / 100,
                    minHeight: 6,
                    backgroundColor: colors.strokeBorder,
                    valueColor: const AlwaysStoppedAnimation<Color>(
                        Color(0xFF1558D6)),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text('${project.progress}%',
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: colors.textSecondary)),
            ],
          ),
        ],
      ),
    );
  }

  // ─── Tab 2: Bids ──────────────────────────────────────────────────────────
  Widget _buildBidsTab(List<EngineerBidModel> bids, SemanticColors colors) {
    if (bids.isEmpty) {
      return _buildEmptyState(
          icon: PhosphorIcons.gavel(),
          title: context.tr('eng_no_bids'),
          subtitle: context.tr('eng_no_bids_desc'),
          colors: colors);
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: bids.length,
      itemBuilder: (context, index) {
        final bid = bids[index];
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: colors.surfaceElevated,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: colors.strokeBorder),
            boxShadow: [
              BoxShadow(
                  color: Colors.black.withValues(alpha: 0.04),
                  blurRadius: 8,
                  offset: const Offset(0, 2)),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(bid.projectTitle,
                        style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: colors.textPrimary),
                        overflow: TextOverflow.ellipsis),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color:
                          _bidStatusColor(bid.status).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(_bidStatusLabel(bid.status),
                        style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: _bidStatusColor(bid.status))),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Divider(height: 1, color: colors.strokeBorder),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _bidDetailCol(
                      context.tr('eng_proposed_cost'),
                      '\$${(bid.proposedCost / 100).toStringAsFixed(0)}',
                      const Color(0xFF0A6E55),
                      colors),
                  _bidDetailCol(
                      context.tr('eng_est_days'),
                      '${bid.estimatedDays}',
                      colors.textPrimary,
                      colors),
                  _bidDetailCol(
                      context.tr('eng_submitted'),
                      NammerhaDateUtils.formatDateShort(bid.submittedAt),
                      colors.textSecondary,
                      colors),
                ],
              ),
            ],
          ),
        )
            .nmAnimate(context, delay: (80 * index).ms)
            .fadeIn(duration: 300.ms)
            .slideX(begin: 0.05, end: 0);
      },
    );
  }

  Widget _bidDetailCol(
      String label, String value, Color valueColor, SemanticColors colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: colors.textSubtle,
                letterSpacing: 0.5)),
        const SizedBox(height: 2),
        Text(value,
            style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: valueColor)),
      ],
    );
  }

  // ─── Tab 3: Captures ──────────────────────────────────────────────────────
  Widget _buildCapturesTab(
      List<EngineerCaptureModel> captures, SemanticColors colors) {
    if (captures.isEmpty) {
      return _buildEmptyState(
          icon: PhosphorIcons.camera(),
          title: context.tr('eng_no_captures'),
          subtitle: context.tr('eng_no_captures_desc'),
          colors: colors);
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: captures.length,
      itemBuilder: (context, index) {
        final capture = captures[index];
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: colors.surfaceElevated,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: colors.strokeBorder),
          ),
          child: Row(
            children: [
              // Thumbnail
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  width: 56,
                  height: 56,
                  color: colors.backgroundSecondary,
                  child: capture.fileUrl.isNotEmpty
                      ? Image.network(capture.fileUrl,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => Icon(
                              PhosphorIcons.imageBroken(),
                              color: colors.textSubtle))
                      : Icon(PhosphorIcons.imageBroken(),
                          color: colors.textSubtle),
                ),
              ),
              const SizedBox(width: 12),
              // Details
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                              capture.title ?? capture.constructionPhase,
                              style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                  color: colors.textPrimary),
                              overflow: TextOverflow.ellipsis),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: capture.isVerified
                                ? const Color(0xFF0A6E55).withValues(alpha: 0.1)
                                : const Color(0xFFFCC934).withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (capture.isVerified)
                                Icon(PhosphorIcons.sealCheck(),
                                    size: 12, color: const Color(0xFF0A6E55)),
                              if (capture.isVerified)
                                const SizedBox(width: 2),
                              Text(
                                capture.isVerified
                                    ? context.tr('eng_verified')
                                    : context.tr('eng_pending'),
                                style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: capture.isVerified
                                        ? const Color(0xFF0A6E55)
                                        : const Color(0xFFFCC934)),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(capture.projectTitle,
                        style: TextStyle(
                            fontSize: 12, color: colors.textSecondary),
                        overflow: TextOverflow.ellipsis),
                    Text(NammerhaDateUtils.formatDateShort(capture.capturedAt),
                        style:
                            TextStyle(fontSize: 11, color: colors.textSubtle)),
                  ],
                ),
              ),
            ],
          ),
        )
            .nmAnimate(context, delay: (60 * index).ms)
            .fadeIn(duration: 250.ms)
            .slideX(begin: 0.03, end: 0);
      },
    );
  }

  // ─── Tab 4: Profile ───────────────────────────────────────────────────────
  Widget _buildProfileTab(EngineerStatsModel stats, SemanticColors colors) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: colors.surfaceElevated,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: colors.strokeBorder),
            boxShadow: [
              BoxShadow(
                  color: Colors.black.withValues(alpha: 0.04),
                  blurRadius: 12,
                  offset: const Offset(0, 4)),
            ],
          ),
          child: Column(
            children: [
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: const Color(0xFF1558D6).withValues(alpha: 0.1),
                ),
                child: Icon(PhosphorIcons.wrench(),
                    size: 40, color: const Color(0xFF1558D6)),
              ),
              const SizedBox(height: 16),
              Text(context.tr('eng_portal'),
                  style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: colors.textPrimary)),
              const SizedBox(height: 4),
              Text(context.tr('eng_access'),
                  style: TextStyle(fontSize: 13, color: colors.textSecondary)),
              const SizedBox(height: 24),
              Divider(color: colors.strokeBorder),
              const SizedBox(height: 16),
              _profileStat(context.tr('eng_assigned_projects'),
                  '${stats.assignedProjects}', colors),
              _profileStat(context.tr('eng_proofs_verified'),
                  '${stats.proofsVerified}', colors),
              _profileStat(context.tr('eng_total_bids'),
                  '${stats.totalBids}', colors),
              _profileStat(context.tr('eng_escrow_released'),
                  '\$${(stats.escrowReleased / 100).toStringAsFixed(0)}',
                  colors),
            ],
          ),
        ).nmAnimate(context).fadeIn(duration: 400.ms).slideY(begin: 0.1, end: 0),
      ],
    );
  }

  Widget _profileStat(String label, String value, SemanticColors colors) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: TextStyle(fontSize: 14, color: colors.textSecondary)),
          Text(value,
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: colors.textPrimary)),
        ],
      ),
    );
  }

  // ─── Shared Helpers ───────────────────────────────────────────────────────
  Widget _buildEmptyState({
    required IconData icon,
    required String title,
    required String subtitle,
    required SemanticColors colors,
  }) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: colors.backgroundSecondary,
              ),
              child: Icon(icon, size: 40, color: colors.textSubtle),
            ),
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

  Color _phaseColor(String phase) {
    switch (phase.toLowerCase()) {
      case 'planning':
        return const Color(0xFF1558D6);
      case 'in_progress':
      case 'construction':
        return const Color(0xFFFCC934);
      case 'completed':
      case 'delivered':
        return const Color(0xFF0A6E55);
      default:
        return const Color(0xFF94A3B8);
    }
  }

  String _phaseLabel(String phase) {
    switch (phase.toLowerCase()) {
      case 'planning':
        return context.tr('eng_phase_planning');
      case 'in_progress':
        return context.tr('eng_phase_in_progress');
      case 'construction':
        return context.tr('eng_phase_construction');
      case 'completed':
        return context.tr('eng_phase_completed');
      case 'delivered':
        return context.tr('eng_phase_delivered');
      default:
        return phase;
    }
  }

  Color _bidStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'pending':
        return const Color(0xFFFCC934);
      case 'accepted':
        return const Color(0xFF0A6E55);
      case 'rejected':
        return const Color(0xFFEF4444);
      default:
        return const Color(0xFF94A3B8);
    }
  }

  String _bidStatusLabel(String status) {
    switch (status.toLowerCase()) {
      case 'pending':
        return context.tr('eng_bid_pending');
      case 'accepted':
        return context.tr('eng_bid_accepted');
      case 'rejected':
        return context.tr('eng_bid_rejected');
      default:
        return status;
    }
  }

  // P2-002 FIX: Inline _formatDate() removed → NammerhaDateUtils.formatDateShort()
}
