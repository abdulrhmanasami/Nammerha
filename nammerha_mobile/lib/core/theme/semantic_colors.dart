import 'package:flutter/material.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Nammerha Unified Design System — Single Source of Truth
/// ═══════════════════════════════════════════════════════════════════════════
/// Extracted 1:1 from web platform CSS custom properties (main.css :root).
/// Reference: /frontend/src/styles/main.css
///
/// Brand Colors (from CSS):
///   --trust-blue: #1558d6        → primaryBrand
///   --trust-blue-hover: #0d47a1  → primaryBrandHover
///   --trust-blue-light: rgba(21, 88, 214, 0.1)  → primaryBrandLight
///   --smoky-jade: #0a6e55        → secondaryAccent
///   --smoky-jade-light: rgba(10, 110, 85, 0.1)  → secondaryAccentLight
///   --cloud-white: #f4f6f8       → cloudWhite (background)
///   --warm-earth: #d59f80        → warmEarth
///   --dark-tech: #242424         → darkTech
///   --warning-yellow: #fcc934    → warning
///   --error-red: #ef4444         → error
///
/// Logo Colors (from brand identity KI):
///   Cobalt: #0D47A1  |  Deep Pine: #0A6E55
///   Light Cobalt: #5C9CE6  |  Pine Light: #2ECC71  (dark mode)
///
/// Fonts:
///   Display (EN): 'Plus Jakarta Sans'
///   Arabic (AR): 'IBM Plex Sans Arabic'
///   ⚠ NOT Noto Kufi Arabic, NOT Kufam (those are system-level fallbacks only)
/// ═══════════════════════════════════════════════════════════════════════════

class SemanticColors extends ThemeExtension<SemanticColors> {
  // ─── Brand ──────────────────────────────────────────────────────
  final Color primaryBrand;       // --trust-blue
  final Color primaryBrandHover;  // --trust-blue-hover
  final Color primaryBrandLight;  // --trust-blue-light
  final Color secondaryAccent;    // --smoky-jade
  final Color secondaryAccentLight; // --smoky-jade-light
  final Color warmEarth;          // --warm-earth
  final Color goldFunding;        // --warning-yellow (escrow/funding)

  // ─── Background/Surface ─────────────────────────────────────────
  final Color backgroundPrimary;   // --cloud-white / --bg-primary
  final Color backgroundSecondary; // --surface-soft / --bg-secondary
  final Color backgroundTertiary;  // --surface-hover
  final Color surfaceElevated;     // --surface
  final Color surfaceCard;         // --surface-card (glassmorphism)

  // ─── Text ───────────────────────────────────────────────────────
  final Color textHeading;    // --text-heading (#0f172a)
  final Color textPrimary;    // --text-primary (theme-aware)
  final Color textBody;       // --text-body (#475569)
  final Color textSecondary;  // --text-secondary (#64748b)
  final Color textMuted;      // --text-muted (#94a3b8)
  final Color textSubtle;     // --text-subtle (#cbd5e1)
  final Color textInverse;    // white / dark

  // ─── Borders & Strokes ──────────────────────────────────────────
  final Color strokeBorder;   // --border-subtle (#e2e8f0)
  final Color strokeSubtle;   // --border-light
  final Color strokeFocus;    // focus ring = trust-blue

  // ─── Semantic Status ────────────────────────────────────────────
  final Color success;
  final Color successLight;
  final Color error;         // --error-red
  final Color errorLight;
  final Color warning;       // --warning-yellow
  final Color warningLight;
  final Color warningText;   // --warning-yellow-text (WCAG AA safe)
  final Color info;
  final Color infoLight;

  // ─── Glass & Overlays ───────────────────────────────────────────
  final Color glassCard;       // --surface-elevated
  final Color glassOverlay;    // --overlay-scrim
  final Color shimmerBase;
  final Color shimmerHighlight;

  const SemanticColors({
    required this.primaryBrand,
    required this.primaryBrandHover,
    required this.primaryBrandLight,
    required this.secondaryAccent,
    required this.secondaryAccentLight,
    required this.warmEarth,
    required this.goldFunding,
    required this.backgroundPrimary,
    required this.backgroundSecondary,
    required this.backgroundTertiary,
    required this.surfaceElevated,
    required this.surfaceCard,
    required this.textHeading,
    required this.textPrimary,
    required this.textBody,
    required this.textSecondary,
    required this.textMuted,
    required this.textSubtle,
    required this.textInverse,
    required this.strokeBorder,
    required this.strokeSubtle,
    required this.strokeFocus,
    required this.success,
    required this.successLight,
    required this.error,
    required this.errorLight,
    required this.warning,
    required this.warningLight,
    required this.warningText,
    required this.info,
    required this.infoLight,
    required this.glassCard,
    required this.glassOverlay,
    required this.shimmerBase,
    required this.shimmerHighlight,
  });

  /// ═══════════════════════════════════════════════════════════════
  /// Light Mode — Pixel-perfect match of web main.css :root
  /// ═══════════════════════════════════════════════════════════════
  factory SemanticColors.light() {
    return const SemanticColors(
      // Brand — exact hex from CSS (Platinum Standard updates)
      primaryBrand:       Color(0xFF1558D6), // --trust-blue
      primaryBrandHover:  Color(0xFF0D47A1), // --trust-blue-hover
      primaryBrandLight:  Color(0x1A1558D6), // rgba(21,88,214,0.1)
      secondaryAccent:    Color(0xFF0A6E55), // --smoky-jade
      secondaryAccentLight: Color(0x1A0A6E55), // rgba(10,110,85,0.1)
      warmEarth:          Color(0xFFD59F80), // --warm-earth
      goldFunding:        Color(0xFFFCC934), // --warning-yellow

      // Surfaces — exact values from CSS
      backgroundPrimary:  Color(0xFFF4F6F8), // --cloud-white
      backgroundSecondary: Color(0xFFF1F5F9), // --surface-soft
      backgroundTertiary: Color(0xFFF8FAFC), // --surface-hover
      surfaceElevated:    Color(0xFFFFFFFF), // --surface: #ffffff
      surfaceCard:        Color(0xB3FFFFFF), // rgba(255,255,255,0.7) --surface-elevated

      // Text — exact Slate palette from CSS
      textHeading:  Color(0xFF0F172A), // --text-heading (slate-900)
      textPrimary:  Color(0xFF1A202C), // --text-primary (light theme)
      textBody:     Color(0xFF475569), // --text-body (slate-600)
      textSecondary: Color(0xFF64748B), // --text-secondary (slate-500)
      textMuted:    Color(0xFF94A3B8), // --text-muted (slate-400)
      textSubtle:   Color(0xFFCBD5E1), // --text-subtle (slate-300)
      textInverse:  Color(0xFFFFFFFF),

      // Borders — exact values from CSS
      strokeBorder: Color(0xFFE2E8F0), // --border-subtle
      strokeSubtle: Color(0x4DFFFFFF), // --border-light rgba(255,255,255,0.3)
      strokeFocus:  Color(0xFF1558D6), // focus ring = trust-blue

      // Semantic Status
      success:      Color(0xFF0A6E55), // smoky-jade for progress
      successLight: Color(0x1A0A6E55), // smoky-jade-light
      error:        Color(0xFFEF4444), // --error-red
      errorLight:   Color(0x1AEF4444),
      warning:      Color(0xFFFCC934), // --warning-yellow
      warningLight: Color(0x1AFCC934),
      warningText:  Color(0xFFB45309), // --warning-yellow-text (WCAG AA)
      info:         Color(0xFF1558D6), // trust-blue
      infoLight:    Color(0x1A1558D6),

      // Glass & Overlays
      glassCard:       Color(0xB3FFFFFF), // rgba(255,255,255,0.7)
      glassOverlay:    Color(0x99000000), // --overlay-scrim rgba(0,0,0,0.6)
      shimmerBase:     Color(0xFFF1F5F9), // surface-soft
      shimmerHighlight: Color(0xFFF8FAFC), // surface-hover
    );
  }

  /// ═══════════════════════════════════════════════════════════════
  /// Dark Mode — Pixel-perfect match of web html[data-theme="dark"]
  /// ═══════════════════════════════════════════════════════════════
  factory SemanticColors.dark() {
    return const SemanticColors(
      // Brand — dark mode variants
      primaryBrand:       Color(0xFF5C9CE6), // Cobalt Light (from logo spec)
      primaryBrandHover:  Color(0xFF4A8BD4),
      primaryBrandLight:  Color(0x1A5C9CE6),
      secondaryAccent:    Color(0xFF2ECC71), // Pine Light (from logo spec)
      secondaryAccentLight: Color(0x1A2ECC71),
      warmEarth:          Color(0xFFD59F80),
      goldFunding:        Color(0xFFFFD54F),

      // Surfaces — exact dark theme from CSS
      backgroundPrimary:  Color(0xFF0F1117), // --bg-primary
      backgroundSecondary: Color(0xFF1A1D27), // --bg-secondary
      backgroundTertiary: Color(0xFF1F2231),
      surfaceElevated:    Color(0xFF1E222E), // slightly elevated
      surfaceCard:        Color(0xD91E222E), // rgba(30,34,46,0.85) --surface-card

      // Text — exact dark theme from CSS
      textHeading:  Color(0xFFE2E8F0), // --text-primary dark
      textPrimary:  Color(0xFFE2E8F0), // --text-primary
      textBody:     Color(0xA6E2E8F0), // rgba(226,232,240,0.65) --text-secondary
      textSecondary: Color(0xA6E2E8F0),
      textMuted:    Color(0x66E2E8F0), // --text-tertiary rgba(226,232,240,0.4)
      textSubtle:   Color(0x40E2E8F0),
      textInverse:  Color(0xFF0F1117),

      // Borders — dark
      strokeBorder: Color(0x0FFFFFFF), // rgba(255,255,255,0.06)
      strokeSubtle: Color(0x0AFFFFFF),
      strokeFocus:  Color(0xFF5C9CE6),

      // Semantic Status — dark mode
      success:      Color(0xFF2ECC71),
      successLight: Color(0x1A2ECC71),
      error:        Color(0xFFF87171),
      errorLight:   Color(0x1AF87171),
      warning:      Color(0xFFFFD54F),
      warningLight: Color(0x1AFFD54F),
      warningText:  Color(0xFFFFD54F),
      info:         Color(0xFF5C9CE6),
      infoLight:    Color(0x1A5C9CE6),

      // Glass & Overlays — dark
      glassCard:       Color(0xD91E222E), // rgba(30,34,46,0.85)
      glassOverlay:    Color(0xCC000000),
      shimmerBase:     Color(0xFF1A1D27),
      shimmerHighlight: Color(0xFF1E222E),
    );
  }

  @override
  ThemeExtension<SemanticColors> copyWith({
    Color? primaryBrand,
    Color? primaryBrandHover,
    Color? primaryBrandLight,
    Color? secondaryAccent,
    Color? secondaryAccentLight,
    Color? warmEarth,
    Color? goldFunding,
    Color? backgroundPrimary,
    Color? backgroundSecondary,
    Color? backgroundTertiary,
    Color? surfaceElevated,
    Color? surfaceCard,
    Color? textHeading,
    Color? textPrimary,
    Color? textBody,
    Color? textSecondary,
    Color? textMuted,
    Color? textSubtle,
    Color? textInverse,
    Color? strokeBorder,
    Color? strokeSubtle,
    Color? strokeFocus,
    Color? success,
    Color? successLight,
    Color? error,
    Color? errorLight,
    Color? warning,
    Color? warningLight,
    Color? warningText,
    Color? info,
    Color? infoLight,
    Color? glassCard,
    Color? glassOverlay,
    Color? shimmerBase,
    Color? shimmerHighlight,
  }) {
    return SemanticColors(
      primaryBrand: primaryBrand ?? this.primaryBrand,
      primaryBrandHover: primaryBrandHover ?? this.primaryBrandHover,
      primaryBrandLight: primaryBrandLight ?? this.primaryBrandLight,
      secondaryAccent: secondaryAccent ?? this.secondaryAccent,
      secondaryAccentLight: secondaryAccentLight ?? this.secondaryAccentLight,
      warmEarth: warmEarth ?? this.warmEarth,
      goldFunding: goldFunding ?? this.goldFunding,
      backgroundPrimary: backgroundPrimary ?? this.backgroundPrimary,
      backgroundSecondary: backgroundSecondary ?? this.backgroundSecondary,
      backgroundTertiary: backgroundTertiary ?? this.backgroundTertiary,
      surfaceElevated: surfaceElevated ?? this.surfaceElevated,
      surfaceCard: surfaceCard ?? this.surfaceCard,
      textHeading: textHeading ?? this.textHeading,
      textPrimary: textPrimary ?? this.textPrimary,
      textBody: textBody ?? this.textBody,
      textSecondary: textSecondary ?? this.textSecondary,
      textMuted: textMuted ?? this.textMuted,
      textSubtle: textSubtle ?? this.textSubtle,
      textInverse: textInverse ?? this.textInverse,
      strokeBorder: strokeBorder ?? this.strokeBorder,
      strokeSubtle: strokeSubtle ?? this.strokeSubtle,
      strokeFocus: strokeFocus ?? this.strokeFocus,
      success: success ?? this.success,
      successLight: successLight ?? this.successLight,
      error: error ?? this.error,
      errorLight: errorLight ?? this.errorLight,
      warning: warning ?? this.warning,
      warningLight: warningLight ?? this.warningLight,
      warningText: warningText ?? this.warningText,
      info: info ?? this.info,
      infoLight: infoLight ?? this.infoLight,
      glassCard: glassCard ?? this.glassCard,
      glassOverlay: glassOverlay ?? this.glassOverlay,
      shimmerBase: shimmerBase ?? this.shimmerBase,
      shimmerHighlight: shimmerHighlight ?? this.shimmerHighlight,
    );
  }

  @override
  ThemeExtension<SemanticColors> lerp(ThemeExtension<SemanticColors>? other, double t) {
    if (other is! SemanticColors) return this;
    return SemanticColors(
      primaryBrand: Color.lerp(primaryBrand, other.primaryBrand, t)!,
      primaryBrandHover: Color.lerp(primaryBrandHover, other.primaryBrandHover, t)!,
      primaryBrandLight: Color.lerp(primaryBrandLight, other.primaryBrandLight, t)!,
      secondaryAccent: Color.lerp(secondaryAccent, other.secondaryAccent, t)!,
      secondaryAccentLight: Color.lerp(secondaryAccentLight, other.secondaryAccentLight, t)!,
      warmEarth: Color.lerp(warmEarth, other.warmEarth, t)!,
      goldFunding: Color.lerp(goldFunding, other.goldFunding, t)!,
      backgroundPrimary: Color.lerp(backgroundPrimary, other.backgroundPrimary, t)!,
      backgroundSecondary: Color.lerp(backgroundSecondary, other.backgroundSecondary, t)!,
      backgroundTertiary: Color.lerp(backgroundTertiary, other.backgroundTertiary, t)!,
      surfaceElevated: Color.lerp(surfaceElevated, other.surfaceElevated, t)!,
      surfaceCard: Color.lerp(surfaceCard, other.surfaceCard, t)!,
      textHeading: Color.lerp(textHeading, other.textHeading, t)!,
      textPrimary: Color.lerp(textPrimary, other.textPrimary, t)!,
      textBody: Color.lerp(textBody, other.textBody, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      textMuted: Color.lerp(textMuted, other.textMuted, t)!,
      textSubtle: Color.lerp(textSubtle, other.textSubtle, t)!,
      textInverse: Color.lerp(textInverse, other.textInverse, t)!,
      strokeBorder: Color.lerp(strokeBorder, other.strokeBorder, t)!,
      strokeSubtle: Color.lerp(strokeSubtle, other.strokeSubtle, t)!,
      strokeFocus: Color.lerp(strokeFocus, other.strokeFocus, t)!,
      success: Color.lerp(success, other.success, t)!,
      successLight: Color.lerp(successLight, other.successLight, t)!,
      error: Color.lerp(error, other.error, t)!,
      errorLight: Color.lerp(errorLight, other.errorLight, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      warningLight: Color.lerp(warningLight, other.warningLight, t)!,
      warningText: Color.lerp(warningText, other.warningText, t)!,
      info: Color.lerp(info, other.info, t)!,
      infoLight: Color.lerp(infoLight, other.infoLight, t)!,
      glassCard: Color.lerp(glassCard, other.glassCard, t)!,
      glassOverlay: Color.lerp(glassOverlay, other.glassOverlay, t)!,
      shimmerBase: Color.lerp(shimmerBase, other.shimmerBase, t)!,
      shimmerHighlight: Color.lerp(shimmerHighlight, other.shimmerHighlight, t)!,
    );
  }
}

/// Quick access extension
extension SemanticColorsExtension on BuildContext {
  SemanticColors get colors => Theme.of(this).extension<SemanticColors>()!;
}
