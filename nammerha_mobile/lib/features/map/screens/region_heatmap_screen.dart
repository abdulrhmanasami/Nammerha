import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/network/api_client.dart';
import '../../../core/services/open_data_api.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/i18n/t.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Region Heatmap Screen — Advanced map visualization
/// ═══════════════════════════════════════════════════════════════════════════
/// GAP-M1 FIX: Visual geographic distribution of projects by Syrian
/// governorates. Shows funding density, project counts, and damage types
/// as a heatmap with interactive region cards.
///
/// Uses Open Data API stats + projects for real data.
/// ═══════════════════════════════════════════════════════════════════════════
class RegionHeatmapScreen extends StatefulWidget {
  const RegionHeatmapScreen({super.key});

  @override
  State<RegionHeatmapScreen> createState() => _RegionHeatmapScreenState();
}

class _RegionHeatmapScreenState extends State<RegionHeatmapScreen> {
  final OpenDataApi _api = OpenDataApi();
  bool _isLoading = true;
  List<_RegionData> _regions = [];
  Map<String, dynamic> _stats = {};
  int _maxCount = 1;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _isLoading = true);
    try {
      final results = await Future.wait([
        _api.getStats(),
        _api.getProjects(limit: 100),
      ]);
      _stats = results[0];
      final projData = results[1];
      final projects = (projData['projects'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ?? [];

      // Aggregate by region
      final regionMap = <String, _RegionData>{};
      for (final p in projects) {
        final region = p['region']?.toString() ?? 'غير محدد';
        final existing = regionMap[region];
        final cost = (p['total_estimated_cost'] ?? p['funding_goal'] ?? 0) as num;
        if (existing != null) {
          existing.count++;
          existing.totalFunding += cost.toDouble();
          final dtype = p['damage_type']?.toString() ?? '';
          if (dtype.isNotEmpty && !existing.damageTypes.contains(dtype)) {
            existing.damageTypes.add(dtype);
          }
        } else {
          regionMap[region] = _RegionData(
            name: region, count: 1, totalFunding: cost.toDouble(),
            damageTypes: [if (p['damage_type'] != null) p['damage_type'].toString()],
          );
        }
      }

      _regions = regionMap.values.toList()..sort((a, b) => b.count.compareTo(a.count));
      _maxCount = _regions.isEmpty ? 1 : _regions.first.count;
    } on ApiException catch (_) {
    } catch (_) {}
    if (mounted) setState(() => _isLoading = false);
  }

  String _formatAmount(num amount) {
    if (amount >= 1000000) return '${(amount / 1000000).toStringAsFixed(1)}M';
    if (amount >= 1000) return '${(amount / 1000).toStringAsFixed(0)}K';
    return amount.toStringAsFixed(0);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text('خريطة التوزيع الجغرافي', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: colors.textPrimary)),
        backgroundColor: colors.backgroundPrimary, elevation: 0,
        iconTheme: IconThemeData(color: colors.textPrimary),
      ),
      body: _isLoading
          ? Center(child: CircularProgressIndicator(color: colors.primaryBrand))
          : RefreshIndicator(
              onRefresh: _load,
              color: colors.primaryBrand,
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  // Header
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      gradient: NammerhaGradients.brandPrimary,
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Column(children: [
                      const Icon(Icons.public_rounded, color: Colors.white, size: 36),
                      const SizedBox(height: 8),
                      Text('${_stats['total_regions'] ?? _regions.length} محافظة', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white)),
                      Text('${_stats['total_projects'] ?? 0} مشروع إعادة إعمار', style: TextStyle(fontSize: 13, color: Colors.white.withAlpha(200))),
                    ]),
                  ).animate().fadeIn(duration: 400.ms),
                  const SizedBox(height: 20),

                  // Legend
                  Row(children: [
                    _legendDot(colors.error, 'كثافة عالية'),
                    const SizedBox(width: 16),
                    _legendDot(colors.warning, context.tr('pw_strength_good')),
                    const SizedBox(width: 16),
                    _legendDot(colors.success, context.tr('str_d6f3661b')),
                  ]),
                  const SizedBox(height: 16),

                  // Region cards
                  if (_regions.isEmpty)
                    Center(child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Text('لا توجد بيانات جغرافية', style: TextStyle(color: colors.textSecondary)),
                    ))
                  else
                    ...List.generate(_regions.length, (i) => _regionCard(_regions[i], colors, i)),
                ],
              ),
            ),
    );
  }

  Widget _legendDot(Color color, String label) {
    return Row(children: [
      Container(width: 10, height: 10, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
      const SizedBox(width: 4),
      Text(label, style: TextStyle(fontSize: 11, color: context.colors.textSubtle)),
    ]);
  }

  Widget _regionCard(_RegionData region, SemanticColors colors, int index) {
    final intensity = region.count / _maxCount;
    Color heatColor;
    if (intensity > 0.66) {
      heatColor = colors.error;
    } else if (intensity > 0.33) {
      heatColor = colors.warning;
    } else {
      heatColor = colors.success;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(color: heatColor.withAlpha(20), borderRadius: BorderRadius.circular(10)),
            child: Icon(Icons.location_city_rounded, color: heatColor, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(region.name, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: colors.textPrimary)),
            Text('${region.count} مشروع', style: TextStyle(fontSize: 12, color: colors.textSecondary)),
          ])),
          Text('${_formatAmount(region.totalFunding)} ل.س', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.secondaryAccent)),
        ]),
        const SizedBox(height: 10),
        // Heatmap bar
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: intensity,
            backgroundColor: colors.backgroundSecondary,
            valueColor: AlwaysStoppedAnimation(heatColor),
            minHeight: 6,
          ),
        ),
        if (region.damageTypes.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(spacing: 6, runSpacing: 4, children: region.damageTypes.map((dt) => Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(color: colors.backgroundSecondary, borderRadius: BorderRadius.circular(6)),
            child: Text(dt, style: TextStyle(fontSize: 10, color: colors.textSubtle)),
          )).toList()),
        ],
      ]),
    ).animate(delay: (index * 60).ms).fadeIn().slideY(begin: 0.03);
  }
}

class _RegionData {
  final String name;
  int count;
  double totalFunding;
  final List<String> damageTypes;

  _RegionData({
    required this.name,
    required this.count,
    required this.totalFunding,
    required this.damageTypes,
  });
}
