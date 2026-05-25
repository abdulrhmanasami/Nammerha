import 'package:phosphor_flutter/phosphor_flutter.dart';
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
          context.tr('admin_verify_identity'),
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
                      Icon(PhosphorIconsRegular.identificationBadge, size: 48, color: colors.textMuted),
                      const SizedBox(height: 8),
                      Text(context.tr('admin_no_requests'), style: TextStyle(color: colors.textMuted)),
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
                    _statusLabel(context, entry.kycStatus),
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
                _kycDetail(colors, PhosphorIconsRegular.userCircle, '${context.tr('admin_role_label')} ${entry.role}'),
                if (entry.commercialRegisterNumber != null)
                  _kycDetail(colors, PhosphorIconsRegular.storefront, '${context.tr('admin_register')} ${entry.commercialRegisterNumber}'),
                if (entry.engineeringLicenseNumber != null)
                  _kycDetail(colors, PhosphorIconsRegular.hardHat, '${context.tr('admin_license')} ${entry.engineeringLicenseNumber}'),
                if (entry.guildMembershipId != null)
                  _kycDetail(colors, PhosphorIconsRegular.certificate, '${context.tr('admin_guild')} ${entry.guildMembershipId}'),
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
                      icon: Icon(PhosphorIconsRegular.check, size: 18),
                      label: Text(context.tr('admin_approve')),
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
                      icon: Icon(PhosphorIconsRegular.x, size: 18, color: colors.error),
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

  String _statusLabel(BuildContext context, String status) {
    switch (status) {
      case 'verified': return context.tr('admin_filter_verified');
      case 'rejected': return context.tr('admin_filter_rejected');
      case 'pending': return context.tr('admin_filter_pending');
      case 'submitted': return context.tr('admin_submitted');
      case 'suspended': return context.tr('admin_suspended');
      default: return status;
    }
  }

  void _showRejectDialog(BuildContext context, KycEntry entry) {
    final bloc = context.read<AdminKycBloc>();
    showDialog(
      context: context,
      builder: (dialogContext) => _RejectDialog(entry: entry, bloc: bloc),
    );
  }
}

class _RejectDialog extends StatefulWidget {
  final KycEntry entry;
  final AdminKycBloc bloc;
  
  const _RejectDialog({required this.entry, required this.bloc});

  @override
  State<_RejectDialog> createState() => _RejectDialogState();
}

class _RejectDialogState extends State<_RejectDialog> {
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
      title: Text(context.tr('admin_reject'), style: TextStyle(color: colors.error, fontWeight: FontWeight.w700)),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${context.tr('admin_reject')} — ${widget.entry.fullName}', style: TextStyle(color: colors.textBody, fontSize: 13)),
          const SizedBox(height: 12),
          TextField(
            controller: _controller,
            maxLines: 3,
            decoration: InputDecoration(
              hintText: context.tr('admin_reject_reason'),
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
            Navigator.pop(context);
            widget.bloc.add(
              UpdateKycDecision(
                userId: widget.entry.userId,
                decision: 'rejected',
                reason: _controller.text.trim().isNotEmpty ? _controller.text.trim() : null,
              ),
            );
          },
          style: FilledButton.styleFrom(backgroundColor: colors.error),
          child: Text(context.tr('admin_reject')),
        ),
      ],
    );
  }
}
