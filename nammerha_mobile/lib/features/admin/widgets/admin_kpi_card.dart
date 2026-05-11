import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import '../../../core/theme/semantic_colors.dart';

/// Reusable KPI card with animated counter, icon, title, and optional trend.
/// Used across all admin dashboard screens.
///
/// Design: Glass card with icon accent circle, large animated value,
/// and subtle trend badge. Matches web admin-dashboard.ts KPI cards.
class AdminKpiCard extends StatefulWidget {
  final String title;
  final int value;
  final String? prefix;
  final String? suffix;
  final IconData icon;
  final Color? accentColor;
  final double? trendPercent;
  final bool isCurrency;

  const AdminKpiCard({
    super.key,
    required this.title,
    required this.value,
    this.prefix,
    this.suffix,
    required this.icon,
    this.accentColor,
    this.trendPercent,
    this.isCurrency = false,
  });

  @override
  State<AdminKpiCard> createState() => _AdminKpiCardState();
}

class _AdminKpiCardState extends State<AdminKpiCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1200),
      vsync: this,
    );
    _animation = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOutCubic,
    );
    _controller.forward();
  }

  @override
  void didUpdateWidget(AdminKpiCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value) {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String _formatValue(int value) {
    if (widget.isCurrency) {
      // Convert cents to dollars with commas
      final dollars = value ~/ 100;
      final formatted = dollars.toString().replaceAllMapped(
        RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
        (m) => '${m[1]},',
      );
      return '\$$formatted';
    }
    return value.toString().replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (m) => '${m[1]},',
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final accent = widget.accentColor ?? colors.primaryBrand;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.strokeBorder.withValues(alpha: 0.5)),
        boxShadow: [
          BoxShadow(
            color: colors.primaryBrand.withValues(alpha: 0.04),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Icon + Trend row
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(widget.icon, color: accent, size: 20),
              ),
              if (widget.trendPercent != null) _buildTrendBadge(colors),
            ],
          ),

          const SizedBox(height: 12),

          // Animated value
          AnimatedBuilder(
            animation: _animation,
            builder: (ctx, child) {
              final currentValue = (_animation.value * widget.value).round();
              return Text(
                '${widget.prefix ?? ''}${_formatValue(currentValue)}${widget.suffix ?? ''}',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: colors.textHeading,
                  letterSpacing: -0.5,
                ),
              );
            },
          ),

          const SizedBox(height: 4),

          // Title
          Text(
            widget.title,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: colors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTrendBadge(SemanticColors colors) {
    final trend = widget.trendPercent!;
    final isPositive = trend >= 0;
    final color = isPositive ? colors.success : colors.error;
    final icon = isPositive ? PhosphorIconsRegular.trendUp : PhosphorIconsRegular.trendDown;

    return Container(
      padding: const EdgeInsetsDirectional.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 2),
          Text(
            '${isPositive ? '+' : ''}${trend.toStringAsFixed(1)}%',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
