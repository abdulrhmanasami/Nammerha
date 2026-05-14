import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/services/api_services.dart'; // formatCurrency
import '../../boq/screens/boq_details_screen.dart';
// SUSPENDED: Donation system suspended indefinitely
// import '../../donations/screens/donation_checkout_screen.dart';
import '../../open_data/screens/transparency_dashboard_screen.dart';
import '../../cart/state/cart_store.dart';
import '../../cart/screens/cart_screen.dart';
import '../../auth/bloc/auth_bloc.dart';
import '../bloc/project_details_bloc.dart';
import '../bloc/project_details_event.dart';
import '../bloc/project_details_state.dart';
import '../../../core/i18n/t.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Project Details Screen
/// ═══════════════════════════════════════════════════════════════════════════
/// Absolute Zero Monolithic API coupling — Uses ProjectDetailsBloc Native State.
/// ═══════════════════════════════════════════════════════════════════════════
class ProjectDetailsScreen extends StatefulWidget {
  final String projectId;
  final String? projectTitle;

  const ProjectDetailsScreen({
    super.key,
    required this.projectId,
    this.projectTitle,
  });

  @override
  State<ProjectDetailsScreen> createState() => _ProjectDetailsScreenState();
}

class _ProjectDetailsScreenState extends State<ProjectDetailsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ProjectDetailsBloc>().add(LoadProjectDetailsRequested(widget.projectId));
    });
  }

  int _calculateBasketTotal(List<Map<String, dynamic>> boqItems, Map<String, int> selected) {
    int total = 0;
    for (final entry in selected.entries) {
      final item = boqItems.firstWhere(
        (b) => (b['item_id'] ?? b['itemId'] ?? '') == entry.key,
        orElse: () => <String, dynamic>{},
      );
      if (item.isNotEmpty) {
        final unitPrice = (item['unit_price'] ?? item['unitPrice'] ?? 0) as num;
        total += (unitPrice * entry.value).toInt();
      }
    }
    return total;
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final authState = context.read<AuthBloc>().state;
    final userRole = authState is AuthAuthenticated ? authState.user.role.toUpperCase() : 'USER';

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        // UX-F028: Hero shared element — title morphs FROM marketplace card title.
        // Material(type: transparency) prevents white background flash during flight.
        title: Hero(
          tag: 'project_title_${widget.projectId}',
          child: Material(
            type: MaterialType.transparency,
            child: Text(
              widget.projectTitle ?? 'تفاصيل المشروع',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: colors.textPrimary,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ),
        actions: [
          ListenableBuilder(
            listenable: CartStore.instance,
            builder: (context, _) {
              final count = CartStore.instance.items.length;
              return Stack(
                alignment: Alignment.center,
                children: [
                  IconButton(
                    icon: Icon(PhosphorIconsRegular.shoppingCart, color: colors.primaryBrand),
                    onPressed: () {
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const CartScreen()));
                    },
                  ),
                  if (count > 0)
                    PositionedDirectional(
                      top: 8,
                      end: 8,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(color: colors.error, shape: BoxShape.circle),
                        child: Text(
                          '$count',
                          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
          const SizedBox(width: 8),
        ],
      ),
      // UX-F028: Body restructured to Column with Hero gradient strip + Expanded BlocConsumer.
      // The Hero gradient strip is ALWAYS visible from frame 1 (before data loads),
      // guaranteeing a smooth Hero flight from the marketplace card header.
      body: Column(
        children: [
          // Hero destination — gradient strip (matches marketplace card header)
          Hero(
            tag: 'project_header_${widget.projectId}',
            child: Container(
              height: 120,
              width: double.infinity,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [colors.primaryBrand.withAlpha(40), colors.primaryBrand.withAlpha(15)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              child: Stack(
                children: [
                  Center(
                    child: Icon(
                      PhosphorIconsRegular.buildings,
                      size: 48,
                      color: colors.primaryBrand.withAlpha(60),
                    ),
                  ),
                ],
              ),
            ),
          ),
          // Main content — BlocConsumer handles loading/loaded/error states
          Expanded(
            child: BlocConsumer<ProjectDetailsBloc, ProjectDetailsState>(
        listener: (context, state) {},
        builder: (context, state) {
          if (state is ProjectDetailsLoading || state is ProjectDetailsInitial) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  NammerhaShimmerLoader(colors: colors, isList: false),
                  const SizedBox(height: 16),
                  Text('جارٍ التحميل...', style: TextStyle(color: colors.textSecondary)),
                ],
              ),
            );
          }

          if (state is ProjectDetailsError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(PhosphorIconsRegular.cloudSlash, size: 64, color: colors.textSecondary),
                    const SizedBox(height: 16),
                    Text(state.message, style: TextStyle(color: colors.error), textAlign: TextAlign.center),
                    const SizedBox(height: 20),
                    ElevatedButton.icon(
                      onPressed: () => context.read<ProjectDetailsBloc>().add(LoadProjectDetailsRequested(widget.projectId)),
                      icon: Icon(PhosphorIconsRegular.arrowsClockwise),
                      label: const Text('إعادة المحاولة'),
                      style: ElevatedButton.styleFrom(backgroundColor: colors.primaryBrand),
                    ),
                  ],
                ),
              ),
            );
          }

          if (state is ProjectDetailsLoaded) {
            return RefreshIndicator(
              onRefresh: () async {
                context.read<ProjectDetailsBloc>().add(LoadProjectDetailsRequested(widget.projectId));
              },
              color: colors.primaryBrand,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildProjectHeader(colors, state.project),
                    const SizedBox(height: 16),
                    _buildRoleActions(context, colors, userRole),
                    const SizedBox(height: 24),

                    // BOQ Section
                    Row(
                      children: [
                        Icon(PhosphorIconsRegular.listDashes, color: colors.primaryBrand, size: 22),
                        const SizedBox(width: 8),
                        Text(
                          'جدول الكميات (BOQ)',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.textPrimary),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'اختر المواد التي تريد تمويلها',
                      style: TextStyle(fontSize: 13, color: colors.textSecondary),
                    ),
                    const SizedBox(height: 16),

                    if (state.boqItems.isEmpty)
                      Center(
                        child: Padding(
                          padding: const EdgeInsets.all(32),
                          child: Text('لا توجد عناصر BOQ', style: TextStyle(color: colors.textSecondary)),
                        ),
                      )
                    else
                      ...List.generate(
                          state.boqItems.length,
                          (i) => _buildBOQItem(state.boqItems[i], colors, i, state.selectedQuantities)),

                    const SizedBox(height: 80), // Space for checkout bar
                  ],
                ),
              ),
            );
          }

          return const SizedBox.shrink();
        },
      ),
          ),
        ],
      ),
      bottomNavigationBar: BlocBuilder<ProjectDetailsBloc, ProjectDetailsState>(
        builder: (context, state) {
          if (state is ProjectDetailsLoaded) {
            final basketItemCount = state.selectedQuantities.values.where((v) => v > 0).length;
            if (basketItemCount > 0) {
              final basketTotal = _calculateBasketTotal(state.boqItems, state.selectedQuantities);
              return _buildCheckoutBar(colors, basketItemCount, basketTotal, state.boqItems, state.selectedQuantities);
            }
          }
          return const SizedBox.shrink();
        },
      ),
    );
  }

  Widget _buildProjectHeader(SemanticColors colors, Map<String, dynamic> project) {
    final funded = (project['funded_percentage'] ?? project['fundedPercentage'] ?? 0.0 as num).toDouble();
    final cost = (project['total_estimated_cost'] ?? project['totalEstimatedCost'] ?? 0) as num;
    final desc = project['description'] ?? '';
    final address = project['address_text'] ?? project['addressText'] ?? '';
    final damageType = project['damage_type'] ?? project['damageType'] ?? '';

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: colors.primaryBrandLight, borderRadius: BorderRadius.circular(8)),
                child: Text(damageType.toString(), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: colors.primaryBrand)),
              ),
              const Spacer(),
              if (address.toString().isNotEmpty)
                Row(
                  children: [
                    Icon(PhosphorIconsRegular.mapPin, size: 14, color: colors.textSecondary),
                    const SizedBox(width: 4),
                    Text(address.toString(), style: TextStyle(fontSize: 12, color: colors.textSecondary)),
                  ],
                ),
            ],
          ),
          if (desc.toString().isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(desc.toString(), style: TextStyle(fontSize: 14, color: colors.textPrimary, height: 1.6)),
          ],
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(formatCurrency(cost), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: colors.primaryBrand)),
              Text('${funded.toStringAsFixed(1)}%', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.success)),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: (funded / 100).clamp(0.0, 1.0),
              minHeight: 10,
              backgroundColor: colors.strokeSubtle,
              color: funded > 75 ? colors.success : colors.primaryBrand,
            ),
          ),
        ],
      ),
    ).animate().fadeIn().slideY(begin: -0.05);
  }

  Widget _buildBOQItem(Map<String, dynamic> item, SemanticColors colors, int index, Map<String, int> selectedQuantities) {
    final itemId = (item['item_id'] ?? item['itemId'] ?? '') as String;
    final name = item['material_name'] ?? item['materialName'] ?? '';
    final required = (item['required_quantity'] ?? item['requiredQuantity'] ?? 0) as num;
    final unit = item['unit'] ?? '';
    final unitPrice = (item['unit_price'] ?? item['unitPrice'] ?? 0) as num;
    final funded = (item['funded_percentage'] ?? item['fundedPercentage'] ?? 0) as num;

    final selectedQty = selectedQuantities[itemId] ?? 0;
    final remainingQty = (required * (1 - funded / 100)).ceil();
    final isFullyFunded = funded >= 100;

    Color statusColor;
    String statusLabel;
    if (isFullyFunded) {
      statusColor = colors.success;
      statusLabel = 'مموّل بالكامل';
    } else if (funded > 0) {
      statusColor = colors.warning;
      statusLabel = 'ممول جزئياً';
    } else {
      statusColor = colors.error;
      statusLabel = 'غير مموّل';
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: selectedQty > 0 ? colors.primaryBrand : colors.strokeSubtle, width: selectedQty > 0 ? 2 : 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(name.toString(), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: colors.textPrimary)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: statusColor.withAlpha(15), borderRadius: BorderRadius.circular(6)),
                child: Text(statusLabel, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: statusColor)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _infoChip(colors, context.tr('str_5101659e'), '$required $unit'),
              const SizedBox(width: 12),
              _infoChip(colors, 'سعر الوحدة', formatCurrency(unitPrice)),
              const SizedBox(width: 12),
              _infoChip(colors, context.tr('str_3b5f3860'), '$remainingQty $unit'),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: (funded / 100).clamp(0.0, 1.0),
              minHeight: 6,
              backgroundColor: colors.strokeSubtle,
              color: statusColor,
            ),
          ),

          // Quantity Selector (skip fully funded)
          if (!isFullyFunded) ...[
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  selectedQty > 0 ? formatCurrency(unitPrice.toInt() * selectedQty) : 'اختر الكمية',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: selectedQty > 0 ? colors.primaryBrand : colors.textSecondary),
                ),
                Row(
                  children: [
                    _qtyButton(colors, PhosphorIconsRegular.minus, () {
                      if (selectedQty > 0) {
                        context.read<ProjectDetailsBloc>().add(UpdateBOQQuantityRequested(itemId: itemId, quantity: selectedQty - 1));
                      }
                    }),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      child: Text('$selectedQty', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
                    ),
                    _qtyButton(colors, PhosphorIconsRegular.plus, () {
                      if (selectedQty < remainingQty) {
                        context.read<ProjectDetailsBloc>().add(UpdateBOQQuantityRequested(itemId: itemId, quantity: selectedQty + 1));
                      }
                    }),
                  ],
                ),
              ],
            ),
          ],
        ],
      ),
    ).animate(delay: (100 + index * 80).ms).fadeIn().slideY(begin: 0.03);
  }

  Widget _infoChip(SemanticColors colors, String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 10, color: colors.textSecondary)),
        Text(value, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: colors.textPrimary)),
      ],
    );
  }

  Widget _qtyButton(SemanticColors colors, IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 32, height: 32,
        decoration: BoxDecoration(
          color: colors.primaryBrandLight,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: colors.primaryBrand.withAlpha(40)),
        ),
        child: Icon(icon, size: 18, color: colors.primaryBrand),
      ),
    );
  }

  Widget _buildCheckoutBar(SemanticColors colors, int count, int total, List<Map<String, dynamic>> boqItems, Map<String, int> selectedQuantities) {
    return Container(
      padding: const EdgeInsetsDirectional.fromSTEB(20, 12, 20, 20),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        border: Border(top: BorderSide(color: colors.strokeSubtle)),
        boxShadow: [BoxShadow(color: Colors.black.withAlpha(8), blurRadius: 10, offset: const Offset(0, -4))],
      ),
      child: SafeArea(
        child: Row(
          children: [
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('$count عناصر', style: TextStyle(fontSize: 12, color: colors.textSecondary)),
                  Text(formatCurrency(total), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: colors.textPrimary)),
                ],
              ),
            ),
            ElevatedButton.icon(
              onPressed: () {
                for (final entry in selectedQuantities.entries) {
                  if (entry.value <= 0) continue;
                  final item = boqItems.firstWhere((b) => (b['item_id'] ?? b['itemId'] ?? '') == entry.key, orElse: () => <String, dynamic>{});
                  if (item.isNotEmpty) {
                    final unitPrice = (item['unit_price'] ?? item['unitPrice'] ?? 0) as num;
                    CartStore.instance.addItem(
                      id: entry.key,
                      projectId: widget.projectId,
                      name: item['material_name'] ?? item['materialName'] ?? '',
                      unitPrice: unitPrice.toInt(),
                      quantity: entry.value,
                      category: 'BOQ',
                      iconName: 'package',
                    );
                  }
                }
                
                context.read<ProjectDetailsBloc>().add(const ClearBOQSelectionsRequested());
                
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(context.tr('added_to_cart'), style: const TextStyle(fontFamily: 'Inter')),
                    backgroundColor: colors.success,
                    action: SnackBarAction(
                      label: context.tr('view_cart'),
                      textColor: Colors.white,
                      onPressed: () {
                        Navigator.push(context, MaterialPageRoute(builder: (_) => const CartScreen()));
                      },
                    ),
                  ),
                );
              },
              icon: Icon(PhosphorIconsRegular.shoppingCart, size: 18),
              label: Text(context.tr('add_to_cart')),
              style: ElevatedButton.styleFrom(
                backgroundColor: colors.primaryBrand,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UNIFIED CITIZEN: All action buttons visible to all users.
  // No role-based hiding — any citizen can bid or view transparency.
  // SUSPENDED: Donation button removed (May 2026 strategic decision).
  // ═══════════════════════════════════════════════════════════════════════════
  Widget _buildRoleActions(BuildContext context, SemanticColors colors, String userRole) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Bid / BOQ action — available to ALL users
        ElevatedButton.icon(
          onPressed: () {
            Navigator.push(context, MaterialPageRoute(
              builder: (_) => BOQDetailsScreen(projectId: widget.projectId),
            ));
          },
          icon: Icon(PhosphorIconsRegular.gavel),
          label: const Text('تقديم عطاء وتسعير (BOQ)'),
          style: ElevatedButton.styleFrom(
            backgroundColor: colors.primaryBrand,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
        ),
        const SizedBox(height: 12),
        // SUSPENDED: Donation button removed (May 2026 strategic decision)
        // Donate action was here — system suspended indefinitely.
        const SizedBox(height: 12),
        // Transparency Dashboard — available to ALL users
        OutlinedButton.icon(
          onPressed: () {
            Navigator.push(context, MaterialPageRoute(
              builder: (_) => TransparencyDashboardScreen(projectId: widget.projectId),
            ));
          },
          icon: Icon(PhosphorIconsRegular.eye, color: colors.primaryBrand),
          label: Text('سجل الشفافية (OCDS)', style: TextStyle(color: colors.primaryBrand)),
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 14),
            side: BorderSide(color: colors.primaryBrand),
          ),
        ),
      ],
    );
  }
}
