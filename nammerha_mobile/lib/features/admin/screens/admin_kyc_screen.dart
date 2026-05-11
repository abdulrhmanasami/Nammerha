import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/semantic_colors.dart';
import '../bloc/admin_kyc_bloc.dart';
import '../models/admin_models.dart';
import '../../../core/i18n/t.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';

/// Admin KYC Queue — Verify/reject identity documents.
class AdminKycScreen extends StatelessWidget {
  const AdminKycScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => AdminKycBloc()..add(const LoadKycQueue()),
      child: const _KycView(),
    );
  }
}

class _KycView extends StatelessWidget {
  const _KycView();

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text(
          'التحقق من الهوية',
          style: TextStyle(fontWeight: FontWeight.w800, color: colors.textHeading),
        ),
        backgroundColor: colors.surfaceElevated,
        elevation: 0,
        iconTheme: IconThemeData(color: colors.textHeading),
      ),
      body: BlocConsumer<AdminKycBloc, AdminKycState>(
        listener: (context, state) {
          if (state is AdminKycDecisionSuccess) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text(state.message),
              backgroundColor: colors.success,
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ));
          }
          if (state is AdminKycError) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text(state.message),
              backgroundColor: colors.error,
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ));
          }
        },
        builder: (context, state) {
          if (state is AdminKycLoading) {
            return NammerhaShimmerLoader(colors: colors);
          }
          if (state is AdminKycLoaded) {
            return _buildLoaded(context, state);
          }
          return const SizedBox.shrink();
        },
      ),
    );
  }

  Widget _buildLoaded(BuildContext context, AdminKycLoaded state) {
    final colors = context.colors;

    return Column(
      children: [
        // Stats Bar
        Container(
          margin: const EdgeInsets.all(16),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: colors.surfaceElevated,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: colors.strokeBorder.withValues(alpha: 0.5)),
          ),
          child: Row(
            children: [
              _statBadge(colors, context.tr('admin_suspended'), state.stats.pending, colors.warning),
              _statBadge(colors, context.tr('admin_filter_verified'), state.stats.verified, colors.success),
              _statBadge(colors, context.tr('admin_filter_rejected'), state.stats.rejected, colors.error),
              _statBadge(colors, context.tr('admin_filter_all'), state.stats.total, colors.primaryBrand),
            ],
          ),
        ),

        // Filter Chips
        SizedBox(
          height: 40,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsetsDirectional.only(start: 16),
            children: [
              _filterChip(context, colors, context.tr('admin_filter_all'), null, state.activeFilter),
              _filterChip(context, colors, context.tr('admin_suspended'), 'pending', state.activeFilter),
              _filterChip(context, colors, context.tr('admin_filter_verified'), 'verified', state.activeFilter),
              _filterChip(context, colors, context.tr('admin_filter_rejected'), 'rejected', state.activeFilter),
            ],
          ),
        ),

        const SizedBox(height: 8),

        // Entries List
        Expanded(
          child: state.entries.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.inbox_rounded, size: 48, color: colors.textMuted),
                      const SizedBox(height: 8),
                      Text('لا توجد طلبات', style: TextStyle(color: colors.textMuted)),
                    ],
                  ),
                )
              : RefreshIndicator(
                  color: colors.primaryBrand,
                  onRefresh: () async {
                    context.read<AdminKycBloc>().add(LoadKycQueue(statusFilter: state.activeFilter));
                  },
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: state.entries.length,
                    separatorBuilder: (ctx, idx) => const SizedBox(height: 10),
                    itemBuilder: (context, index) => _buildKycCard(context, state.entries[index]),
                  ),
                ),
        ),
      ],
    );
  }

  Widget _statBadge(SemanticColors colors, String label, int count, Color accent) {
    return Expanded(
      child: Column(
        children: [
          Text(
            count.toString(),
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: accent),
          ),
          Text(label, style: TextStyle(fontSize: 10, color: colors.textMuted)),
        ],
      ),
    );
  }

  Widget _filterChip(BuildContext context, SemanticColors colors, String label, String? filterValue, String? active) {
    final isActive = (filterValue == null && active == null) || (filterValue == active);
    return Padding(
      padding: const EdgeInsetsDirectional.only(end: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: isActive,
        selectedColor: colors.primaryBrand,
        labelStyle: TextStyle(
          color: isActive ? Colors.white : colors.textSecondary,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
        backgroundColor: colors.backgroundSecondary,
        side: BorderSide.none,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        onSelected: (_) {
          context.read<AdminKycBloc>().add(LoadKycQueue(statusFilter: filterValue));
        },
      ),
    );
  }

  Widget _buildKycCard(BuildContext context, KycEntry entry) {
    final colors = context.colors;
    final statusColor = _statusColor(colors, entry.kycStatus);

    return Container(
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.strokeBorder.withValues(alpha: 0.5)),
      ),
      child: Column(
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 22,
                  backgroundColor: colors.primaryBrandLight,
                  child: Text(
                    entry.fullName.isNotEmpty ? entry.fullName[0].toUpperCase() : '?',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: colors.primaryBrand,
                      fontSize: 16,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        entry.fullName,
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textHeading),
                      ),
                      Text(
                        entry.email,
                        style: TextStyle(fontSize: 11, color: colors.textMuted),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsetsDirectional.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _statusLabel(entry.kycStatus),
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: statusColor),
                  ),
                ),
              ],
            ),
          ),

          // Details
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(16, 0, 16, 8),
            child: Wrap(
              spacing: 12,
              runSpacing: 4,
              children: [
                _kycDetail(colors, Icons.badge_rounded, 'الدور: ${entry.role}'),
                if (entry.commercialRegisterNumber != null)
                  _kycDetail(colors, Icons.store_rounded, 'سجل: ${entry.commercialRegisterNumber}'),
                if (entry.engineeringLicenseNumber != null)
                  _kycDetail(colors, Icons.engineering_rounded, 'ترخيص: ${entry.engineeringLicenseNumber}'),
                if (entry.guildMembershipId != null)
                  _kycDetail(colors, Icons.groups_rounded, 'نقابة: ${entry.guildMembershipId}'),
              ],
            ),
          ),

          // Actions (only for pending)
          if (entry.kycStatus == 'pending' || entry.kycStatus == 'submitted')
            Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(16, 4, 16, 16),
              child: Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () {
                        context.read<AdminKycBloc>().add(
                          UpdateKycDecision(userId: entry.userId, decision: 'verified'),
                        );
                      },
                      icon: const Icon(Icons.check_rounded, size: 18),
                      label: const Text('قبول'),
                      style: FilledButton.styleFrom(
                        backgroundColor: colors.success,
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _showRejectDialog(context, entry),
                      icon: Icon(Icons.close_rounded, size: 18, color: colors.error),
                      label: Text(context.tr('admin_reject'), style: TextStyle(color: colors.error)),
                      style: OutlinedButton.styleFrom(
                        side: BorderSide(color: colors.error),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
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

  Widget _kycDetail(SemanticColors colors, IconData icon, String text) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: colors.textMuted),
        const SizedBox(width: 4),
        Text(text, style: TextStyle(fontSize: 11, color: colors.textSecondary)),
      ],
    );
  }

  Color _statusColor(SemanticColors colors, String status) {
    switch (status) {
      case 'verified': return colors.success;
      case 'rejected': return colors.error;
      case 'suspended': return colors.warning;
      default: return colors.goldFunding;
    }
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'verified': return 'محقق';
      case 'rejected': return 'مرفوض';
      case 'pending': return 'معلّق';
      case 'submitted': return 'مُقدَّم';
      case 'suspended': return 'معلّق';
      default: return status;
    }
  }

  void _showRejectDialog(BuildContext context, KycEntry entry) {
    final colors = context.colors;
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('رفض التحقق', style: TextStyle(color: colors.error, fontWeight: FontWeight.w700)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('رفض التحقق لـ ${entry.fullName}', style: TextStyle(color: colors.textBody, fontSize: 13)),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: 'سبب الرفض (اختياري)...',
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
            child: Text(context.tr('cancel'), style: TextStyle(color: colors.textMuted)),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              context.read<AdminKycBloc>().add(
                UpdateKycDecision(
                  userId: entry.userId,
                  decision: 'rejected',
                  reason: controller.text.trim().isNotEmpty ? controller.text.trim() : null,
                ),
              );
            },
            style: FilledButton.styleFrom(backgroundColor: colors.error),
            child: const Text('رفض'),
          ),
        ],
      ),
    );
  }
}
