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

/// ═══════════════════════════════════════════════════════════════════════════
/// Supplier Portal — 2-Tab Dashboard (Orders + Catalog)
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

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
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
        title: const Text('بوابة المورّد'),
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
                  tooltip: 'اشتراكات TaaS',
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
          tabs: const [
            Tab(text: 'أوامر الشراء'),
            Tab(text: 'الكتالوج'),
          ],
        ),
      ),
      body: BlocConsumer<SupplierBloc, SupplierState>(
        listener: (context, state) {
          if (state is SupplierActionSuccess) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.message), backgroundColor: colors.success),
            );
          } else if (state is SupplierError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.message), backgroundColor: colors.error),
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

          if (state is SupplierError && state.message.contains('فشل')) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.error_outline, size: 64, color: colors.error),
                  const SizedBox(height: 16),
                  Text('حدث خطأ أثناء تحميل البيانات', style: TextStyle(color: colors.textPrimary)),
                  ElevatedButton(
                    onPressed: () => context.read<SupplierBloc>().add(LoadDashboardEvent()),
                    child: const Text('إعادة المحاولة'),
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
          _kpiChip('معلقة', '${dashboard.pendingOrders}', colors.warning, colors),
          _kpiChip('عقود', '${dashboard.wonContracts}', colors.primaryBrand, colors),
          _kpiChip('شحن', '${dashboard.inTransit}', colors.info, colors),
          _kpiChip('الإيراد', formatCurrency(dashboard.totalRevenue), colors.success, colors),
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
    if (orders.isEmpty) {
      return _emptyState(colors, Icons.inventory_2_rounded, 'لا توجد أوامر شراء بعد', 'ستظهر الطلبات عند طلب مواد من كتالوجك');
    }
    return RefreshIndicator(
      onRefresh: () async {
        context.read<SupplierBloc>().add(LoadDashboardEvent());
      },
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: orders.length,
        itemBuilder: (_, i) {
          final o = orders[i];
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
                        Text('الكمية', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w600, color: colors.textSubtle)),
                        Text('${o.quantity} ${o.unit}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary)),
                      ]),
                      Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text('المبلغ', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w600, color: colors.textSubtle)),
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
                      onPressed: () {
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
          ).animate(delay: (i * 70).ms).fadeIn().slideY(begin: 0.04, end: 0);
        },
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
      case 'generated': case 'sent_to_supplier': return 'تأكيد الاستلام';
      case 'acknowledged': return 'تم الشحن';
      case 'shipped': return 'تم التوصيل';
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
            Text('كتالوجك فارغ', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
            const SizedBox(height: 6),
            Text('أضف أول مادة لتبدأ باستلام أوامر الشراء', style: TextStyle(fontSize: 13, color: colors.textSecondary)),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () => _showAddCatalogModal(context),
              icon: const Icon(Icons.add_rounded, size: 18),
              label: const Text('إضافة مادة'),
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
    return RefreshIndicator(
      onRefresh: () async {
        context.read<SupplierBloc>().add(LoadDashboardEvent());
      },
      color: colors.primaryBrand,
      child: GridView.builder(
        padding: const EdgeInsets.all(16),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          childAspectRatio: 0.85,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
        ),
        itemCount: catalog.length,
        itemBuilder: (_, i) {
          final item = catalog[i];
          final isActive = item.isActive;
          return Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: colors.surfaceElevated,
              borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
              border: Border.all(color: colors.strokeSubtle),
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
                  Text('السعر الاسترشادي', style: TextStyle(fontSize: 9, color: colors.textSubtle)),
                  Text('${formatCurrency(item.unitPriceGuide)} / ${item.unit}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: colors.secondaryAccent)),
                  const SizedBox(height: 4),

                  // Min order + lead time
                  Row(children: [
                    Text('${item.minOrderQty} حد أدنى', style: TextStyle(fontSize: 9, color: colors.textSubtle)),
                    const Spacer(),
                    Text('${item.leadTimeDays} يوم', style: TextStyle(fontSize: 9, color: colors.textSubtle)),
                  ]),
                ],
              ),
            ),
          ).animate(delay: (i * 60).ms).fadeIn().scale(begin: const Offset(0.95, 0.95), end: const Offset(1, 1));
        },
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
      child: Text(status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: c)),
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

/// Helper modal form with properly managed controllers
class _AddCatalogForm extends StatefulWidget {
  final BuildContext blocContext;
  const _AddCatalogForm({required this.blocContext});

  @override
  State<_AddCatalogForm> createState() => _AddCatalogFormState();
}

class _AddCatalogFormState extends State<_AddCatalogForm> {
  final nameC = TextEditingController();
  final categoryC = TextEditingController(text: 'general');
  final unitC = TextEditingController(text: 'قطعة');
  final priceC = TextEditingController();
  final minOrderC = TextEditingController(text: '1');
  final leadTimeC = TextEditingController(text: '7');

  @override
  void dispose() {
    nameC.dispose();
    categoryC.dispose();
    unitC.dispose();
    priceC.dispose();
    minOrderC.dispose();
    leadTimeC.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = widget.blocContext.colors;
    
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('إضافة مادة للكتالوج', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: colors.textPrimary)),
          const SizedBox(height: 16),
          _field(nameC, 'اسم المادة', colors),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: _field(categoryC, 'التصنيف', colors)),
            const SizedBox(width: 8),
            Expanded(child: _field(unitC, 'الوحدة', colors)),
          ]),
          const SizedBox(height: 8),
          _field(priceC, 'السعر الاسترشادي (ل.س)', colors, isNum: true),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: _field(minOrderC, 'الحد الأدنى', colors, isNum: true)),
            const SizedBox(width: 8),
            Expanded(child: _field(leadTimeC, 'وقت التسليم (أيام)', colors, isNum: true)),
          ]),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () {
                final name = nameC.text.trim();
                final price = int.tryParse(priceC.text) ?? 0;
                if (name.isEmpty || price <= 0) return;

                widget.blocContext.read<SupplierBloc>().add(
                  AddCatalogItemEvent(
                    name: name,
                    category: categoryC.text.trim(),
                    unit: unitC.text.trim(),
                    price: price * 100, // Standardize to cents
                    minOrder: int.tryParse(minOrderC.text) ?? 1,
                    leadTime: int.tryParse(leadTimeC.text) ?? 7,
                  ),
                );
                
                Navigator.pop(context);
              },
              icon: const Icon(Icons.add_rounded, size: 18),
              label: const Text('إضافة'),
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
    );
  }

  Widget _field(TextEditingController c, String label, SemanticColors colors, {bool isNum = false}) {
    return TextField(
      controller: c,
      keyboardType: isNum ? TextInputType.number : TextInputType.text,
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
