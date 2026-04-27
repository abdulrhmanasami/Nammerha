import 'dart:math';
import 'package:flutter/material.dart';
import '../../../core/theme/semantic_colors.dart';

/// Simple bar chart using CustomPainter — no external charting library.
/// Renders time-series data with Trust Blue gradient bars.
///
/// Used by admin_dashboard_screen.dart for projects-by-month and
/// donations-by-month visualizations.
class AdminStatChart extends StatelessWidget {
  final List<ChartDataPoint> data;
  final String title;
  final double height;
  final Color? barColor;
  final bool showLabels;

  const AdminStatChart({
    super.key,
    required this.data,
    required this.title,
    this.height = 180,
    this.barColor,
    this.showLabels = true,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.strokeBorder.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: colors.textHeading,
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: height,
            child: data.isEmpty
                ? Center(
                    child: Text(
                      'لا توجد بيانات',
                      style: TextStyle(
                        fontSize: 12,
                        color: colors.textMuted,
                      ),
                    ),
                  )
                : CustomPaint(
                    size: Size.infinite,
                    painter: _BarChartPainter(
                      data: data,
                      barColor: barColor ?? colors.primaryBrand,
                      labelColor: colors.textMuted,
                      gridColor: colors.strokeBorder,
                      showLabels: showLabels,
                      textDirection: Directionality.of(context),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

/// Data point for the chart
class ChartDataPoint {
  final String label;
  final double value;

  const ChartDataPoint({required this.label, required this.value});
}

class _BarChartPainter extends CustomPainter {
  final List<ChartDataPoint> data;
  final Color barColor;
  final Color labelColor;
  final Color gridColor;
  final bool showLabels;
  final TextDirection textDirection;

  _BarChartPainter({
    required this.data,
    required this.barColor,
    required this.labelColor,
    required this.gridColor,
    required this.showLabels,
    required this.textDirection,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (data.isEmpty) return;

    final labelHeight = showLabels ? 20.0 : 0.0;
    final chartHeight = size.height - labelHeight;
    final maxValue = data.map((d) => d.value).reduce(max);
    final normalizedMax = maxValue == 0 ? 1.0 : maxValue;

    final barWidth = (size.width / data.length) * 0.6;
    final spacing = (size.width / data.length) * 0.4;
    final totalBarSpacing = barWidth + spacing;

    // Draw grid lines (3 horizontal)
    final gridPaint = Paint()
      ..color = gridColor.withValues(alpha: 0.3)
      ..strokeWidth = 0.5;

    for (int i = 1; i <= 3; i++) {
      final y = chartHeight * (1 - i / 4);
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    // Draw bars
    for (int i = 0; i < data.length; i++) {
      final point = data[i];
      final barHeight = (point.value / normalizedMax) * (chartHeight - 8);
      final x = i * totalBarSpacing + spacing / 2;
      final y = chartHeight - barHeight;

      // Bar gradient
      final rect = RRect.fromRectAndRadius(
        Rect.fromLTWH(x, y, barWidth, barHeight),
        const Radius.circular(4),
      );

      final gradient = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [barColor, barColor.withValues(alpha: 0.6)],
      );

      final paint = Paint()
        ..shader = gradient.createShader(rect.outerRect);

      canvas.drawRRect(rect, paint);

      // Labels
      if (showLabels && i % 2 == 0) {
        final label = point.label.length > 3
            ? point.label.substring(point.label.length - 2)
            : point.label;

        final textSpan = TextSpan(
          text: label,
          style: TextStyle(
            color: labelColor,
            fontSize: 9,
            fontWeight: FontWeight.w500,
          ),
        );
        final textPainter = TextPainter(
          text: textSpan,
          textDirection: textDirection,
        );
        textPainter.layout();
        textPainter.paint(
          canvas,
          Offset(x + (barWidth - textPainter.width) / 2, chartHeight + 4),
        );
      }
    }
  }

  @override
  bool shouldRepaint(_BarChartPainter oldDelegate) {
    return oldDelegate.data != data || oldDelegate.barColor != barColor;
  }
}
