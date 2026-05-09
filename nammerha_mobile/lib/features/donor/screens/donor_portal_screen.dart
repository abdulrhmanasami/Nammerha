import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../bloc/donor_bloc.dart';
import '../bloc/donor_event.dart';
import '../bloc/donor_state.dart';
import '../models/donor_models.dart';
import '../../../core/i18n/t.dart';
import '../../project/screens/project_details_screen.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Donor Portal — Full 5-Tab Dashboard
/// ═══════════════════════════════════════════════════════════════════════════
/// Mirrors web: frontend/src/pages/donor-portal.ts
/// 5 tabs: Dashboard, Marketplace, Donations, Impact, Proofs
/// Absolute Zero Monolithic API coupling — Uses DonorBloc Native State.
/// ═══════════════════════════════════════════════════════════════════════════
class DonorPortalScreen extends StatefulWidget {
  const DonorPortalScreen({super.key});

  @override
  State<DonorPortalScreen> createState() => _DonorPortalScreenState();
}

class _DonorPortalScreenState extends State<DonorPortalScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 5, vsync: this);
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) {
        context.read<DonorBloc>().add(DonorLoadTabRequested(tabIndex: _tabController.index));
      }
    });
    // Dispatch initial load for tab 0
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DonorBloc>().add(const DonorLoadTabRequested(tabIndex: 0));
    });
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
        title: Text(context.tr('dn_portal_title')),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          indicatorColor: colors.primaryBrand,
          labelColor: colors.primaryBrand,
          unselectedLabelColor: colors.textSecondary,
          labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
          tabs: [
            Tab(text: context.tr('dn_tab_dashboard')),
            Tab(text: context.tr('dn_tab_marketplace')),
            Tab(text: context.tr('dn_tab_donations')),
            Tab(text: context.tr('dn_tab_impact')),
            Tab(text: context.tr('dn_tab_proofs')),
          ],
        ),
      ),
      body: BlocConsumer<DonorBloc, DonorState>(
        listener: (context, state) {
          if (state is DonorError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.message), backgroundColor: colors.error),
            );
          }
        },
        builder: (context, state) {
          bool isLoading = state is DonorLoading || state is DonorInitial;
          DonorDashboardModel data = const DonorDashboardModel();

          if (state is DonorLoaded) {
            data = state.data;
          } else if (state is DonorLoading && state.currentData != null) {
            data = state.currentData!;
          } else if (state is DonorError && state.currentData != null) {
            data = state.currentData!;
          }

          return TabBarView(
            controller: _tabController,
            children: [
              _buildDashboard(colors, data, isLoading),
              _buildMarketplace(colors, data, isLoading),
              _buildDonations(colors, data, isLoading),
              _buildImpact(colors, data, isLoading),
              _buildProofs(colors, data, isLoading),
            ],
          );
        },
      ),
    );
  }

  // ─── Tab 1: Dashboard ─────────────────────────────────────────────────

  Widget _buildDashboard(SemanticColors colors, DonorDashboardModel data, bool isLoading) {
    if (isLoading && data.stats == const DonorStatsModel()) {
      return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    }
    return RefreshIndicator(
      onRefresh: () async {
        context.read<DonorBloc>().add(const DonorLoadTabRequested(tabIndex: 0, forceRefresh: true));
      },
      color: colors.primaryBrand,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Hero balance card
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: NammerhaGradients.brandPrimary,
              borderRadius: BorderRadius.circular(NammerhaTheme.radiusXl),
              boxShadow: const [NammerhaShadows.cta],
            ),
            child: Column(
              children: [
                Text(context.tr('dn_total_donated'), style: TextStyle(fontSize: 13, color: Colors.white.withAlpha(180))),
                const SizedBox(height: 6),
                Text(formatCurrency(data.stats.totalDonated), style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: Colors.white)),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _heroStat(context.tr('dn_projects_count'), '${data.stats.projectsSupported}'),
                    Container(width: 1, height: 30, color: Colors.white.withAlpha(30)),
                    _heroStat(context.tr('dn_items_funded'), '${data.stats.itemsFunded}'),
                    Container(width: 1, height: 30, color: Colors.white.withAlpha(30)),
                    _heroStat(context.tr('dn_impact_score'), '${data.stats.impactScore}%'),
                  ],
                ),
              ],
            ),
          ).animate().fadeIn(duration: 500.ms).slideY(begin: -0.1, end: 0),

          const SizedBox(height: 16),

          // Escrow stats
          Row(
            children: [
              _statCard(context.tr('dn_escrow_locked'), formatCurrency(data.stats.escrowLocked), colors.warning, colors),
              const SizedBox(width: 10),
              _statCard(context.tr('dn_escrow_released'), formatCurrency(data.stats.escrowReleased), colors.success, colors),
            ],
          ).animate(delay: 200.ms).fadeIn(),

          const SizedBox(height: 24),

          // Funded projects preview
          Text(context.tr('dn_funded_projects'), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.textPrimary)),
          const SizedBox(height: 12),
          if (data.fundedProjects.isEmpty)
            _emptyState(colors, Icons.volunteer_activism_rounded, context.tr('dn_no_funded'), context.tr('dn_browse_start'))
          else
            ...data.fundedProjects.take(3).toList().asMap().entries.map((e) => _fundedProjectCard(e.value, colors, e.key)),
        ],
      ),
    );
  }

  Widget _heroStat(String label, String value) {
    return Column(
      children: [
        Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white)),
        const SizedBox(height: 2),
        Text(label, style: TextStyle(fontSize: 11, color: Colors.white.withAlpha(160))),
      ],
    );
  }

  Widget _statCard(String label, String value, Color accent, SemanticColors colors) {
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
            Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: accent), maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 4),
            Text(label, style: TextStyle(fontSize: 12, color: colors.textSecondary)),
          ],
        ),
      ),
    );
  }

  Widget _fundedProjectCard(DonorFundedProjectModel p, SemanticColors colors, int index) {
    final fundedPct = p.fundedPercentage;
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
              Expanded(child: Text(p.title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary))),
              _statusBadge(p.status, colors),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Text('${context.tr('dn_my_contribution')}: ', style: TextStyle(fontSize: 12, color: colors.textSecondary)),
              Text(formatCurrency(p.myTotalDonated), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: colors.success)),
              const SizedBox(width: 12),
              Text('${p.itemsIFunded} ${context.tr('dn_items_label')}', style: TextStyle(fontSize: 12, color: colors.textSecondary)),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: (fundedPct / 100).clamp(0.0, 1.0),
                    backgroundColor: colors.backgroundSecondary,
                    valueColor: AlwaysStoppedAnimation(fundedPct >= 100 ? colors.success : colors.secondaryAccent),
                    minHeight: 8,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text('${fundedPct.toInt()}%', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: fundedPct >= 100 ? colors.success : colors.secondaryAccent)),
            ],
          ),
        ],
      ),
    ).animate(delay: (index * 80).ms).fadeIn().slideY(begin: 0.05, end: 0);
  }

  // ─── Tab 2: Marketplace ───────────────────────────────────────────────

  Widget _buildMarketplace(SemanticColors colors, DonorDashboardModel data, bool isLoading) {
    if (isLoading && data.marketplace.isEmpty) {
      return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    }
    if (data.marketplace.isEmpty) {
      return _emptyState(colors, Icons.store_rounded, context.tr('dn_no_marketplace'), '');
    }
    return RefreshIndicator(
      onRefresh: () async {
        context.read<DonorBloc>().add(const DonorLoadTabRequested(tabIndex: 1, forceRefresh: true));
      },
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: data.marketplace.length,
        itemBuilder: (_, i) {
          final p = data.marketplace[i];
          final pct = p.fundedPercentage;
          final isFullyFunded = pct >= 100;
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
                Text(p.title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary)),
                const SizedBox(height: 6),
                Wrap(spacing: 10, children: [
                  _infoChip(Icons.label_rounded, p.damageType, colors),
                  if (p.region != null) _infoChip(Icons.location_on_rounded, p.region!, colors),
                  _infoChip(Icons.inventory_2_rounded, '${p.itemsCount} ${context.tr('dn_items_label')}', colors),
                ]),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: (pct / 100).clamp(0.0, 1.0),
                          backgroundColor: colors.backgroundSecondary,
                          valueColor: AlwaysStoppedAnimation(isFullyFunded ? colors.success : colors.secondaryAccent),
                          minHeight: 8,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text('${pct.toInt()}%', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: isFullyFunded ? colors.success : colors.secondaryAccent)),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('${formatCurrency(p.totalFunded)} / ${formatCurrency(p.totalCost)}', style: TextStyle(fontSize: 12, color: colors.textSecondary)),
                    if (!isFullyFunded)
                      GestureDetector(
                        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ProjectDetailsScreen(projectId: p.projectId))),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                          decoration: BoxDecoration(
                            gradient: NammerhaGradients.ctaPrimary,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(context.tr('dn_fund_this'), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
                        ),
                      )
                    else
                      Row(children: [
                        Icon(Icons.check_circle_rounded, size: 16, color: colors.success),
                        const SizedBox(width: 4),
                        Text(context.tr('dn_fully_funded'), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: colors.success)),
                      ]),
                  ],
                ),
              ],
            ),
          ).animate(delay: (i * 80).ms).fadeIn();
        },
      ),
    );
  }

  // ─── Tab 3: Donations ─────────────────────────────────────────────────

  Widget _buildDonations(SemanticColors colors, DonorDashboardModel data, bool isLoading) {
    if (isLoading && data.donations.isEmpty) {
      return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    }
    if (data.donations.isEmpty) {
      return _emptyState(colors, Icons.volunteer_activism_rounded, context.tr('dn_no_donations'), '');
    }
    return RefreshIndicator(
      onRefresh: () async {
        context.read<DonorBloc>().add(const DonorLoadTabRequested(tabIndex: 2, forceRefresh: true));
      },
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: data.donations.length,
        itemBuilder: (_, i) {
          final d = data.donations[i];
          return Container(
            margin: const EdgeInsets.only(bottom: 10),
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
                    Expanded(child: Text(d.materialName, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary))),
                    _escrowBadge(d.status, colors),
                  ],
                ),
                const SizedBox(height: 6),
                _infoChip(Icons.business_rounded, d.projectTitle, colors),
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(formatCurrency(d.amountLocked), style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: colors.secondaryAccent)),
                    Text(_formatDate(d.lockedAt), style: TextStyle(fontSize: 12, color: colors.textSubtle)),
                  ],
                ),
              ],
            ),
          ).animate(delay: (i * 80).ms).fadeIn();
        },
      ),
    );
  }

  Widget _escrowBadge(String status, SemanticColors colors) {
    Color c;
    switch (status.toLowerCase()) {
      case 'locked': c = colors.warning; break;
      case 'released': c = colors.success; break;
      case 'refunded': c = colors.info; break;
      default: c = colors.textSecondary;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: c.withAlpha(15), borderRadius: BorderRadius.circular(6)),
      child: Text(status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: c)),
    );
  }

  // ─── Tab 4: Impact ────────────────────────────────────────────────────

  Widget _buildImpact(SemanticColors colors, DonorDashboardModel data, bool isLoading) {
    if (isLoading && data.impact.isEmpty) {
      return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    }
    if (data.impact.isEmpty) {
      return _emptyState(colors, Icons.insights_rounded, context.tr('dn_no_impact'), '');
    }
    return RefreshIndicator(
      onRefresh: () async {
        context.read<DonorBloc>().add(const DonorLoadTabRequested(tabIndex: 3, forceRefresh: true));
      },
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: data.impact.length,
        itemBuilder: (_, i) {
          final p = data.impact[i];
          final isCompleted = p.status.toLowerCase() == 'completed';
          final pct = p.fundedPercentage;
          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: colors.surfaceElevated,
              borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
              border: Border.all(color: colors.strokeSubtle),
            ),
            child: Row(
              children: [
                Container(
                  width: 48, height: 48,
                  decoration: BoxDecoration(
                    color: (isCompleted ? colors.success : colors.secondaryAccent).withAlpha(15),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(
                    isCompleted ? Icons.check_circle_rounded : Icons.business_rounded,
                    color: isCompleted ? colors.success : colors.secondaryAccent,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(child: Text(p.title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.textPrimary))),
                          _statusBadge(p.status, colors),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Wrap(spacing: 10, children: [
                        Text('${context.tr('dn_my_donation')}: ${formatCurrency(p.myTotalDonated)}', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: colors.success)),
                        Text('${p.itemsIFunded} ${context.tr('dn_item_label')}', style: TextStyle(fontSize: 11, color: colors.textSubtle)),
                        Text('${pct.toInt()}%', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: pct >= 100 ? colors.success : colors.secondaryAccent)),
                      ]),
                    ],
                  ),
                ),
              ],
            ),
          ).animate(delay: (i * 80).ms).fadeIn();
        },
      ),
    );
  }

  // ─── Tab 5: Proofs ────────────────────────────────────────────────────

  Widget _buildProofs(SemanticColors colors, DonorDashboardModel data, bool isLoading) {
    if (isLoading && data.proofs.isEmpty) {
      return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    }
    if (data.proofs.isEmpty) {
      return _emptyState(colors, Icons.camera_alt_rounded, context.tr('dn_no_proofs'), context.tr('dn_proofs_hint'));
    }
    return RefreshIndicator(
      onRefresh: () async {
        context.read<DonorBloc>().add(const DonorLoadTabRequested(tabIndex: 4, forceRefresh: true));
      },
      color: colors.primaryBrand,
      child: GridView.builder(
        padding: const EdgeInsets.all(16),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          childAspectRatio: 0.75,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
        ),
        itemCount: data.proofs.length,
        itemBuilder: (_, i) {
          final proof = data.proofs[i];
          final hasPhoto = proof.photoUrl != null && proof.photoUrl!.isNotEmpty;
          final hasGps = proof.gpsLat != null;
          return Container(
            decoration: BoxDecoration(
              color: colors.surfaceElevated,
              borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
              border: Border.all(color: colors.strokeSubtle),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Photo area
                Expanded(
                  child: Stack(
                    children: [
                      Container(
                        width: double.infinity,
                        color: colors.backgroundSecondary,
                        child: hasPhoto
                            ? Image.network(proof.photoUrl!, fit: BoxFit.cover, errorBuilder: (_, _, _) => Center(child: Icon(Icons.broken_image_rounded, color: colors.textSubtle)))
                            : Center(child: Icon(Icons.image_rounded, size: 32, color: colors.textSubtle)),
                      ),
                      if (hasGps)
                        PositionedDirectional(
                          bottom: 4,
                          end: 4,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: Colors.black.withAlpha(150),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.gps_fixed_rounded, size: 10, color: Colors.white),
                                const SizedBox(width: 3),
                                Text(
                                  '${proof.gpsLat!.toStringAsFixed(3)}, ${proof.gpsLng?.toStringAsFixed(3) ?? ''}',
                                  style: const TextStyle(fontSize: 8, fontFamily: 'monospace', color: Colors.white),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                // Info
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(proof.projectTitle, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: colors.textPrimary), maxLines: 1, overflow: TextOverflow.ellipsis),
                      Text(proof.materialName ?? '', style: TextStyle(fontSize: 10, color: colors.textSubtle), maxLines: 1, overflow: TextOverflow.ellipsis),
                      if (proof.verifiedBy != null)
                        Row(children: [
                          Icon(Icons.verified_rounded, size: 12, color: colors.success),
                          const SizedBox(width: 3),
                          Expanded(child: Text(proof.verifiedBy!, style: TextStyle(fontSize: 10, color: colors.success), maxLines: 1, overflow: TextOverflow.ellipsis)),
                        ]),
                    ],
                  ),
                ),
              ],
            ),
          ).animate(delay: (i * 100).ms).fadeIn().scale(begin: const Offset(0.95, 0.95), end: const Offset(1, 1));
        },
      ),
    );
  }

  // ─── Shared Helpers ───────────────────────────────────────────────────

  Widget _statusBadge(String status, SemanticColors colors) {
    Color c;
    switch (status.toLowerCase()) {
      case 'completed': c = colors.success; break;
      case 'in_progress': c = colors.warning; break;
      case 'pending_assessment': c = colors.info; break;
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
        Text(text, style: TextStyle(fontSize: 11, color: colors.textSecondary)),
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

  String _formatDate(String dateStr) {
    try { final dt = DateTime.parse(dateStr); return '${dt.year}/${dt.month.toString().padLeft(2, '0')}/${dt.day.toString().padLeft(2, '0')}'; } catch (_) { return dateStr; }
  }
}
