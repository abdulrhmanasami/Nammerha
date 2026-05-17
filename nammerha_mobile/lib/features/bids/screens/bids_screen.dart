import 'package:phosphor_flutter/phosphor_flutter.dart';
import '../../../core/widgets/error_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/services/api_services.dart';
import '../../../core/utils/haptics.dart';
import '../../../core/i18n/t.dart';
import '../../../core/widgets/shimmer_loader.dart';
import '../../../core/widgets/bottom_sheet_grabber.dart';
import '../bloc/bids_fetch_cubit.dart';
import '../models/bid_model.dart';
import '../../payments/screens/contract_list_screen.dart';
import '../../../core/utils/animation_budget.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// BidsScreen — Platinum Standard (P1-002 Architectural Purity)
/// ═══════════════════════════════════════════════════════════════════════════
/// PURE PRESENTATION LAYER — Zero API calls, zero raw Map access.
/// Data lifecycle fully owned by BidsFetchCubit.
/// All bid data accessed via typed BidModel.
/// ═══════════════════════════════════════════════════════════════════════════

class BidsScreen extends StatelessWidget {
  const BidsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => BidsFetchCubit()..fetchBids(),
      child: const _BidsScreenContent(),
    );
  }
}

class _BidsScreenContent extends StatelessWidget {
  const _BidsScreenContent();

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text(context.tr('my_bids')),
        actions: [
          IconButton(
            icon: Icon(PhosphorIconsRegular.plusCircle, color: colors.primaryBrand),
            onPressed: () => _showAddBidDialog(context, colors),
          ),
          IconButton(
            icon: Icon(PhosphorIconsRegular.faders, color: colors.primaryBrand),
            onPressed: () => _showFilterBottomSheet(context, colors),
          ),
        ],
      ),
      body: BlocBuilder<BidsFetchCubit, BidsFetchState>(
        builder: (context, state) => _buildBody(context, colors, state),
      ),
    );
  }

  Widget _buildBody(BuildContext context, SemanticColors colors, BidsFetchState state) {
    if (state.isLoading) {
      return NammerhaShimmerLoader(colors: colors, itemCount: 4);
    }

    if (state.error != null) {
      return NammerhaErrorState(
        message: context.tr(state.error!),
        onRetry: () => context.read<BidsFetchCubit>().fetchBids(),
      );
    }

    if (state.bids.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(PhosphorIconsRegular.gavel, size: 64, color: colors.textSecondary),
            const SizedBox(height: 16),
            Text(context.tr('no_bids_yet'), style: TextStyle(color: colors.textSecondary, fontSize: 16)),
            const SizedBox(height: 8),
            Text(context.tr('empty_bids_subtitle'), style: TextStyle(color: colors.textSubtle, fontSize: 13), textAlign: TextAlign.center),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: () => _showAddBidDialog(context, colors),
              icon: const Icon(PhosphorIconsRegular.plusCircle, size: 18),
              label: Text(context.tr('cta_browse_projects')),
              style: ElevatedButton.styleFrom(
                backgroundColor: colors.primaryBrand,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => context.read<BidsFetchCubit>().fetchBids(),
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: state.bids.length,
        itemBuilder: (context, index) => _bidCard(context, colors, state.bids[index], index),
      ),
    );
  }

  Widget _bidCard(BuildContext context, SemanticColors colors, BidModel bid, int index) {
    // Resolve status display from normalizedStatus
    final Color statusColor;
    final IconData statusIcon;
    final String statusLabel;

    switch (bid.normalizedStatus) {
      case 'accepted':
        statusColor = colors.success;
        statusIcon = PhosphorIconsRegular.checkCircle;
        statusLabel = context.tr('accepted');
        break;
      case 'rejected':
        statusColor = colors.error;
        statusIcon = PhosphorIconsRegular.xCircle;
        statusLabel = context.tr('admin_filter_rejected');
        break;
      default:
        statusColor = colors.warning;
        statusIcon = PhosphorIconsRegular.hourglassHigh;
        statusLabel = context.tr('bid_under_review');
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  bid.projectTitle,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: colors.textPrimary),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withAlpha(15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(statusIcon, size: 14, color: statusColor),
                    const SizedBox(width: 4),
                    Text(statusLabel, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: statusColor)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: colors.backgroundSecondary,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(
              children: [
                _buildRow(context, context.tr('bid_value'), formatCurrency(bid.proposedCost)),
                const SizedBox(height: 6),
                _buildRow(context, context.tr('methodology'), bid.methodology),
              ],
            ),
          ),
          // Phase 4: CTA for accepted bids → contract creation
          if (bid.normalizedStatus == 'accepted') ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const ContractListScreen()),
                  );
                },
                icon: const Icon(PhosphorIconsRegular.fileText, size: 18),
                label: Text(context.tr('create_contract')),
                style: ElevatedButton.styleFrom(
                  backgroundColor: colors.primaryBrand,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
          ],
        ],
      ),
    )
        .nmAnimate(context, delay: (index * 120).ms)
        .fadeIn()
        .slideY(begin: 0.08, end: 0);
  }

  Widget _buildRow(BuildContext context, String label, String value) {
    final colors = context.colors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 80,
          child: Text(label, style: TextStyle(fontSize: 12, color: colors.textSecondary, fontWeight: FontWeight.w500)),
        ),
        Expanded(
          child: Text(value, style: TextStyle(fontSize: 13, color: colors.textPrimary, fontWeight: FontWeight.w600)),
        ),
      ],
    );
  }

  void _showFilterBottomSheet(BuildContext context, SemanticColors colors) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) {
        return BlocProvider.value(
          value: context.read<BidsFetchCubit>(),
          child: Builder(
            builder: (ctx) {
              return Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: colors.surfaceElevated,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    BottomSheetGrabber(colors: colors),
                    Text(context.tr('bid_filter_sort'), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: colors.textPrimary)),
                    const SizedBox(height: 20),
                    Text(context.tr('bid_status_label'), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.textSecondary)),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 10,
                      children: [
                        _filterChip(ctx, context.tr('filter_all'), 'all', colors),
                        _filterChip(ctx, context.tr('bid_under_review'), 'pending', colors),
                        _filterChip(ctx, context.tr('ct_bid_accepted'), 'accepted', colors),
                        _filterChip(ctx, context.tr('ct_bid_rejected'), 'rejected', colors),
                      ],
                    ),
                    const SizedBox(height: 24),
                    Text(context.tr('bid_amount_section'), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.textSecondary)),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 10,
                      children: [
                        _sortChip(ctx, context.tr('bid_sort_highest'), 'highest_amount', colors),
                        _sortChip(ctx, context.tr('bid_sort_lowest'), 'lowest_amount', colors),
                      ],
                    ),
                    SizedBox(height: MediaQuery.of(context).padding.bottom + 20),
                  ],
                ),
              );
            }
          ),
        );
      },
    );
  }

  Widget _filterChip(BuildContext context, String label, String filterValue, SemanticColors colors) {
    final cubit = context.read<BidsFetchCubit>();
    final state = cubit.state;
    final isActive = state.activeFilter == filterValue || (state.activeFilter == null && filterValue == 'all');

    return ChoiceChip(
      label: Text(label),
      selected: isActive,
      onSelected: (selected) {
        if (selected) {
          Haptics.select();
          cubit.applyFilter(filter: filterValue, sort: state.activeSort);
          Navigator.pop(context);
        }
      },
      selectedColor: colors.primaryBrand.withAlpha(40),
      labelStyle: TextStyle(color: isActive ? colors.primaryBrand : colors.textPrimary, fontWeight: isActive ? FontWeight.bold : FontWeight.normal),
    );
  }

  Widget _sortChip(BuildContext context, String label, String sortValue, SemanticColors colors) {
    final cubit = context.read<BidsFetchCubit>();
    final state = cubit.state;
    final isActive = state.activeSort == sortValue;

    return ChoiceChip(
      label: Text(label),
      selected: isActive,
      onSelected: (selected) {
        Haptics.select();
        cubit.applyFilter(filter: state.activeFilter, sort: selected ? sortValue : null);
        Navigator.pop(context);
      },
      selectedColor: colors.primaryBrand.withAlpha(40),
      labelStyle: TextStyle(color: isActive ? colors.primaryBrand : colors.textPrimary, fontWeight: isActive ? FontWeight.bold : FontWeight.normal),
    );
  }

  void _showAddBidDialog(BuildContext context, SemanticColors colors) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: colors.surfaceElevated,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(context.tr('submit_new_bid'), style: TextStyle(color: colors.textPrimary, fontWeight: FontWeight.w800)),
        content: Text(context.tr('bid_select_project_hint'), style: TextStyle(color: colors.textSecondary)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(context.tr('ok'), style: TextStyle(color: colors.primaryBrand, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }
}
