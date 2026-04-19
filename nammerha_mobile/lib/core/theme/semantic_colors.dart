import 'package:flutter/material.dart';

/// Semantic Colors System (Platinum Standard)
/// Eradicates hardcoded hex values in UI, adapting dynamically to Light/Dark modes.
class SemanticColors extends ThemeExtension<SemanticColors> {
  final Color primaryBrand;
  final Color backgroundPrimary;
  final Color backgroundSecondary;
  final Color textPrimary;
  final Color textSecondary;
  final Color strokeBorder;
  final Color success;
  final Color error;
  final Color glassCard;

  const SemanticColors({
    required this.primaryBrand,
    required this.backgroundPrimary,
    required this.backgroundSecondary,
    required this.textPrimary,
    required this.textSecondary,
    required this.strokeBorder,
    required this.success,
    required this.error,
    required this.glassCard,
  });

  /// Light Mode Standard Palette
  factory SemanticColors.light() {
    return const SemanticColors(
      primaryBrand: Color(0xFF0F172A), // Deep Indigo (Nammerha Core)
      backgroundPrimary: Color(0xFFFFFFFF),
      backgroundSecondary: Color(0xFFF1F5F9),
      textPrimary: Color(0xFF1E293B),
      textSecondary: Color(0xFF64748B),
      strokeBorder: Color(0xFFE2E8F0),
      success: Color(0xFF10B981),
      error: Color(0xFFEF4444),
      glassCard: Color(0xD9FFFFFF),
    );
  }

  /// Dark Mode Standard Palette
  factory SemanticColors.dark() {
    return const SemanticColors(
      primaryBrand: Color(0xFF38BDF8), // Light Sky Blue for Dark Mode
      backgroundPrimary: Color(0xFF020617),
      backgroundSecondary: Color(0xFF0F172A),
      textPrimary: Color(0xFFF8FAFC),
      textSecondary: Color(0xFF94A3B8),
      strokeBorder: Color(0xFF1E293B),
      success: Color(0xFF059669),
      error: Color(0xFFB91C1C),
      glassCard: Color(0x1AFFFFFF),
    );
  }

  @override
  ThemeExtension<SemanticColors> copyWith({
    Color? primaryBrand,
    Color? backgroundPrimary,
    Color? backgroundSecondary,
    Color? textPrimary,
    Color? textSecondary,
    Color? strokeBorder,
    Color? success,
    Color? error,
    Color? glassCard,
  }) {
    return SemanticColors(
      primaryBrand: primaryBrand ?? this.primaryBrand,
      backgroundPrimary: backgroundPrimary ?? this.backgroundPrimary,
      backgroundSecondary: backgroundSecondary ?? this.backgroundSecondary,
      textPrimary: textPrimary ?? this.textPrimary,
      textSecondary: textSecondary ?? this.textSecondary,
      strokeBorder: strokeBorder ?? this.strokeBorder,
      success: success ?? this.success,
      error: error ?? this.error,
      glassCard: glassCard ?? this.glassCard,
    );
  }

  @override
  ThemeExtension<SemanticColors> lerp(ThemeExtension<SemanticColors>? other, double t) {
    if (other is! SemanticColors) return this;
    return SemanticColors(
      primaryBrand: Color.lerp(primaryBrand, other.primaryBrand, t)!,
      backgroundPrimary: Color.lerp(backgroundPrimary, other.backgroundPrimary, t)!,
      backgroundSecondary: Color.lerp(backgroundSecondary, other.backgroundSecondary, t)!,
      textPrimary: Color.lerp(textPrimary, other.textPrimary, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      strokeBorder: Color.lerp(strokeBorder, other.strokeBorder, t)!,
      success: Color.lerp(success, other.success, t)!,
      error: Color.lerp(error, other.error, t)!,
      glassCard: Color.lerp(glassCard, other.glassCard, t)!,
    );
  }
}

/// Extension on BuildContext for quick access to Semantic Colors
extension SemanticColorsExtension on BuildContext {
  SemanticColors get colors => Theme.of(this).extension<SemanticColors>()!;
}
