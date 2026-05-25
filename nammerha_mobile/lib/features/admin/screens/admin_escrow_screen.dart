import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/services/api_services.dart';
import '../bloc/admin_escrow_bloc.dart';
import '../models/admin_models.dart';
import '../../../core/i18n/t.dart';
import '../../../core/utils/date_utils.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';
import '../../../core/widgets/swipe_to_confirm.dart';

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
          context.tr('admin_escrow'),
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
            return NammerhaShimmerLoader(colors: colors);
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
            Icon(PhosphorIconsRegular.checkCircle, size: 56, color: colors.success),
            const SizedBox(height: 12),
            Text(
              context.tr('admin_no_pending'),
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textHeading),
            ),
            Text(
              context.tr('admin_all_reviewed'),
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
                  child: Icon(PhosphorIconsRegular.receipt, color: colors.secondaryAccent, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        c.poNumber.isNotEmpty ? c.poNumber : '${context.tr('admin_escrow_proof_label')} #${c.proofId.substring(0, 8)}',
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
                  _detailChip(colors, PhosphorIconsRegular.buildings, c.projectTitle!),
                if (c.latitude != null && c.longitude != null)
                  _detailChip(colors, PhosphorIconsRegular.mapPin,
                      '${c.latitude!.toStringAsFixed(4)}, ${c.longitude!.toStringAsFixed(4)}'),
                if (c.submittedAt != null)
                  _detailChip(colors, PhosphorIconsRegular.clock, NammerhaDateUtils.formatDateShort(c.submittedAt!)),
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
                  child: SwipeToConfirm(
                    onConfirm: () => _confirmRelease(context, c),
                    label: context.tr('admin_release_escrow'),
                    activeColor: colors.success,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _showFlagDialog(context, c),
                    icon: Icon(PhosphorIconsRegular.flag, size: 18, color: colors.error),
                    label: Text(context.tr('admin_flag_discrepancy'), style: TextStyle(color: colors.error)),
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
        title: Text(context.tr('admin_release_confirm'), style: TextStyle(color: colors.textHeading, fontWeight: FontWeight.w700)),
        content: Text(
          '${context.tr('admin_escrow_release_confirm')} ${c.poNumber.isNotEmpty ? c.poNumber : c.proofId.substring(0, 8)}?',
          style: TextStyle(color: colors.textBody),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(context.tr('cancel'), style: TextStyle(color: colors.textMuted)),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              context.read<AdminEscrowBloc>().add(
                ReleaseEscrow(proofId: c.proofId, itemId: c.itemId),
              );
            },
            style: FilledButton.styleFrom(backgroundColor: colors.success),
            child: Text(context.tr('admin_release_escrow')),
          ),
        ],
      ),
    );
  }

  void _showFlagDialog(BuildContext context, EscrowCase c) {
    final bloc = context.read<AdminEscrowBloc>();
    showDialog(
      context: context,
      builder: (dialogContext) => _FlagDialog(escrowCase: c, bloc: bloc),
    );
  }

  // P2-002 FIX: Inline _formatDate() removed → NammerhaDateUtils.formatDateShort()
}

class _FlagDialog extends StatefulWidget {
  final EscrowCase escrowCase;
  final AdminEscrowBloc bloc;
  
  const _FlagDialog({required this.escrowCase, required this.bloc});

  @override
  State<_FlagDialog> createState() => _FlagDialogState();
}

class _FlagDialogState extends State<_FlagDialog> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: Text(context.tr('admin_flag_discrepancy'), style: TextStyle(color: colors.error, fontWeight: FontWeight.w700)),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            context.tr('admin_flag_reason'),
            style: TextStyle(color: colors.textBody, fontSize: 13),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _controller,
            maxLines: 3,
            decoration: InputDecoration(
              hintText: context.tr('reason_hint'),
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
          onPressed: () => Navigator.pop(context),
          child: Text(context.tr('cancel'), style: TextStyle(color: colors.textMuted)),
        ),
        FilledButton(
          onPressed: () {
            final reason = _controller.text.trim();
            if (reason.isEmpty) return;
            Navigator.pop(context);
            widget.bloc.add(
              FlagDiscrepancy(proofId: widget.escrowCase.proofId, reason: reason),
            );
          },
          style: FilledButton.styleFrom(backgroundColor: colors.error),
          child: Text(context.tr('admin_reject')),
        ),
      ],
    );
  }
}
