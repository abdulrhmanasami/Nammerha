import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/semantic_colors.dart';
import '../models/boq_item_model.dart';
import '../../bids/data/bids_repository.dart';
import '../../bids/screens/submit_bid_screen.dart';
import '../../../core/i18n/t.dart';
import '../bloc/boq_details_cubit.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// BOQ Details Screen — جداول الكميات والتسعير
/// ═══════════════════════════════════════════════════════════════════════════
/// P0-004 REMEDIATION: Purged all GoogleFonts.cairo usage and hardcoded colors.
/// Now uses context.colors semantic design system for full dark mode + RTL
/// compliance and visual consistency with the rest of the platform.
/// ═══════════════════════════════════════════════════════════════════════════
class BOQDetailsScreen extends StatelessWidget {
  final String projectId;

  const BOQDetailsScreen({super.key, required this.projectId});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => BOQDetailsCubit(),
      child: _BOQDetailsContent(projectId: projectId),
    );
  }
}

class _BOQDetailsContent extends StatefulWidget {
  final String projectId;
  const _BOQDetailsContent({required this.projectId});

  @override
  State<_BOQDetailsContent> createState() => _BOQDetailsContentState();
}

class _BOQDetailsContentState extends State<_BOQDetailsContent> {
  final _repository = BidsRepository();

  @override
  void initState() {
    super.initState();
    _fetchBOQ();
  }

  Future<void> _fetchBOQ() async {
    final cubit = context.read<BOQDetailsCubit>();
    try {
      final jsonList = await _repository.getProjectBOQ(widget.projectId);
      final parsed = await BOQItem.parseList(jsonList);
      cubit.setLoaded(parsed);
    } catch (e) {
      cubit.setError(e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        backgroundColor: colors.surfaceElevated,
        elevation: 0,
        title: Text(
          'جداول الكميات والتسعير',
          style: TextStyle(
            color: colors.textPrimary,
            fontWeight: FontWeight.bold,
          ),
        ),
        iconTheme: IconThemeData(color: colors.textPrimary),
      ),
      body: BlocBuilder<BOQDetailsCubit, BOQDetailsState>(
        builder: (context, bState) => _buildBody(colors, bState),
      ),
      bottomNavigationBar: BlocBuilder<BOQDetailsCubit, BOQDetailsState>(
        builder: (context, bState) {
          return bState.items.isNotEmpty
          ? Container(
              padding: const EdgeInsets.all(16),
              color: colors.surfaceElevated,
              child: SafeArea(
                child: ElevatedButton(
                  style: ButtonStyle(
                    backgroundColor:
                        WidgetStateProperty.all(colors.primaryBrandHover),
                    padding: WidgetStateProperty.all(
                        const EdgeInsets.symmetric(vertical: 16)),
                    shape: WidgetStateProperty.all(
                      RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            SubmitBidScreen(projectId: widget.projectId),
                      ),
                    );
                  },
                  child: Text(
                    'تقديم عطاء (Bid)',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: colors.textInverse,
                    ),
                  ),
                ),
              ),
            )
          : const SizedBox.shrink();
        },
      ),
    );
  }

  Widget _buildBody(SemanticColors colors, BOQDetailsState bState) {
    if (bState.isLoading) {
      return NammerhaShimmerLoader(colors: colors);
    }
    if (bState.error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.cloud_off_rounded,
                  size: 64, color: colors.textSecondary),
              const SizedBox(height: 16),
              Text(
                bState.error!,
                style: TextStyle(color: colors.error),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                onPressed: _fetchBOQ,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('إعادة المحاولة'),
                style: ElevatedButton.styleFrom(
                    backgroundColor: colors.primaryBrand),
              ),
            ],
          ),
        ),
      );
    }
    if (bState.items.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.receipt_long_rounded,
                size: 48, color: colors.textSubtle),
            const SizedBox(height: 12),
            Text(
              'لا توجد عناصر في جدول الكميات',
              style: TextStyle(color: colors.textSecondary),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _fetchBOQ,
      color: colors.primaryBrand,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: bState.items.length,
        separatorBuilder: (context, index) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          return _buildBOQCard(bState.items[index], colors, index);
        },
      ),
    );
  }

  Widget _buildBOQCard(BOQItem item, SemanticColors colors, int index) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  item.name,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                    color: colors.textPrimary,
                  ),
                ),
              ),
              if (item.hasInflation)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: colors.warningLight,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.trending_up,
                          color: colors.warningText, size: 16),
                      const SizedBox(width: 4),
                      Text(
                        'تضخم (FIDIC 13.8)',
                        style: TextStyle(
                          color: colors.warningText,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            item.description,
            style: TextStyle(color: colors.textBody),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _buildStat(context.tr('str_5101659e'), '${item.quantity} ${item.unit}', colors),
              _buildStat(
                  'السعر التقديري', '${item.estimatedUnitPrice} USD', colors),
              if (item.currentMarketPrice != null)
                _buildStat(
                  'سعر السوق (Oracle)',
                  '${item.currentMarketPrice} USD',
                  colors,
                  isWarning: item.hasInflation,
                ),
            ],
          ),
        ],
      ),
    ).animate(delay: (index * 80).ms).fadeIn().slideY(begin: 0.03);
  }

  Widget _buildStat(String label, String val, SemanticColors colors,
      {bool isWarning = false}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color: colors.textMuted,
          ),
        ),
        Text(
          val,
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: isWarning ? colors.warningText : colors.textPrimary,
          ),
        ),
      ],
    );
  }
}
