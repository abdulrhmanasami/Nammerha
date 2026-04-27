import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/services/api_services.dart';
import '../bloc/admin_escrow_bloc.dart';
import '../models/admin_models.dart';

/// Admin Escrow Verification — Review spatial proofs & release/flag escrow.
class AdminEscrowScreen extends StatelessWidget {
  const AdminEscrowScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => AdminEscrowBloc()..add(LoadPendingCases()),
      child: const _EscrowView(),
    );
  }
}

class _EscrowView extends StatelessWidget {
  const _EscrowView();

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text(
          'الضمان المالي',
          style: TextStyle(fontWeight: FontWeight.w800, color: colors.textHeading),
        ),
        backgroundColor: colors.surfaceElevated,
        elevation: 0,
        iconTheme: IconThemeData(color: colors.textHeading),
      ),
      body: BlocConsumer<AdminEscrowBloc, AdminEscrowState>(
        listener: (context, state) {
          if (state is AdminEscrowActionSuccess) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text(state.message),
              backgroundColor: colors.success,
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ));
          }
          if (state is AdminEscrowError) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text(state.message),
              backgroundColor: colors.error,
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ));
          }
        },
        builder: (context, state) {
          if (state is AdminEscrowLoading) {
            return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
          }
          if (state is AdminEscrowCasesLoaded) {
            return _buildCasesList(context, state.cases);
          }
          return const SizedBox.shrink();
        },
      ),
    );
  }

  Widget _buildCasesList(BuildContext context, List<EscrowCase> cases) {
    final colors = context.colors;

    if (cases.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.check_circle_rounded, size: 56, color: colors.success),
            const SizedBox(height: 12),
            Text(
              'لا توجد إثباتات معلّقة',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textHeading),
            ),
            Text(
              'جميع الإثباتات تمت مراجعتها',
              style: TextStyle(fontSize: 13, color: colors.textMuted),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      color: colors.primaryBrand,
      onRefresh: () async {
        context.read<AdminEscrowBloc>().add(LoadPendingCases());
      },
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: cases.length,
        separatorBuilder: (ctx, idx) => const SizedBox(height: 12),
        itemBuilder: (context, index) => _buildCaseCard(context, cases[index]),
      ),
    );
  }

  Widget _buildCaseCard(BuildContext context, EscrowCase c) {
    final colors = context.colors;

    return Container(
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.strokeBorder.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: colors.secondaryAccentLight,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(Icons.receipt_long_rounded, color: colors.secondaryAccent, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        c.poNumber.isNotEmpty ? c.poNumber : 'إثبات #${c.proofId.substring(0, 8)}',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: colors.textHeading,
                        ),
                      ),
                      if (c.vendorName.isNotEmpty)
                        Text(
                          c.vendorName,
                          style: TextStyle(fontSize: 12, color: colors.textSecondary),
                        ),
                    ],
                  ),
                ),
                // Amount badge
                Container(
                  padding: const EdgeInsetsDirectional.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: colors.primaryBrandLight,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    formatCurrency(c.amountCents),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: colors.primaryBrand,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Details
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(16, 0, 16, 0),
            child: Wrap(
              spacing: 16,
              runSpacing: 6,
              children: [
                if (c.projectTitle != null)
                  _detailChip(colors, Icons.business_rounded, c.projectTitle!),
                if (c.latitude != null && c.longitude != null)
                  _detailChip(colors, Icons.location_on_rounded,
                      '${c.latitude!.toStringAsFixed(4)}, ${c.longitude!.toStringAsFixed(4)}'),
                if (c.submittedAt != null)
                  _detailChip(colors, Icons.schedule_rounded, _formatDate(c.submittedAt!)),
              ],
            ),
          ),

          const SizedBox(height: 12),

          // Action buttons
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(16, 0, 16, 16),
            child: Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () => _confirmRelease(context, c),
                    icon: const Icon(Icons.check_circle_rounded, size: 18),
                    label: const Text('تحرير الضمان'),
                    style: FilledButton.styleFrom(
                      backgroundColor: colors.success,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _showFlagDialog(context, c),
                    icon: Icon(Icons.flag_rounded, size: 18, color: colors.error),
                    label: Text('تعليم تناقض', style: TextStyle(color: colors.error)),
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(color: colors.error),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _detailChip(SemanticColors colors, IconData icon, String text) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: colors.textMuted),
        const SizedBox(width: 4),
        Text(text, style: TextStyle(fontSize: 11, color: colors.textSecondary)),
      ],
    );
  }

  void _confirmRelease(BuildContext context, EscrowCase c) {
    final colors = context.colors;
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('تأكيد تحرير الضمان', style: TextStyle(color: colors.textHeading, fontWeight: FontWeight.w700)),
        content: Text(
          'هل تريد تحرير الضمان المالي لـ ${c.poNumber.isNotEmpty ? c.poNumber : c.proofId.substring(0, 8)}؟',
          style: TextStyle(color: colors.textBody),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text('إلغاء', style: TextStyle(color: colors.textMuted)),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              context.read<AdminEscrowBloc>().add(
                ReleaseEscrow(proofId: c.proofId, itemId: c.itemId),
              );
            },
            style: FilledButton.styleFrom(backgroundColor: colors.success),
            child: const Text('تحرير'),
          ),
        ],
      ),
    );
  }

  void _showFlagDialog(BuildContext context, EscrowCase c) {
    final colors = context.colors;
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('تعليم تناقض', style: TextStyle(color: colors.error, fontWeight: FontWeight.w700)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'أدخل سبب رفض الإثبات:',
              style: TextStyle(color: colors.textBody, fontSize: 13),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: 'السبب...',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: colors.error),
                ),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text('إلغاء', style: TextStyle(color: colors.textMuted)),
          ),
          FilledButton(
            onPressed: () {
              final reason = controller.text.trim();
              if (reason.isEmpty) return;
              Navigator.pop(dialogContext);
              context.read<AdminEscrowBloc>().add(
                FlagDiscrepancy(proofId: c.proofId, reason: reason),
              );
            },
            style: FilledButton.styleFrom(backgroundColor: colors.error),
            child: const Text('رفض'),
          ),
        ],
      ),
    );
  }

  String _formatDate(String isoDate) {
    try {
      final date = DateTime.parse(isoDate);
      return '${date.day}/${date.month}/${date.year}';
    } catch (_) {
      return '—';
    }
  }
}
