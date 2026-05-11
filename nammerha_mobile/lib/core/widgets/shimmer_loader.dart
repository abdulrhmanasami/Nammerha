import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../theme/semantic_colors.dart';
import '../theme/app_theme.dart';

/// Wave 6 Demonic UX Fix: The "Infinite Spinner" Latency Trap
/// Replaces jarring CircularProgressIndicators with neurological skeleton loaders
/// that reduce perceived wait time.
class NammerhaShimmerLoader extends StatelessWidget {
  final SemanticColors colors;
  final bool isList;
  final int itemCount;

  const NammerhaShimmerLoader({
    super.key,
    required this.colors,
    this.isList = true,
    this.itemCount = 3,
  });

  @override
  Widget build(BuildContext context) {
    if (!isList) return _buildCard();

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: itemCount,
      itemBuilder: (context, index) => Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: _buildCard(),
      ),
    );
  }

  Widget _buildCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
        border: Border.all(color: colors.strokeSubtle.withAlpha(100)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(width: 60, height: 14, decoration: _box()),
              Container(width: 80, height: 20, decoration: _box(radius: 6)),
            ],
          ),
          const SizedBox(height: 16),
          Container(width: double.infinity, height: 18, decoration: _box()),
          const SizedBox(height: 8),
          Container(width: 150, height: 14, decoration: _box()),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(width: 40, height: 12, decoration: _box()),
              Container(width: 50, height: 14, decoration: _box()),
            ],
          ),
        ],
      ),
    ).animate(onPlay: (controller) => controller.repeat()).shimmer(duration: 1500.ms, color: colors.primaryBrand.withAlpha(20));
  }

  BoxDecoration _box({double radius = 4}) {
    return BoxDecoration(
      color: colors.textSubtle.withAlpha(30),
      borderRadius: BorderRadius.circular(radius),
    );
  }
}
