import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../models/supplier_models.dart';
import '../bloc/supplier_bloc.dart';
import '../bloc/supplier_event.dart';
import '../bloc/supplier_state.dart';
import '../data/supplier_repository.dart';
import 'supplier_subscription_screen.dart';
import '../../../core/i18n/t.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Supplier Portal — 3-Tab Dashboard (Orders + Catalog + Analytics)
/// ═══════════════════════════════════════════════════════════════════════════
/// Platinum Standard Migration: BLoC Architected & Strongly Typed Models
/// ═══════════════════════════════════════════════════════════════════════════
class SupplierPortalScreen extends StatelessWidget {
  const SupplierPortalScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => SupplierBloc(repository: SupplierRepository())..add(LoadDashboardEvent()),
      child: const _SupplierPortalView(),
    );
  }
}

class _SupplierPortalView extends StatefulWidget {
  const _SupplierPortalView();

  @override
  State<_SupplierPortalView> createState() => _SupplierPortalViewState();
}

class _SupplierPortalViewState extends State<_SupplierPortalView>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  String _orderFilter = 'all';
  String _catalogSearch = '';
  final _searchController = TextEditingController();
  bool _isProcessingOrder = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(() {
      // Guard: only fire when tab actually settles (not during swipe animation frames)
      if (!_tabController.indexIsChanging && _tabController.index == 2) {
        context.read<SupplierBloc>().add(LoadAnalyticsEvent());
      }
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _showAddCatalogModal(BuildContext blocContext) {
    showModalBottomSheet(
      context: blocContext,
      isScrollControlled: true,
      backgroundColor: blocContext.colors.surfaceElevated,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => _AddCatalogForm(blocContext: blocContext),
    );
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
        title: Text(context.tr('sp_portal_title')),
        actions: [
          AnimatedBuilder(
            animation: _tabController,
            builder: (context, child) {
              final actions = <Widget>[
                IconButton(
                  onPressed: () {
                    Navigator.push(context, MaterialPageRoute(builder: (_) => const SupplierSubscriptionScreen()));
                  },
                  icon: Icon(Icons.workspace_premium_rounded, color: colors.goldFunding),
                  tooltip: context.tr('sp_taas_subscriptions'),
                ),
              ];
              if (_tabController.index == 1) {
                actions.add(
                  IconButton(
                    onPressed: () => _showAddCatalogModal(context),
                    icon: Icon(Icons.add_circle_rounded, color: colors.primaryBrand),
                  ),
                );
              }
              return Row(mainAxisSize: MainAxisSize.min, children: actions);
            },
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: colors.primaryBrand,
          labelColor: colors.primaryBrand,
          unselectedLabelColor: colors.textSecondary,
          labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
          tabs: [
            Tab(
              child: BlocBuilder<SupplierBloc, SupplierState>(
                buildWhen: (p, c) => c is SupplierLoaded,
                builder: (context, state) {
                  final pending = state is SupplierLoaded ? state.dashboard.pendingOrders : 0;
                  return Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(context.tr('sp_tab_orders')),
                      if (pending > 0) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(color: colors.error, borderRadius: BorderRadius.circular(10)),
                          child: Text('$pending', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white)),
                        ),
                      ],
                    ],
                  );
                },
              ),
            ),
            Tab(text: context.tr('sp_tab_catalog')),
            Tab(text: context.tr('sp_tab_analytics')),
          ],
        ),
      ),
      body: BlocConsumer<SupplierBloc, SupplierState>(
        listener: (context, state) {
          if (state is SupplierActionSuccess) {
            setState(() => _isProcessingOrder = false);
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(context.tr(state.message)), backgroundColor: colors.success),
            );
          } else if (state is SupplierError) {
            setState(() => _isProcessingOrder = false);
            // Format: "i18n_key|technical_detail" — show translated key, log detail
            final parts = state.message.split('|');
            final userMsg = context.tr(parts[0]);
            if (parts.length > 1) debugPrint('[SupplierError] ${parts[1]}');
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(userMsg), backgroundColor: colors.error),
            );
          }
        },
        buildWhen: (previous, current) => current is! SupplierActionSuccess,
        builder: (context, state) {
          if (state is SupplierLoading || state is SupplierInitial) {
            return Center(
              child: CircularProgressIndicator(color: colors.primaryBrand),
            );
          }

          if (state is SupplierError) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.error_outline, size: 64, color: colors.error),
                  const SizedBox(height: 16),
                  Text(context.tr('sp_load_error'), style: TextStyle(color: colors.textPrimary)),
                  const SizedBox(height: 8),
                  ElevatedButton.icon(
                    onPressed: () => context.read<SupplierBloc>().add(LoadDashboardEvent()),
                    icon: const Icon(Icons.refresh_rounded, size: 18),
                    label: Text(context.tr('sp_retry')),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: colors.primaryBrand,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ],
              ),
            );
          }

          if (state is SupplierLoaded) {
            final dashboard = state.dashboard;

            return Column(
              children: [
                // KPI Bar
                _buildKPIBar(dashboard, colors),
                // Tab content
                Expanded(
                  child: TabBarView(
                    controller: _tabController,
                    children: [
                      _buildOrders(dashboard.orders, colors),
                      _buildCatalog(dashboard.catalog, colors),
                      _buildAnalytics(colors),
                    ],
                  ),
                ),
              ],
            );
          }

          return const SizedBox.shrink();
        },
      ),
    );
  }

  // ─── KPI Bar ──────────────────────────────────────────────────────────

  Widget _buildKPIBar(SupplierDashboardModel dashboard, SemanticColors colors) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        border: Border(bottom: BorderSide(color: colors.strokeSubtle)),
      ),
      child: Row(
        children: [
          _kpiChip(context.tr('sp_pending_orders'), '${dashboard.pendingOrders}', colors.warning, colors),
          _kpiChip(context.tr('sp_won_contracts'), '${dashboard.wonContracts}', colors.primaryBrand, colors),
          _kpiChip(context.tr('sp_in_transit'), '${dashboard.inTransit}', colors.info, colors),
          _kpiChip(context.tr('sp_revenue'), formatCurrency(dashboard.totalRevenue), colors.success, colors),
        ],
      ),
    ).animate().fadeIn();
  }

  Widget _kpiChip(String label, String value, Color accent, SemanticColors colors) {
    return Expanded(
      child: Column(
        children: [
          Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: accent), maxLines: 1, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 2),
          Text(label, style: TextStyle(fontSize: 10, color: colors.textSubtle)),
        ],
      ),
    );
  }

  // ─── Tab 1: Purchase Orders ───────────────────────────────────────────

  Widget _buildOrders(List<SupplierOrderModel> orders, SemanticColors colors) {
    // H3 FIX: Apply local status filter
    final filtered = _orderFilter == 'all'
        ? orders
        : orders.where((o) => _matchesFilter(o.status, _orderFilter)).toList();

    return Column(
      children: [
        // ── Filter Chips ──
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _filterChip('all', context.tr('sp_filter_all'), colors),
                const SizedBox(width: 8),
                _filterChip('pending', context.tr('sp_filter_pending'), colors),
                const SizedBox(width: 8),
                _filterChip('shipped', context.tr('sp_filter_shipped'), colors),
                const SizedBox(width: 8),
                _filterChip('delivered', context.tr('sp_filter_delivered'), colors),
              ],
            ),
          ),
        ),
        // ── List ──
        Expanded(
          child: filtered.isEmpty
              ? _emptyState(colors, Icons.inventory_2_rounded, context.tr('sp_no_orders'), context.tr('sp_orders_hint'))
              : RefreshIndicator(
                  onRefresh: () async {
                    context.read<SupplierBloc>().add(LoadDashboardEvent());
                  },
                  color: colors.primaryBrand,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: filtered.length,
                    itemBuilder: (_, i) {
                      final o = filtered[i];
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
                // Header: PO number + status
                Row(children: [
                  Text(o.poNumber, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, fontFamily: 'monospace', color: colors.textSubtle)),
                  const Spacer(),
                  _statusBadge(o.status, colors),
                ]),
                const SizedBox(height: 8),

                // Material name
                Text(o.materialName, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: colors.textPrimary)),
                const SizedBox(height: 4),

                // Project
                Row(children: [
                  Icon(Icons.business_rounded, size: 14, color: colors.textSubtle),
                  const SizedBox(width: 4),
                  Expanded(child: Text(o.projectTitle, style: TextStyle(fontSize: 12, color: colors.textSecondary), maxLines: 1, overflow: TextOverflow.ellipsis)),
                ]),
                const SizedBox(height: 10),

                // Quantity + Amount
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: colors.backgroundSecondary, borderRadius: BorderRadius.circular(8)),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(context.tr('sp_quantity'), style: TextStyle(fontSize: 9, fontWeight: FontWeight.w600, color: colors.textSubtle)),
                        Text('${o.quantity} ${o.unit}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary)),
                      ]),
                      Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text(context.tr('amount'), style: TextStyle(fontSize: 9, fontWeight: FontWeight.w600, color: colors.textSubtle)),
                        Text(formatCurrency(o.amount), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: colors.secondaryAccent)),
                      ]),
                    ],
                  ),
                ),

                // Action buttons based on status
                if (_canAct(o.status)) ...[
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _isProcessingOrder
                          ? null
                          : () {
                              setState(() => _isProcessingOrder = true);
                              context.read<SupplierBloc>().add(UpdateOrderStatusEvent(poId: o.id, newStatus: _nextStatus(o.status)));
                            },
                      icon: Icon(_actionIcon(o.status), size: 16),
                      label: Text(_actionLabel(o.status)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _actionColor(o.status, colors),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ).animate(delay: ((i * 70).clamp(0, 500)).ms).fadeIn().slideY(begin: 0.04, end: 0);
                    },
                  ),
                ),
        ),
      ],
    );
  }

  bool _matchesFilter(String status, String filter) {
    switch (filter) {
      case 'pending': return ['generated', 'sent_to_supplier', 'acknowledged'].contains(status);
      case 'shipped': return status == 'shipped';
      case 'delivered': return status == 'delivered';
      default: return true;
    }
  }

  Widget _filterChip(String value, String label, SemanticColors colors) {
    final isSelected = _orderFilter == value;
    return GestureDetector(
      onTap: () => setState(() => _orderFilter = value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? colors.primaryBrand : colors.backgroundSecondary,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: isSelected ? colors.primaryBrand : colors.strokeSubtle),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: isSelected ? Colors.white : colors.textSecondary,
          ),
        ),
      ),
    );
  }

  bool _canAct(String status) => ['generated', 'sent_to_supplier', 'acknowledged', 'shipped'].contains(status);

  String _nextStatus(String status) {
    switch (status) {
      case 'generated': case 'sent_to_supplier': return 'acknowledged';
      case 'acknowledged': return 'shipped';
      case 'shipped': return 'delivered';
      default: return status;
    }
  }

  String _actionLabel(String status) {
    switch (status) {
      case 'generated': case 'sent_to_supplier': return context.tr('sp_confirm_receipt');
      case 'acknowledged': return context.tr('sp_shipped');
      case 'shipped': return context.tr('sp_delivered');
      default: return '';
    }
  }

  IconData _actionIcon(String status) {
    switch (status) {
      case 'generated': case 'sent_to_supplier': return Icons.check_circle_rounded;
      case 'acknowledged': return Icons.local_shipping_rounded;
      case 'shipped': return Icons.inventory_rounded;
      default: return Icons.check_rounded;
    }
  }

  Color _actionColor(String status, SemanticColors colors) {
    switch (status) {
      case 'generated': case 'sent_to_supplier': return colors.primaryBrand;
      case 'acknowledged': return colors.warning;
      case 'shipped': return colors.secondaryAccent;
      default: return colors.textSecondary;
    }
  }

  // ─── Tab 2: Catalog ───────────────────────────────────────────────────

  Widget _buildCatalog(List<SupplierItemModel> catalog, SemanticColors colors) {
    if (catalog.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.storefront_rounded, size: 56, color: colors.textSubtle),
            const SizedBox(height: 16),
            Text(context.tr('sp_catalog_empty'), style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
            const SizedBox(height: 6),
            Text(context.tr('sp_catalog_hint'), style: TextStyle(fontSize: 13, color: colors.textSecondary)),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () => _showAddCatalogModal(context),
              icon: const Icon(Icons.add_rounded, size: 18),
              label: Text(context.tr('sp_add_material')),
              style: ElevatedButton.styleFrom(
                backgroundColor: colors.primaryBrand,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ],
        ),
      );
    }
    // W4 FIX: Apply local search filter
    final searchLower = _catalogSearch.toLowerCase();
    final filtered = searchLower.isEmpty
        ? catalog
        : catalog.where((item) =>
            item.name.toLowerCase().contains(searchLower) ||
            item.category.toLowerCase().contains(searchLower)).toList();

    return Column(
      children: [
        // ── Search Bar ──
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: TextField(
            controller: _searchController,
            onChanged: (value) => setState(() => _catalogSearch = value),
            decoration: InputDecoration(
              hintText: context.tr('sp_search_catalog'),
              prefixIcon: Icon(Icons.search_rounded, color: colors.textSubtle, size: 20),
              suffixIcon: _catalogSearch.isNotEmpty
                  ? IconButton(
                      icon: Icon(Icons.clear_rounded, color: colors.textSubtle, size: 18),
                      onPressed: () {
                        _searchController.clear();
                        setState(() => _catalogSearch = '');
                      },
                    )
                  : null,
              filled: true,
              fillColor: colors.backgroundSecondary,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            ),
          ),
        ),
        // ── Results count ──
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: Row(
            children: [
              Text(
                '${filtered.length} ${context.tr('sp_results')}',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: colors.textSubtle),
              ),
            ],
          ),
        ),
        // ── Grid ──
        Expanded(
          child: filtered.isEmpty
              ? _emptyState(colors, Icons.search_off_rounded, context.tr('sp_no_results'), context.tr('sp_no_results_hint'))
              : RefreshIndicator(
                  onRefresh: () async {
                    context.read<SupplierBloc>().add(LoadDashboardEvent());
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
                    itemCount: filtered.length,
                    itemBuilder: (_, i) {
                      final item = filtered[i];
                      final isActive = item.isActive;
          return GestureDetector(
            onTap: isActive
                ? () => _showEditSheet(context, colors, item)
                : null,
            onLongPress: () => _showCatalogItemActions(context, colors, item),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: colors.surfaceElevated,
                borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
                border: Border.all(color: isActive ? colors.strokeSubtle : colors.error.withAlpha(40)),
                boxShadow: const [NammerhaShadows.elevation],
              ),
              child: Opacity(
                opacity: isActive ? 1.0 : 0.5,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Category + active dot
                    Row(children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(color: colors.warning.withAlpha(12), borderRadius: BorderRadius.circular(4)),
                        child: Text(item.category, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: colors.warning)),
                      ),
                      const Spacer(),
                      Container(
                        width: 8, height: 8,
                        decoration: BoxDecoration(
                          color: isActive ? colors.success : colors.textSubtle,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ]),
                    const SizedBox(height: 8),

                    // Name
                    Text(item.name, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: colors.textPrimary), maxLines: 2, overflow: TextOverflow.ellipsis),
                    const Spacer(),

                    // Price
                    Text(context.tr('sp_guide_price'), style: TextStyle(fontSize: 9, color: colors.textSubtle)),
                    Text('${formatCurrency(item.unitPriceGuide)} / ${item.unit}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: colors.secondaryAccent)),
                    const SizedBox(height: 4),

                    // Min order + lead time
                    Row(children: [
                      Text('${item.minOrderQty} ${context.tr('sp_min_order')}', style: TextStyle(fontSize: 9, color: colors.textSubtle)),
                      const Spacer(),
                      Text('${item.leadTimeDays} ${context.tr('ct_day')}', style: TextStyle(fontSize: 9, color: colors.textSubtle)),
                    ]),

                    const SizedBox(height: 8),
                    // Action hint
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        if (isActive) ...
                          [Icon(Icons.edit_rounded, size: 14, color: colors.primaryBrand), const SizedBox(width: 4)],
                        if (!isActive)
                          Text(context.tr('sp_deactivated'), style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: colors.error)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ).animate(delay: ((i * 60).clamp(0, 500)).ms).fadeIn().scale(begin: const Offset(0.95, 0.95), end: const Offset(1, 1));
                    },
                  ),
                ),
        ),
      ],
    );
  }

  /// C2+C3 FIX: Long-press context menu with Edit/Deactivate/Reactivate options.
  void _showCatalogItemActions(BuildContext context, SemanticColors colors, SupplierItemModel item) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      backgroundColor: colors.surfaceElevated,
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(item.name, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: colors.textPrimary)),
              const SizedBox(height: 16),
              if (item.isActive) ...[
                ListTile(
                  leading: Icon(Icons.edit_rounded, color: colors.primaryBrand),
                  title: Text(context.tr('sp_edit_item'), style: TextStyle(color: colors.textPrimary)),
                  onTap: () { Navigator.pop(context); _showEditSheet(context, colors, item); },
                ),
                ListTile(
                  leading: Icon(Icons.delete_outline_rounded, color: colors.error),
                  title: Text(context.tr('sp_deactivate_item'), style: TextStyle(color: colors.error)),
                  onTap: () {
                    Navigator.pop(context);
                    context.read<SupplierBloc>().add(DeactivateCatalogItemEvent(itemId: item.id));
                  },
                ),
              ] else
                ListTile(
                  leading: Icon(Icons.refresh_rounded, color: colors.success),
                  title: Text(context.tr('sp_reactivate_item'), style: TextStyle(color: colors.success)),
                  onTap: () {
                    Navigator.pop(context);
                    context.read<SupplierBloc>().add(ReactivateCatalogItemEvent(itemId: item.id));
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _showEditSheet(BuildContext context, SemanticColors colors, SupplierItemModel item) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      backgroundColor: colors.surfaceElevated,
      builder: (_) => _AddCatalogForm(blocContext: context, editItem: item),
    );
  }

  // ─── Tab 3: Analytics ─────────────────────────────────────────────────

  Widget _buildAnalytics(SemanticColors colors) {
    return BlocBuilder<SupplierBloc, SupplierState>(
      buildWhen: (_, c) => c is SupplierAnalyticsLoaded || c is SupplierAnalyticsError || c is SupplierLoading,
      builder: (context, state) {
        if (state is SupplierAnalyticsLoaded) {
          final data = state.analytics;
          if (data.isEmpty) {
            return _emptyState(colors, Icons.bar_chart_rounded, context.tr('sp_no_analytics'), context.tr('sp_no_analytics_hint'));
          }

          final maxRevenue = data.map((d) => d.revenue).reduce((a, b) => a > b ? a : b);
          final totalRevenue = data.fold<int>(0, (sum, d) => sum + d.revenue);
          final totalOrders = data.fold<int>(0, (sum, d) => sum + d.orderCount);

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── Summary Row ──
                Row(
                  children: [
                    Expanded(child: _analyticsSummaryCard(
                      context.tr('sp_total_revenue'), formatCurrency(totalRevenue), Icons.payments_rounded, colors.secondaryAccent, colors,
                    )),
                    const SizedBox(width: 12),
                    Expanded(child: _analyticsSummaryCard(
                      context.tr('sp_total_orders_period'), '$totalOrders', Icons.receipt_long_rounded, colors.primaryBrand, colors,
                    )),
                    const SizedBox(width: 12),
                    Expanded(child: _analyticsSummaryCard(
                      context.tr('sp_avg_order'), totalOrders > 0 ? formatCurrency(totalRevenue ~/ totalOrders) : '0', Icons.trending_up_rounded, colors.success, colors,
                    )),
                  ],
                ),
                const SizedBox(height: 24),

                // ── Chart Title ──
                Text(context.tr('sp_monthly_revenue'), style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: colors.textPrimary)),
                const SizedBox(height: 16),

                // ── Bar Chart ──
                SizedBox(
                  height: 220,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: data.map((point) {
                      final barHeight = maxRevenue > 0 ? (point.revenue / maxRevenue) * 180 : 0.0;
                      return Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 2),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              // Value label
                              Text(
                                formatCurrency(point.revenue),
                                style: TextStyle(fontSize: 8, fontWeight: FontWeight.w700, color: colors.textSubtle),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 4),
                              // Bar
                              AnimatedContainer(
                                duration: const Duration(milliseconds: 500),
                                curve: Curves.easeOutCubic,
                                height: barHeight.clamp(4.0, 180.0),
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    begin: Alignment.bottomCenter,
                                    end: Alignment.topCenter,
                                    colors: [colors.primaryBrand, colors.primaryBrand.withAlpha(120)],
                                  ),
                                  borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
                                ),
                              ),
                              const SizedBox(height: 6),
                              // Month label
                              Text(
                                point.monthLabel(locale: Localizations.localeOf(context).languageCode),
                                style: TextStyle(fontSize: 8, fontWeight: FontWeight.w600, color: colors.textSubtle),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              // Order count
                              Text(
                                '${point.orderCount}',
                                style: TextStyle(fontSize: 8, fontWeight: FontWeight.w700, color: colors.secondaryAccent),
                              ),
                            ],
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),

                const SizedBox(height: 8),
                Center(
                  child: Text(
                    context.tr('sp_chart_legend'),
                    style: TextStyle(fontSize: 10, color: colors.textSubtle),
                  ),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 400.ms);
        }

        // Analytics-specific error — contained within this tab
        if (state is SupplierAnalyticsError) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.bar_chart_rounded, size: 56, color: colors.textSubtle),
                  const SizedBox(height: 16),
                  Text(context.tr('sp_msg_analytics_failed'), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.textPrimary)),
                  const SizedBox(height: 12),
                  ElevatedButton.icon(
                    onPressed: () => context.read<SupplierBloc>().add(LoadAnalyticsEvent()),
                    icon: const Icon(Icons.refresh_rounded, size: 18),
                    label: Text(context.tr('sp_retry')),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: colors.primaryBrand,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        // Loading or initial state
        return Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(color: colors.primaryBrand),
              const SizedBox(height: 12),
              Text(context.tr('sp_loading_analytics'), style: TextStyle(color: colors.textSubtle, fontSize: 13)),
            ],
          ),
        );
      },
    );
  }

  Widget _analyticsSummaryCard(String label, String value, IconData icon, Color accent, SemanticColors colors) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.strokeSubtle),
        boxShadow: const [NammerhaShadows.elevation],
      ),
      child: Column(
        children: [
          Icon(icon, size: 22, color: accent),
          const SizedBox(height: 6),
          Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: accent), maxLines: 1, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 2),
          Text(label, style: TextStyle(fontSize: 9, color: colors.textSubtle), textAlign: TextAlign.center, maxLines: 2),
        ],
      ),
    );
  }

  // ─── Shared ───────────────────────────────────────────────────────────

  Widget _statusBadge(String status, SemanticColors colors) {
    Color c;
    switch (status.toLowerCase()) {
      case 'delivered': c = colors.success; break;
      case 'shipped': c = colors.info; break;
      case 'acknowledged': c = colors.primaryBrand; break;
      case 'generated': case 'sent_to_supplier': c = colors.warning; break;
      default: c = colors.textSecondary;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: c.withAlpha(15), borderRadius: BorderRadius.circular(6)),
      child: Text(context.tr('sp_status_${status.toLowerCase()}'), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: c)),
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

/// Dual-purpose modal form: Add new + Edit existing catalog items.
/// C2 FIX: Edit mode pre-fills controllers and dispatches UpdateCatalogItemEvent.
/// H4 FIX: Added description field.
class _AddCatalogForm extends StatefulWidget {
  final BuildContext blocContext;
  final SupplierItemModel? editItem;
  const _AddCatalogForm({required this.blocContext, this.editItem});

  @override
  State<_AddCatalogForm> createState() => _AddCatalogFormState();
}

class _AddCatalogFormState extends State<_AddCatalogForm> {
  late final TextEditingController nameC;
  late final TextEditingController categoryC;
  late final TextEditingController unitC;
  late final TextEditingController priceC;
  late final TextEditingController minOrderC;
  late final TextEditingController leadTimeC;
  late final TextEditingController descriptionC;

  bool get isEditMode => widget.editItem != null;

  @override
  void initState() {
    super.initState();
    final e = widget.editItem;
    nameC = TextEditingController(text: e?.name ?? '');
    categoryC = TextEditingController(text: e?.category ?? 'general');
    unitC = TextEditingController(text: e?.unit ?? 'piece');
    // E3 FIX: Use decimal display to prevent precision loss on edit.
    // Previous: `e.unitPriceGuide ~/ 100` — truncated cents (1550 → 15 → 1500).
    // Now: `e.unitPriceGuide / 100` with toStringAsFixed(2) — preserves cents.
    priceC = TextEditingController(text: e != null ? (e.unitPriceGuide / 100).toStringAsFixed(2) : '');
    minOrderC = TextEditingController(text: '${e?.minOrderQty ?? 1}');
    leadTimeC = TextEditingController(text: '${e?.leadTimeDays ?? 7}');
    descriptionC = TextEditingController(text: e?.description ?? '');
  }

  @override
  void dispose() {
    nameC.dispose();
    categoryC.dispose();
    unitC.dispose();
    priceC.dispose();
    minOrderC.dispose();
    leadTimeC.dispose();
    descriptionC.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = widget.blocContext.colors;
    
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              isEditMode ? context.tr('sp_edit_catalog_title') : context.tr('sp_add_catalog_title'),
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: colors.textPrimary),
            ),
            const SizedBox(height: 16),
            _field(nameC, context.tr('eng_material_name'), colors),
            const SizedBox(height: 8),
            _field(descriptionC, context.tr('sp_description'), colors, maxLines: 2),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: _field(categoryC, context.tr('eng_category'), colors)),
              const SizedBox(width: 8),
              Expanded(child: _field(unitC, context.tr('eng_unit'), colors)),
            ]),
            const SizedBox(height: 8),
            _field(priceC, context.tr('sp_guide_price_label'), colors, isDecimal: true),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: _field(minOrderC, context.tr('sp_min_order_label'), colors, isNum: true)),
              const SizedBox(width: 8),
              Expanded(child: _field(leadTimeC, context.tr('sp_lead_time'), colors, isNum: true)),
            ]),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _submit,
                icon: Icon(isEditMode ? Icons.save_rounded : Icons.add_rounded, size: 18),
                label: Text(isEditMode ? context.tr('sp_save_btn') : context.tr('sp_add_btn')),
                style: ElevatedButton.styleFrom(
                  backgroundColor: colors.primaryBrand,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _submit() {
    final name = nameC.text.trim();
    final category = categoryC.text.trim();
    final unit = unitC.text.trim();
    // E3 FIX: Parse as double to support decimal input (e.g. "15.50"),
    // then convert to integer cents with rounding for lossless storage.
    final priceParsed = double.tryParse(priceC.text) ?? 0;
    if (name.isEmpty || category.isEmpty || unit.isEmpty || priceParsed <= 0) return;
    final priceCents = (priceParsed * 100).round();

    final desc = descriptionC.text.trim();
    final description = desc.isNotEmpty ? desc : null;

    if (isEditMode) {
      widget.blocContext.read<SupplierBloc>().add(
        UpdateCatalogItemEvent(
          itemId: widget.editItem!.id,
          name: name,
          category: category,
          unit: unit,
          price: priceCents,
          minOrder: int.tryParse(minOrderC.text) ?? 1,
          leadTime: int.tryParse(leadTimeC.text) ?? 7,
          description: description,
        ),
      );
    } else {
      widget.blocContext.read<SupplierBloc>().add(
        AddCatalogItemEvent(
          name: name,
          category: category,
          unit: unit,
          price: priceCents,
          minOrder: int.tryParse(minOrderC.text) ?? 1,
          leadTime: int.tryParse(leadTimeC.text) ?? 7,
          description: description,
        ),
      );
    }

    Navigator.pop(context);
  }

  // F2 FIX: Added isDecimal parameter so price field shows decimal keyboard.
  Widget _field(TextEditingController c, String label, SemanticColors colors, {bool isNum = false, bool isDecimal = false, int maxLines = 1}) {
    return TextField(
      controller: c,
      keyboardType: isDecimal
          ? const TextInputType.numberWithOptions(decimal: true)
          : (isNum ? TextInputType.number : TextInputType.text),
      maxLines: maxLines,
      decoration: InputDecoration(
        labelText: label,
        filled: true,
        fillColor: colors.backgroundSecondary,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      ),
    );
  }
}
