import 'package:phosphor_flutter/phosphor_flutter.dart';
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
import '../../../core/utils/format_utils.dart';
import '../../damage_report/screens/damage_report_screen.dart';
import '../../profile/screens/profile_screen.dart';
import '../../auth/bloc/auth_bloc.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';
import '../../../core/utils/animation_budget.dart';

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
  bool _kycDismissed = false; // MED-MOB-004: Transient dismiss (resets per session)

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

  String _formatCurrency(num amount) => FormatUtils.currency(amount);

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    
    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text(context.tr('ho_portal_title')),
        actions: [
          IconButton(
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const DamageReportScreen())),
            icon: Icon(PhosphorIconsRegular.plusCircle, color: colors.primaryBrand),
            tooltip: context.tr('ho_damage_report'),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          indicatorColor: colors.primaryBrand,
          labelColor: colors.primaryBrand,
          unselectedLabelColor: colors.textSecondary,
          labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
          tabs: [
            Tab(text: context.tr('ho_tab_dashboard')),
            Tab(text: context.tr('ho_tab_projects')),
            Tab(text: context.tr('ho_tab_requests')),
            Tab(text: context.tr('ho_tab_approvals')),
            Tab(text: context.tr('ho_tab_escrow')),
          ],
        ),
      ),
      body: BlocConsumer<HomeownerBloc, HomeownerState>(
        
        // PLAT-UX-007 FIX: Prevent Screen Wipeout Blink
        buildWhen: (previous, current) {
          if (current is HomeownerInitial || current is HomeownerLoading || current is HomeownerLoaded) return true;
          if (current is HomeownerError && previous is! HomeownerLoaded) return true;
          return false;
        },
        listener: (context, state) {
          if (state is HomeownerError) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(state.error), backgroundColor: colors.error));
          } else if (state is ApprovalResponseSuccess) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.tr('ho_response_success')), backgroundColor: colors.success));
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
    if (isLoading && data.stats.activeProjects == 0 && data.projects.isEmpty) {
      return NammerhaShimmerLoader(colors: colors);
    }
    return RefreshIndicator(
      onRefresh: () async { context.read<HomeownerBloc>().add(const LoadHomeownerTabEvent(0)); },
      color: colors.primaryBrand,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // MED-MOB-004 FIX: KYC completion banner — mirrors web CRIT-UX-003.
          // Shows if user is not KYC verified and not dismissed this session.
          _buildKycBanner(colors),
          Row(children: [
            _kpiCard(context.tr('ho_kpi_active'), '${data.stats.activeProjects}', colors.primaryBrand, PhosphorIconsRegular.buildings, colors),
            const SizedBox(width: 8),
            _kpiCard(context.tr('ho_kpi_bids'), '${data.stats.totalBidsReceived}', colors.info, PhosphorIconsRegular.gavel, colors),
          ]).nmAnimate(context).fadeIn(),
          const SizedBox(height: 8),
          Row(children: [
            _kpiCard(context.tr('ho_kpi_approvals'), '${data.stats.pendingApprovals}', colors.warning, PhosphorIconsRegular.hourglass, colors),
            const SizedBox(width: 8),
            _kpiCard(context.tr('ho_kpi_invested'), _formatCurrency(data.stats.totalInvested), colors.secondaryAccent, PhosphorIconsRegular.bank, colors),
          ]).nmAnimate(context, delay: 100.ms).fadeIn(),
          const SizedBox(height: 20),

          Text(context.tr('ho_active_projects'), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.textPrimary)),
          const SizedBox(height: 12),
          ...data.projects.where((p) => !['completed', 'cancelled'].contains(p.status)).toList().asMap().entries.map(
            (e) => _activeProjectCard(e.value, colors, e.key),
          ),
          if (data.projects.where((p) => !['completed', 'cancelled'].contains(p.status)).isEmpty)
            _emptyState(colors, PhosphorIconsRegular.buildings, context.tr('ho_no_active'), context.tr('ho_report_to_start')),
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

  Widget _activeProjectCard(HomeownerProjectModel p, SemanticColors colors, int index) {
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
            Expanded(child: Text(p.title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary))),
            _statusBadge(p.status, colors),
          ]),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: colors.backgroundSecondary, borderRadius: BorderRadius.circular(8)),
            child: Row(children: [
              _infoChip(PhosphorIconsRegular.tag, p.damageType, colors),
              const SizedBox(width: 12),
              if (p.engineerName != null) _infoChip(PhosphorIconsRegular.hardHat, p.engineerName!, colors),
              const SizedBox(width: 12),
              if (p.contractorName != null) _infoChip(PhosphorIconsRegular.wrench, p.contractorName!, colors),
            ]),
          ),
          const SizedBox(height: 8),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            if (p.bidCount > 0)
              Text('${p.bidCount} ${context.tr('ho_bids_label')}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: colors.primaryBrand)),
            if (p.totalBoqCost > 0)
              Text(_formatCurrency(p.totalBoqCost), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: colors.secondaryAccent)),
          ]),
        ],
      ),
    ).nmAnimate(context, delay: (index * 80).ms).fadeIn().slideY(begin: 0.04, end: 0);
  }

  // ─── Tab 2: All Projects ──────────────────────────────────────────────

  Widget _buildProjects(HomeownerDashboardModel data, bool isLoading, SemanticColors colors) {
    if (isLoading && data.projects.isEmpty) return NammerhaShimmerLoader(colors: colors);
    if (data.projects.isEmpty) return _emptyState(colors, PhosphorIconsRegular.buildings, context.tr('ho_no_projects'), '');
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
    if (isLoading && data.serviceRequests.isEmpty) return NammerhaShimmerLoader(colors: colors);
    return RefreshIndicator(
      onRefresh: () async { context.read<HomeownerBloc>().add(const LoadHomeownerTabEvent(2)); },
      color: colors.primaryBrand,
      child: data.serviceRequests.isEmpty
          ? ListView(children: [_emptyState(colors, PhosphorIconsRegular.clipboardText, context.tr('ho_no_requests'), context.tr('ho_create_request_hint'))])
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
                        Expanded(child: Text(r.title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary))),
                        _statusBadge(r.status, colors),
                      ]),
                      const SizedBox(height: 8),
                      Wrap(spacing: 8, children: [
                        _tradeBadge(r.tradeNeeded, colors),
                        _urgencyBadge(r.urgency, colors),
                      ]),
                      if (r.description != null) ...[
                        const SizedBox(height: 6),
                        Text(r.description!, style: TextStyle(fontSize: 12, color: colors.textSecondary), maxLines: 2, overflow: TextOverflow.ellipsis),
                      ],
                      // C4 FIX: Cancel button for open/matched service requests
                      if (['open', 'matched'].contains(r.status.toLowerCase())) ...[
                        const SizedBox(height: 10),
                        SizedBox(
                          width: double.infinity,
                          child: GestureDetector(
                            onTap: () => _showConfirmDialog(
                              context,
                              title: context.tr('ho_cancel_request_title'),
                              message: context.tr('ho_cancel_request_msg'),
                              confirmLabel: context.tr('ho_cancel_request'),
                              confirmColor: colors.error,
                              onConfirm: () {
                                context.read<HomeownerBloc>().add(CancelServiceRequestEvent(r.requestId));
                              },
                            ),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 8),
                              decoration: BoxDecoration(
                                color: colors.error.withAlpha(10),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: colors.error.withAlpha(30)),
                              ),
                              child: Center(
                                child: Text(
                                  context.tr('ho_cancel_request'),
                                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: colors.error),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ).nmAnimate(context, delay: (i * 80).ms).fadeIn();
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
      case 'urgent': c = colors.warning; break;
      case 'routine': c = colors.info; break;
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
    if (isLoading && data.approvals.isEmpty) return NammerhaShimmerLoader(colors: colors);
    if (data.approvals.isEmpty) return _emptyState(colors, PhosphorIconsRegular.checkCircle, context.tr('ho_no_approvals'), '');
    return RefreshIndicator(
      onRefresh: () async { context.read<HomeownerBloc>().add(const LoadHomeownerTabEvent(3)); },
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: data.approvals.length,
        itemBuilder: (_, i) {
          final a = data.approvals[i];
          final isPending = a.status.toLowerCase() == 'pending';
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
                  Expanded(child: Text(a.title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary))),
                  _statusBadge(a.status, colors),
                ]),
                const SizedBox(height: 6),
                if (a.description != null)
                  Text(a.description!, style: TextStyle(fontSize: 12, color: colors.textSecondary)),
                const SizedBox(height: 6),
                Wrap(spacing: 10, children: [
                  _infoChip(PhosphorIconsRegular.buildings, a.projectTitle, colors),
                  _infoChip(PhosphorIconsRegular.hardHat, a.engineerName, colors),
                ]),
                if (isPending) ...[
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(
                      // C3 FIX: Confirmation dialog for destructive rejection
                      child: _actionButton(context.tr('ho_reject'), colors.error, () {
                        _showConfirmDialog(
                          context,
                          title: context.tr('ho_reject_title'),
                          message: context.tr('ho_reject_msg'),
                          confirmLabel: context.tr('ho_reject'),
                          confirmColor: colors.error,
                          onConfirm: () {
                            context.read<HomeownerBloc>().add(RespondToApprovalEvent(a.approvalId, 'rejected'));
                          },
                        );
                      }),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      // H3 FIX: Semantic key replaces hash key 'approval'
                      child: _actionButton(context.tr('ho_approve'), colors.success, () {
                        context.read<HomeownerBloc>().add(RespondToApprovalEvent(a.approvalId, 'approved'));
                      }),
                    ),
                  ]),
                ],
              ],
            ),
          ).nmAnimate(context, delay: (i * 80).ms).fadeIn();
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
    if (isLoading && data.escrow.totalDeposited == 0 && data.escrow.heldInEscrow == 0) return NammerhaShimmerLoader(colors: colors);
    return RefreshIndicator(
      onRefresh: () async { context.read<HomeownerBloc>().add(const LoadHomeownerTabEvent(4)); },
      color: colors.primaryBrand,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(children: [
            _escrowCard(context.tr('ho_total_deposited'), _formatCurrency(data.escrow.totalDeposited), colors.primaryBrand, colors),
            const SizedBox(width: 10),
            _escrowCard(context.tr('ho_released'), _formatCurrency(data.escrow.totalReleased), colors.success, colors),
          ]).nmAnimate(context).fadeIn(),
          const SizedBox(height: 10),
          Row(children: [
            _escrowCard(context.tr('ho_held_escrow'), _formatCurrency(data.escrow.heldInEscrow), colors.warning, colors),
            const SizedBox(width: 10),
            _escrowCard(context.tr('ho_escrow_projects'), '${data.escrow.projectsWithEscrow}', colors.textPrimary, colors),
          ]).nmAnimate(context, delay: 100.ms).fadeIn(),

          if (data.escrow.heldInEscrow > 0) ...[
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
                  Icon(PhosphorIconsRegular.shieldCheck, size: 22, color: colors.primaryBrand),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      context.tr('ho_escrow_guarantee'),
                      style: TextStyle(fontSize: 12, color: colors.primaryBrand, fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ).nmAnimate(context, delay: 200.ms).fadeIn(),
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

  // ─── MED-MOB-004 FIX: KYC Completion Banner ────────────────────────────
  /// Mirrors web CRIT-UX-003. Checks AuthState for isKycVerified.
  /// Dismissable per session (_kycDismissed), non-blocking.
  Widget _buildKycBanner(SemanticColors colors) {
    if (_kycDismissed) return const SizedBox.shrink();

    // Read auth state — the AuthBloc is provided at app root
    final authState = context.watch<AuthBloc>().state;
    if (authState is! AuthAuthenticated) return const SizedBox.shrink();
    if (authState.user.isKycVerified) return const SizedBox.shrink();

    return Semantics(
      label: context.tr('kyc_banner_a11y'),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          // Warning Yellow accent background (brand: #FCC934)
          color: colors.warning.withAlpha(12),
          borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
          border: Border.all(color: colors.warning.withAlpha(40)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: colors.warning.withAlpha(20),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(PhosphorIconsRegular.identificationCard, size: 18, color: colors.warning),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    context.tr('kyc_banner_title'),
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: colors.textPrimary),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    context.tr('kyc_banner_subtitle'),
                    style: TextStyle(fontSize: 11, color: colors.textSecondary, height: 1.4),
                  ),
                  const SizedBox(height: 8),
                  GestureDetector(
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen())),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: colors.warning.withAlpha(20),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        context.tr('kyc_banner_cta'),
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: colors.warning),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            GestureDetector(
              onTap: () => setState(() => _kycDismissed = true),
              child: Padding(
                padding: const EdgeInsets.all(4),
                child: Icon(PhosphorIconsRegular.x, size: 16, color: colors.textSubtle),
              ),
            ),
          ],
        ),
      ),
    ).nmAnimate(context).fadeIn(duration: 400.ms);
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

  // ─── C3 FIX: Confirmation Dialog (Nielsen #5 — Error Prevention) ───────
  void _showConfirmDialog(
    BuildContext context, {
    required String title,
    required String message,
    required String confirmLabel,
    required Color confirmColor,
    required VoidCallback onConfirm,
  }) {
    final colors = context.colors;
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surfaceElevated,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(NammerhaTheme.radiusLg)),
        title: Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
        content: Text(message, style: TextStyle(fontSize: 14, color: colors.textSecondary)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(context.tr('cancel'), style: TextStyle(color: colors.textSecondary)),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              onConfirm();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: confirmColor,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );
  }
}
