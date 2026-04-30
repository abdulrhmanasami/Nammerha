import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/gradient_button.dart';

import '../models/boq_models.dart';
import '../data/boq_repository.dart';
import '../bloc/boq_bloc.dart';
import '../bloc/boq_event.dart';
import '../bloc/boq_state.dart';
import '../../../core/i18n/t.dart';

class BoqBuilderScreen extends StatelessWidget {
  final String? projectId;

  const BoqBuilderScreen({super.key, this.projectId});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) {
        final bloc = BoqBloc(repository: BoqRepository());
        if (projectId != null) {
          bloc.add(LoadExistingBoqEvent(projectId!));
        }
        return bloc;
      },
      child: _BoqBuilderView(projectId: projectId),
    );
  }
}

class _BoqBuilderView extends StatefulWidget {
  final String? projectId;
  const _BoqBuilderView({this.projectId});

  @override
  State<_BoqBuilderView> createState() => _BoqBuilderViewState();
}

class _BoqBuilderViewState extends State<_BoqBuilderView> {
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  int _calculateTotalCents(List<BoqItemModel> items) {
    return items.fold(0, (sum, item) => sum + (item.unitPrice * item.quantity));
  }

  String _formatCurrency(num amount) {
    if (amount >= 1000000) {
      return '${(amount / 1000000).toStringAsFixed(1)}M ل.س';
    } else if (amount >= 1000) {
      return '${(amount / 1000).toStringAsFixed(0)}k ل.س';
    }
    return '${amount.toStringAsFixed(0)} ل.س';
  }

  void _showAddItemModal(BuildContext blocContext) {
    showModalBottomSheet(
      context: blocContext,
      isScrollControlled: true,
      backgroundColor: blocContext.colors.surfaceElevated,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => _AddBoqItemForm(blocContext: blocContext),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(title: const Text('جدول الكميات (BOQ)')),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showAddItemModal(context),
        backgroundColor: colors.primaryBrand,
        child: const Icon(Icons.add_rounded, color: Colors.white),
      ),
      body: BlocConsumer<BoqBloc, BoqState>(
        listener: (context, state) {
          if (state is BoqPublishSuccess) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: const Text('تم نشر جدول الكميات بنجاح ✓'), backgroundColor: colors.success),
            );
            Navigator.pop(context);
          } else if (state is BoqError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.error), backgroundColor: colors.error),
            );
          }
        },
        builder: (context, state) {
          if (state is BoqLoading) {
            return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
          }

          final items = state.items;

          return Column(
            children: [
              Expanded(
                child: items.isEmpty
                    ? _emptyState(colors)
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
                        itemCount: items.length,
                        itemBuilder: (_, i) => _buildItemCard(context, items[i], i, colors),
                      ),
              ),
              if (items.isNotEmpty) _buildFooter(context, state, colors),
            ],
          );
        },
      ),
    );
  }

  Widget _buildItemCard(BuildContext context, BoqItemModel item, int index, SemanticColors colors) {
    final totalCents = item.unitPrice * item.quantity;
    final IconData icon;
    switch (item.category.toLowerCase()) {
      case 'cement': icon = Icons.inventory_2_rounded; break;
      case 'steel': icon = Icons.straighten_rounded; break;
      case 'doors': icon = Icons.door_front_door_rounded; break;
      case 'wiring': icon = Icons.bolt_rounded; break;
      case 'plumbing': icon = Icons.water_drop_rounded; break;
      default: icon = Icons.view_in_ar_rounded;
    }

    return Dismissible(
      key: ValueKey('boq_${item.materialName}_$index'),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: AlignmentDirectional.centerEnd,
        padding: const EdgeInsetsDirectional.only(end: 20),
        decoration: BoxDecoration(
          color: colors.error.withAlpha(15),
          borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
        ),
        child: Icon(Icons.delete_rounded, color: colors.error),
      ),
      onDismissed: (_) {
         context.read<BoqBloc>().add(RemoveBoqItemEvent(index));
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: colors.surfaceElevated,
          borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
          border: Border.all(color: colors.strokeSubtle),
        ),
        child: Row(
          children: [
            // Material icon
            Container(
              width: 56, height: 56,
              decoration: BoxDecoration(
                color: const Color(0xFFD59F80).withAlpha(15), // Warm earth subtle
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, size: 26, color: colors.textPrimary),
            ),
            const SizedBox(width: 12),
            // Material info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.materialName, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary)),
                  const SizedBox(height: 2),
                  if (item.oraclePrice != null)
                    Row(children: [
                      Icon(Icons.show_chart_rounded, size: 12, color: colors.primaryBrand),
                      const SizedBox(width: 3),
                      Text('أوراكل: ${_formatCurrency(item.oraclePrice!)}/${item.unit}', style: TextStyle(fontSize: 11, color: colors.primaryBrand)),
                    ]),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(context.tr('str_245e33ef'), style: TextStyle(fontSize: 9, fontWeight: FontWeight.w600, color: colors.textSubtle)),
                          Text(_formatCurrency(totalCents), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: colors.primaryBrand)),
                        ],
                      ),
                      // Quantity controls
                      Container(
                        decoration: BoxDecoration(
                          color: colors.backgroundSecondary,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          children: [
                            _qtyBtn(Icons.remove_rounded, () {
                              context.read<BoqBloc>().add(UpdateBoqQuantityEvent(index, item.quantity - 1));
                            }, colors),
                            SizedBox(
                              width: 32,
                              child: Text('${item.quantity}', textAlign: TextAlign.center, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary)),
                            ),
                            _qtyBtn(Icons.add_rounded, () {
                               context.read<BoqBloc>().add(UpdateBoqQuantityEvent(index, item.quantity + 1));
                            }, colors, isPrimary: true),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ).animate(delay: (index * 60).ms).fadeIn().slideX(begin: 0.05, end: 0);
  }

  Widget _qtyBtn(IconData icon, VoidCallback onTap, SemanticColors colors, {bool isPrimary = false}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 32, height: 32,
        decoration: BoxDecoration(
          color: isPrimary ? colors.primaryBrand : colors.surfaceElevated,
          borderRadius: BorderRadius.circular(8),
          boxShadow: const [NammerhaShadows.elevation],
        ),
        child: Icon(icon, size: 16, color: isPrimary ? Colors.white : colors.textPrimary),
      ),
    );
  }

  Widget _buildFooter(BuildContext context, BoqState state, SemanticColors colors) {
    final isPublishing = state is BoqPublishLoading;
    final totalCents = _calculateTotalCents(state.items);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        border: Border(top: BorderSide(color: colors.strokeSubtle)),
        boxShadow: const [NammerhaShadows.elevation],
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('${state.items.length} ${state.items.length == 1 ? context.tr('str_fd63841b') : context.tr('str_46648494')}', style: TextStyle(fontSize: 12, color: colors.textSecondary)),
                  Text(_formatCurrency(totalCents), style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: colors.textPrimary)),
                ],
              ),
            ),
            const SizedBox(width: 12),
            GradientButton(
              label: isPublishing ? 'جارِ النشر...' : 'نشر في السوق',
              icon: isPublishing ? Icons.hourglass_top_rounded : Icons.publish_rounded,
              onPressed: (isPublishing || widget.projectId == null) ? null : () {
                context.read<BoqBloc>().add(PublishBoqEvent(widget.projectId!));
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _emptyState(SemanticColors colors) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.list_alt_rounded, size: 64, color: colors.textSubtle),
          const SizedBox(height: 16),
          Text('لم تُضاف أي مواد بعد', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
          const SizedBox(height: 6),
          Text('اضغط + لإضافة مواد إلى جدول الكميات', style: TextStyle(fontSize: 13, color: colors.textSecondary)),
        ],
      ),
    );
  }
}

class _AddBoqItemForm extends StatefulWidget {
  final BuildContext blocContext;
  const _AddBoqItemForm({required this.blocContext});

  @override
  State<_AddBoqItemForm> createState() => _AddBoqItemFormState();
}

class _AddBoqItemFormState extends State<_AddBoqItemForm> {
  final nameC = TextEditingController();
  final unitC = TextEditingController(text: 'قطعة');
  final priceC = TextEditingController();
  final categoryC = TextEditingController(text: 'general');

  @override
  void dispose() {
    nameC.dispose();
    unitC.dispose();
    priceC.dispose();
    categoryC.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = widget.blocContext.colors;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('إضافة مادة', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: colors.textPrimary)),
          const SizedBox(height: 16),
          _field(nameC, 'اسم المادة', colors),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _field(unitC, context.tr('str_694ca78e'), colors)),
              const SizedBox(width: 10),
              Expanded(child: _field(categoryC, context.tr('str_cf143297'), colors)),
            ],
          ),
          const SizedBox(height: 10),
          _field(priceC, 'سعر الوحدة (ل.س)', colors, isNumber: true),
          const SizedBox(height: 16),
          GradientButton(
            label: 'إضافة إلى القائمة',
            icon: Icons.add_rounded,
            onPressed: () {
              final name = nameC.text.trim();
              final price = int.tryParse(priceC.text) ?? 0;
              if (name.isEmpty || price <= 0) return;
              
              widget.blocContext.read<BoqBloc>().add(
                AddBoqItemEvent(BoqItemModel(
                  materialName: name,
                  category: categoryC.text.trim(),
                  unit: unitC.text.trim(),
                  unitPrice: price * 100, // Convert to cents
                  quantity: 1,
                ))
              );
              Navigator.pop(context);
            },
          ),
        ],
      ),
    );
  }

  Widget _field(TextEditingController controller, String label, SemanticColors colors, {bool isNumber = false}) {
    return TextField(
      controller: controller,
      keyboardType: isNumber ? TextInputType.number : TextInputType.text,
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
