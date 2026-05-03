import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/services/api_services.dart';
import '../../../core/network/api_client.dart';
import '../../../core/utils/error_localizer.dart';
import '../../../core/i18n/t.dart';
import '../bloc/bids_fetch_cubit.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// BidsScreen — Platinum Standard (Absolute Zero setState)
/// ═══════════════════════════════════════════════════════════════════════════
/// Data loading lifecycle managed via BidsFetchCubit.
/// ═══════════════════════════════════════════════════════════════════════════

class BidsScreen extends StatelessWidget {
  const BidsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => BidsFetchCubit(),
      child: const _BidsScreenContent(),
    );
  }
}

class _BidsScreenContent extends StatefulWidget {
  const _BidsScreenContent();

  @override
  State<_BidsScreenContent> createState() => _BidsScreenContentState();
}

class _BidsScreenContentState extends State<_BidsScreenContent> {
  final EngineerApi _engineerApi = EngineerApi();

  @override
  void initState() {
    super.initState();
    _loadBids();
  }

  Future<void> _loadBids() async {
    final cubit = context.read<BidsFetchCubit>();
    cubit.setLoading();
    try {
      final bids = await _engineerApi.getBids();
      cubit.setLoaded(bids);
    } on ApiException catch (e) {
      cubit.setError(localizeApiError(e.message));
    } catch (e) {
      cubit.setError('حدث خطأ في تحميل العروض');
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: const Text('عروضي'),
        actions: [
          IconButton(
            icon: Icon(Icons.add_circle_outline_rounded, color: colors.primaryBrand),
            onPressed: () => _showAddBidDialog(context, colors),
          ),
          IconButton(
            icon: Icon(Icons.filter_list_rounded, color: colors.primaryBrand),
            onPressed: () => _showFilterBottomSheet(context, colors),
          ),
        ],
      ),
      body: BlocBuilder<BidsFetchCubit, BidsFetchState>(
        builder: (context, state) => _buildBody(colors, state),
      ),
    );
  }

  Widget _buildBody(SemanticColors colors, BidsFetchState state) {
    if (state.isLoading) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(color: colors.primaryBrand),
            const SizedBox(height: 16),
            Text('جارٍ تحميل العروض...', style: TextStyle(color: colors.textSecondary)),
          ],
        ),
      );
    }

    if (state.error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.cloud_off_rounded, size: 64, color: colors.textSecondary),
              const SizedBox(height: 16),
              Text(state.error!, style: TextStyle(color: colors.error, fontSize: 16), textAlign: TextAlign.center),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                onPressed: _loadBids,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('إعادة المحاولة'),
                style: ElevatedButton.styleFrom(backgroundColor: colors.primaryBrand),
              ),
            ],
          ),
        ),
      );
    }

    if (state.bids.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.gavel_rounded, size: 64, color: colors.textSecondary),
            const SizedBox(height: 16),
            Text('لا توجد عروض بعد', style: TextStyle(color: colors.textSecondary, fontSize: 16)),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadBids,
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: state.bids.length,
        itemBuilder: (context, index) {
          final bid = state.bids[index];
          final status = (bid['status'] ?? '') as String;
          final projectTitle = bid['project_title'] ?? bid['projectTitle'] ?? '';
          final bidAmount = bid['proposed_cost'] ?? bid['bidAmount'] ?? 0;
          final methodology = bid['methodology'] ?? bid['cover_letter'] ?? '';

          Color statusColor;
          IconData statusIcon;
          String statusLabel;
          switch (status.toLowerCase()) {
            case 'accepted':
            case 'مقبول':
              statusColor = colors.success;
              statusIcon = Icons.check_circle_rounded;
              statusLabel = context.tr('str_19837e3e');
              break;
            case 'rejected':
            case 'مرفوض':
              statusColor = colors.error;
              statusIcon = Icons.cancel_rounded;
              statusLabel = context.tr('admin_filter_rejected');
              break;
            default:
              statusColor = colors.warning;
              statusIcon = Icons.hourglass_top_rounded;
              statusLabel = 'قيد المراجعة';
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
                        projectTitle.toString(),
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
                      _buildRow(context, 'قيمة العرض', formatCurrency(bidAmount as num)),
                      const SizedBox(height: 6),
                      _buildRow(context, context.tr('str_e690c520'), methodology.toString()),
                    ],
                  ),
                ),
              ],
            ),
          )
              .animate(delay: (index * 120).ms)
              .fadeIn()
              .slideY(begin: 0.08, end: 0);
        },
      ),
    );
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
                    Text('فرز وتصفية', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: colors.textPrimary)),
                    const SizedBox(height: 20),
                    Text('حالة العرض', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.textSecondary)),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 10,
                      children: [
                        _filterChip(ctx, 'الكل', 'all', colors),
                        _filterChip(ctx, 'قيد المراجعة', 'pending', colors),
                        _filterChip(ctx, 'مقبول', 'approved', colors),
                        _filterChip(ctx, 'مرفوض', 'rejected', colors),
                      ],
                    ),
                    const SizedBox(height: 24),
                    Text('القيمة المالية', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.textSecondary)),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 10,
                      children: [
                        _sortChip(ctx, 'الأعلى قيمة', 'highest_amount', colors),
                        _sortChip(ctx, 'الأقل قيمة', 'lowest_amount', colors),
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
        title: Text('تقديم عرض جديد', style: TextStyle(color: colors.textPrimary, fontWeight: FontWeight.w800)),
        content: Text('يرجى اختيار المشروع من "سوق المشاريع" لتقديم العرض عليه، لا يمكن تقديم عرض عشوائي.', style: TextStyle(color: colors.textSecondary)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('حسناً', style: TextStyle(color: colors.primaryBrand, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }
}
