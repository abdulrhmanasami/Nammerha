import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/gradient_button.dart';
import '../../../core/widgets/shimmer_loader.dart';
import '../../../core/widgets/bottom_sheet_grabber.dart';
import '../models/contractor_models.dart';
import '../bloc/contractor_bloc.dart';
import '../bloc/contractor_event.dart';
import '../bloc/contractor_state.dart';
import '../data/contractor_repository.dart';
import '../../../core/i18n/t.dart';

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
        title: Text(context.tr('ct_portal_title')),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          indicatorColor: colors.primaryBrand,
          labelColor: colors.primaryBrand,
          unselectedLabelColor: colors.textSecondary,
          labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
          tabs: [
            Tab(text: context.tr('ct_tab_dashboard')),
            Tab(text: context.tr('ct_tab_marketplace')),
            Tab(text: context.tr('ct_tab_bids')),
            Tab(text: context.tr('ct_tab_payments')),
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
            return NammerhaShimmerLoader(colors: colors, itemCount: 4);
          }

          // G10 FIX: Was `state.message.contains(context.tr('str_a838e35c'))` — magic string!
          // Any ContractorError at this point means the dashboard failed to load.
          if (state is ContractorError) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.error_outline, size: 64, color: colors.error),
                  const SizedBox(height: 16),
                  Text(context.tr('ct_load_error'),
                      style: TextStyle(color: colors.textPrimary)),
                  const SizedBox(height: 8),
                  Text(state.message,
                      style: TextStyle(fontSize: 12, color: colors.textSubtle),
                      textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  ElevatedButton(
                    onPressed: () => context.read<ContractorBloc>().add(LoadContractorDashboard()),
                    child: Text(context.tr('ct_retry')),
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
          Text(context.tr('ct_assigned_projects'),
              style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: colors.textPrimary)),
          const SizedBox(height: 12),
          if (dashboard.projects.isEmpty)
            _emptyState(colors, Icons.assignment_rounded,
                context.tr('ct_no_assigned'), context.tr('ct_browse_bid'))
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
        _kpiCard(context.tr('ct_active_projects'), '${stats.activeProjects}', colors.primaryBrand, colors),
        const SizedBox(width: 8),
        _kpiCard(context.tr('ct_pending_bids'), '${stats.pendingBids}', colors.warning, colors),
        const SizedBox(width: 8),
        _kpiCard(context.tr('ct_completed'), '${stats.wonBids}', colors.success, colors),
        const SizedBox(width: 8),
        _kpiCard(context.tr('ct_earnings'), formatCurrency(stats.totalEscrowReceived), colors.secondaryAccent, colors),
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
      case 'construction':
        c = colors.warning;
        break;
      case 'completed':
      case 'delivered':
        c = colors.success;
        break;
      default:
        c = colors.textSecondary;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
          color: c.withAlpha(15), borderRadius: BorderRadius.circular(6)),
      // G8 FIX: Was raw `Text(phase)` — now i18n-translated.
      child: Text(_translatePhase(phase),
          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: c)),
    );
  }

  /// G8 FIX: Translate raw phase strings to localized labels.
  String _translatePhase(String phase) {
    switch (phase.toLowerCase()) {
      case 'planning': return context.tr('ct_phase_planning');
      case 'in_progress': return context.tr('ct_phase_in_progress');
      case 'construction': return context.tr('ct_phase_construction');
      case 'completed': return context.tr('ct_phase_completed');
      case 'delivered': return context.tr('ct_phase_delivered');
      case 'published': return context.tr('ct_phase_published');
      default: return phase;
    }
  }

  /// G8 FIX: Translate raw damage type strings to localized labels.
  String _translateDamageType(String type) {
    switch (type.toLowerCase()) {
      case 'structural': return context.tr('ct_dmg_structural');
      case 'electrical': return context.tr('ct_dmg_electrical');
      case 'plumbing': return context.tr('ct_dmg_plumbing');
      case 'roofing': return context.tr('ct_dmg_roofing');
      case 'fire': return context.tr('ct_dmg_fire');
      case 'water': return context.tr('ct_dmg_water');
      case 'foundation': return context.tr('ct_dmg_foundation');
      case 'mixed': return context.tr('ct_dmg_mixed');
      default: return type;
    }
  }

  /// G8 FIX: Translate raw bid status strings to localized labels.
  String _translateBidStatus(String status) {
    switch (status.toLowerCase()) {
      case 'pending': return context.tr('ct_bid_pending');
      case 'accepted': return context.tr('ct_bid_accepted');
      case 'rejected': return context.tr('ct_bid_rejected');
      case 'withdrawn': return context.tr('ct_bid_withdrawn');
      default: return status;
    }
  }

  // ─── Tab 2: Marketplace ───────────────────────────────────────────────

  Widget _buildMarketplace(List<ContractorProjectModel> marketplace, SemanticColors colors) {
    if (marketplace.isEmpty) {
      return _emptyState(
          colors, Icons.search_rounded, context.tr('ct_no_marketplace'), context.tr('ct_new_projects_hint'));
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
                // G8 FIX: Was raw `Text(p.damageType)` — now i18n-translated.
                Text(_translateDamageType(p.damageType),
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
                  _miniStat(context.tr('ct_boq_items'), '${p.boqCount}', colors),
                  const SizedBox(width: 16),
                  _miniStat(context.tr('ct_bid_count'), '${p.bidCount}', colors),
                ],
              ),
              GradientButton(
                label: context.tr('ct_submit_bid'),
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
      return _emptyState(colors, Icons.flag_rounded, context.tr('ct_no_bids'), '');
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
                // G8 FIX: Was raw `Text(b.status)` — now i18n-translated.
                child: Text(_translateBidStatus(b.status),
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
              _miniStat(context.tr('ct_proposed_cost'), formatCurrency(b.proposedCost), colors),
              _miniStat(context.tr('ct_estimated_days'), '${b.estimatedDays} ${context.tr('ct_day')}', colors),
              _miniStat(context.tr('date'), _formatDate(b.createdAt), colors),
            ],
          ),
        ],
      ),
    ).animate(delay: (index * 80).ms).fadeIn();
  }

  // ─── Tab 4: Payments ──────────────────────────────────────────────────

  Widget _buildPayments(List<ContractorPaymentModel> payments, SemanticColors colors) {
    if (payments.isEmpty) {
      return _emptyState(colors, Icons.wallet_rounded, context.tr('ct_no_payments'), '');
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
    final colors = context.colors;
    final bloc = context.read<ContractorBloc>();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: colors.surfaceElevated,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      // G7 FIX: Extracted to StatefulWidget — controllers are now disposed properly.
      builder: (ctx) => _BidSubmitForm(
        projectId: projectId,
        bloc: bloc,
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

// ═══════════════════════════════════════════════════════════════════════════
// G7 FIX: Bid Submit Form — Extracted StatefulWidget
// ═══════════════════════════════════════════════════════════════════════════
// Previously, 3 TextEditingControllers were created as local variables inside
// _openBidModal(). When the bottom sheet was dismissed, the controllers were
// NEVER disposed — leaking native resources with every modal open.
// This StatefulWidget ensures dispose() is called on sheet dismissal.
// ═══════════════════════════════════════════════════════════════════════════

class _BidSubmitForm extends StatefulWidget {
  final String projectId;
  final ContractorBloc bloc;

  const _BidSubmitForm({required this.projectId, required this.bloc});

  @override
  State<_BidSubmitForm> createState() => _BidSubmitFormState();
}

class _BidSubmitFormState extends State<_BidSubmitForm> {
  final _costController = TextEditingController();
  final _daysController = TextEditingController();
  final _letterController = TextEditingController();

  @override
  void dispose() {
    _costController.dispose();
    _daysController.dispose();
    _letterController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Padding(
      padding: EdgeInsets.fromLTRB(
          20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(child: BottomSheetGrabber(colors: colors)),
          const SizedBox(height: 16),
          Text(context.tr('ct_bid_title'),
              style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: colors.textPrimary)),
          const SizedBox(height: 16),
          TextField(
            controller: _costController,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
                labelText: context.tr('ct_proposed_cost_label'),
                filled: true,
                fillColor: colors.backgroundSecondary,
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12))),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _daysController,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
                labelText: context.tr('ct_days_label'),
                filled: true,
                fillColor: colors.backgroundSecondary,
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12))),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _letterController,
            maxLines: 3,
            decoration: InputDecoration(
                labelText: context.tr('ct_cover_letter'),
                filled: true,
                fillColor: colors.backgroundSecondary,
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12))),
          ),
          const SizedBox(height: 16),
          GradientButton(
            label: context.tr('ct_send_bid'),
            icon: Icons.send_rounded,
            onPressed: () {
              final cost = int.tryParse(_costController.text) ?? 0;
              final days = int.tryParse(_daysController.text) ?? 0;
              if (cost <= 0 || days <= 0) return;

              widget.bloc.add(SubmitContractorBid(
                projectId: widget.projectId,
                proposedCost: cost * 100,
                estimatedDays: days,
                coverLetter: _letterController.text.isNotEmpty
                    ? _letterController.text
                    : null,
              ));

              Navigator.pop(context);
            },
          ),
        ],
      ),
    );
  }
}
