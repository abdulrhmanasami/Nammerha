import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'semantic_colors.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Nammerha Unified App Theme — Platinum Standard
/// ═══════════════════════════════════════════════════════════════════════════
/// Font Stack (from web main.css):
///   --font-display: 'Plus Jakarta Sans', sans-serif
///   --font-arabic:  'IBM Plex Sans Arabic', 'Kufam', sans-serif
///
/// Radii (from web :root):
///   --radius-sm: 8px   --radius-md: 12px   --radius-lg: 16px   --radius-xl: 24px
///
/// Spacing (from web :root, 16px base grid):
///   --space-xs: 4   --space-sm: 8   --space-md: 16   --space-lg: 24   --space-xl: 32
/// ═══════════════════════════════════════════════════════════════════════════
class NammerhaTheme {
  NammerhaTheme._();

  // ─── Font Family Constants (matching web CSS) ──────────────────
  static const String _fontArabic = 'IBM Plex Sans Arabic';
  // Fallback stack matches web: 'IBM Plex Sans Arabic', 'Kufam', sans-serif
  static const List<String> _fontFallback = ['Kufam', 'Noto Sans Arabic'];

  // ─── Radius Constants (matching web CSS tokens) ────────────────
  static const double radiusSm = 8.0;    // --radius-sm
  static const double radiusMd = 12.0;   // --radius-md
  static const double radiusLg = 16.0;   // --radius-lg
  static const double radiusXl = 24.0;   // --radius-xl
  static const double radiusFull = 9999.0; // --radius-full

  // ─── Spacing Constants (matching web CSS tokens) ────────────────
  static const double spaceXs = 4.0;   // --space-xs
  static const double spaceSm = 8.0;   // --space-sm
  static const double spaceMd = 16.0;  // --space-md
  static const double spaceLg = 24.0;  // --space-lg
  static const double spaceXl = 32.0;  // --space-xl
  static const double space2xl = 48.0; // --space-2xl

  /// Build the text theme using IBM Plex Sans Arabic (matching web --font-arabic)
  static TextTheme _buildTextTheme(SemanticColors colors) {
    final baseTheme = TextTheme(
      // Display — for hero/splash text
      displayLarge: TextStyle(fontSize: 34, fontWeight: FontWeight.w700, color: colors.textHeading, height: 1.4),
      displayMedium: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: colors.textHeading, height: 1.4),
      displaySmall: TextStyle(fontSize: 24, fontWeight: FontWeight.w600, color: colors.textHeading, height: 1.4),
      // Headline — section titles
      headlineLarge: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: colors.textHeading, height: 1.3),
      headlineMedium: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: colors.textHeading, height: 1.3),
      headlineSmall: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: colors.textHeading, height: 1.3),
      // Title — card/list titles
      titleLarge: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: colors.textPrimary, height: 1.3),
      titleMedium: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: colors.textPrimary, height: 1.3),
      titleSmall: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: colors.textPrimary, height: 1.3),
      // Body — paragraph/content (uses textBody = #475569 like web --text-body)
      bodyLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w400, color: colors.textBody, height: 1.6),
      bodyMedium: TextStyle(fontSize: 14, fontWeight: FontWeight.w400, color: colors.textBody, height: 1.6),
      bodySmall: TextStyle(fontSize: 12, fontWeight: FontWeight.w400, color: colors.textSecondary, height: 1.5),
      // Label — buttons, badges, form labels
      labelLarge: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.textPrimary, letterSpacing: 0.2),
      labelMedium: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: colors.textSecondary, letterSpacing: 0.2),
      labelSmall: TextStyle(fontSize: 10, fontWeight: FontWeight.w500, color: colors.textMuted, letterSpacing: 0.2),
    );
    // Apply IBM Plex Sans Arabic via GoogleFonts (will auto-download TTF)
    return GoogleFonts.ibmPlexSansArabicTextTheme(baseTheme);
  }

  /// ═══════════════════════════════════════════════════════════════
  /// Light Theme — matches web html[data-theme="light"]
  /// ═══════════════════════════════════════════════════════════════
  static ThemeData light() {
    final colors = SemanticColors.light();
    final textTheme = _buildTextTheme(colors);

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      fontFamily: _fontArabic,
      scaffoldBackgroundColor: colors.backgroundPrimary,
      colorScheme: ColorScheme.fromSeed(
        seedColor: colors.primaryBrand,
        brightness: Brightness.light,
        primary: colors.primaryBrand,
        onPrimary: Colors.white,
        secondary: colors.secondaryAccent,
        surface: colors.surfaceElevated,
        error: colors.error,
      ),
      textTheme: textTheme,

      // ─── AppBar — glass-nav equivalent ──────────────────────────
      appBarTheme: AppBarTheme(
        backgroundColor: colors.surfaceElevated,
        foregroundColor: colors.textHeading,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: true,
        surfaceTintColor: Colors.transparent,
        systemOverlayStyle: SystemUiOverlayStyle.dark,
        titleTextStyle: TextStyle(
          fontFamily: _fontArabic,
          fontFamilyFallback: _fontFallback,
          fontSize: 17,
          fontWeight: FontWeight.w700,
          color: colors.textHeading,
        ),
      ),

      // ─── Cards — glass-card equivalent ──────────────────────────
      cardTheme: CardThemeData(
        color: colors.surfaceElevated,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          side: BorderSide(color: colors.strokeBorder, width: 1),
        ),
      ),

      // ─── Buttons — .btn-primary equivalent ──────────────────────
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: colors.primaryBrand,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 24),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusMd)),
          textStyle: TextStyle(
            fontFamily: _fontArabic,
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),

      // ─── Outlined — .btn-secondary equivalent ───────────────────
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: colors.primaryBrand,
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 24),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusMd)),
          side: BorderSide(color: colors.primaryBrand, width: 1.5),
        ),
      ),

      // ─── Inputs — .nm-input equivalent ──────────────────────────
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusLg),
          borderSide: BorderSide(color: colors.strokeBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusLg),
          borderSide: BorderSide(color: colors.strokeBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusLg),
          borderSide: BorderSide(color: colors.primaryBrand, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusLg),
          borderSide: BorderSide(color: colors.error),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        labelStyle: TextStyle(color: colors.textSecondary, fontFamily: _fontArabic),
        hintStyle: TextStyle(color: colors.textMuted, fontFamily: _fontArabic, fontWeight: FontWeight.w400),
      ),

      // ─── Bottom Nav ─────────────────────────────────────────────
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: colors.surfaceElevated,
        selectedItemColor: colors.primaryBrand,
        unselectedItemColor: colors.textMuted,
        type: BottomNavigationBarType.fixed,
        elevation: 8,
        selectedLabelStyle: TextStyle(fontFamily: _fontArabic, fontSize: 11, fontWeight: FontWeight.w600),
        unselectedLabelStyle: TextStyle(fontFamily: _fontArabic, fontSize: 11, fontWeight: FontWeight.w400),
      ),

      // ─── Divider ────────────────────────────────────────────────
      dividerTheme: DividerThemeData(color: colors.strokeBorder, thickness: 1),

      // ─── SnackBar ───────────────────────────────────────────────
      snackBarTheme: SnackBarThemeData(
        backgroundColor: colors.textHeading,
        contentTextStyle: TextStyle(fontFamily: _fontArabic, fontSize: 14, color: Colors.white),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusMd)),
        behavior: SnackBarBehavior.floating,
      ),

      // ─── Dialog ─────────────────────────────────────────────────
      dialogTheme: DialogThemeData(
        backgroundColor: colors.surfaceElevated,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusXl)),
        titleTextStyle: TextStyle(fontFamily: _fontArabic, fontSize: 18, fontWeight: FontWeight.w700, color: colors.textHeading),
      ),

      // ─── Bottom Sheet ───────────────────────────────────────────
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: colors.surfaceElevated,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
      ),

      // ─── Chip ───────────────────────────────────────────────────
      chipTheme: ChipThemeData(
        backgroundColor: colors.primaryBrandLight,
        labelStyle: TextStyle(fontFamily: _fontArabic, color: colors.primaryBrand, fontSize: 12, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusSm)),
      ),

      extensions: [colors],
    );
  }

  /// ═══════════════════════════════════════════════════════════════
  /// Dark Theme — matches web html[data-theme="dark"]
  /// ═══════════════════════════════════════════════════════════════
  static ThemeData dark() {
    final colors = SemanticColors.dark();
    final textTheme = _buildTextTheme(colors);

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      fontFamily: _fontArabic,
      scaffoldBackgroundColor: colors.backgroundPrimary,
      colorScheme: ColorScheme.fromSeed(
        seedColor: colors.primaryBrand,
        brightness: Brightness.dark,
        primary: colors.primaryBrand,
        onPrimary: Colors.white,
        secondary: colors.secondaryAccent,
        surface: colors.surfaceElevated,
        error: colors.error,
      ),
      textTheme: textTheme,

      appBarTheme: AppBarTheme(
        backgroundColor: colors.backgroundPrimary,
        foregroundColor: colors.textHeading,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: true,
        surfaceTintColor: Colors.transparent,
        systemOverlayStyle: SystemUiOverlayStyle.light,
        titleTextStyle: TextStyle(
          fontFamily: _fontArabic,
          fontFamilyFallback: _fontFallback,
          fontSize: 17,
          fontWeight: FontWeight.w700,
          color: colors.textHeading,
        ),
      ),

      cardTheme: CardThemeData(
        color: colors.surfaceElevated,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          side: BorderSide(color: colors.strokeBorder, width: 1),
        ),
      ),

      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: colors.primaryBrand,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 24),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusMd)),
          textStyle: TextStyle(fontFamily: _fontArabic, fontSize: 14, fontWeight: FontWeight.w700),
        ),
      ),

      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: colors.primaryBrand,
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 24),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusMd)),
          side: BorderSide(color: colors.primaryBrand, width: 1.5),
        ),
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colors.backgroundSecondary,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusLg),
          borderSide: BorderSide(color: colors.strokeBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusLg),
          borderSide: BorderSide(color: colors.strokeBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusLg),
          borderSide: BorderSide(color: colors.primaryBrand, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        labelStyle: TextStyle(color: colors.textSecondary, fontFamily: _fontArabic),
        hintStyle: TextStyle(color: colors.textMuted, fontFamily: _fontArabic, fontWeight: FontWeight.w400),
      ),

      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: colors.backgroundPrimary,
        selectedItemColor: colors.primaryBrand,
        unselectedItemColor: colors.textMuted,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
        selectedLabelStyle: TextStyle(fontFamily: _fontArabic, fontSize: 11, fontWeight: FontWeight.w600),
        unselectedLabelStyle: TextStyle(fontFamily: _fontArabic, fontSize: 11, fontWeight: FontWeight.w400),
      ),

      dividerTheme: DividerThemeData(color: colors.strokeBorder, thickness: 1),

      snackBarTheme: SnackBarThemeData(
        backgroundColor: colors.textPrimary,
        contentTextStyle: TextStyle(fontFamily: _fontArabic, fontSize: 14, color: colors.backgroundPrimary),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusMd)),
        behavior: SnackBarBehavior.floating,
      ),

      dialogTheme: DialogThemeData(
        backgroundColor: colors.surfaceElevated,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusXl)),
        titleTextStyle: TextStyle(fontFamily: _fontArabic, fontSize: 18, fontWeight: FontWeight.w700, color: colors.textHeading),
      ),

      // P1-006 FIX: Use semantic color instead of hardcoded hex.
      // Light theme uses colors.surfaceElevated — dark must match the pattern.
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: colors.surfaceElevated,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
      ),

      chipTheme: ChipThemeData(
        backgroundColor: colors.primaryBrandLight,
        labelStyle: TextStyle(fontFamily: _fontArabic, color: colors.primaryBrand, fontSize: 12, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusSm)),
      ),

      extensions: [colors],
    );
  }
}

/// ═══════════════════════════════════════════════════════════════════════════
/// Nammerha Brand Gradients — Governed Presets
/// ═══════════════════════════════════════════════════════════════════════════
/// Centralized gradient definitions matching the web platform's brand identity.
/// Logo KI Reference: Cobalt #0D47A1 → Deep Pine #0A6E55 (angular gradient)
/// Web CSS Reference: --trust-blue, --smoky-jade, --warm-earth, --warning-yellow
/// ═══════════════════════════════════════════════════════════════════════════
class NammerhaGradients {
  NammerhaGradients._();

  // ─── Logo Brand Colors (from Brand Identity KI) ─────────────────
  /// Cobalt Sovereign — Logo primary (#0D47A1)
  static const Color logoCobalt = Color(0xFF0D47A1);
  /// Deep Pine — Logo secondary (#0A6E55)
  static const Color logoPine = Color(0xFF0A6E55);
  /// Cobalt Light — Dark mode logo (#5C9CE6)
  static const Color logoCobaltLight = Color(0xFF5C9CE6);
  /// Pine Light — Dark mode logo (#2ECC71)
  static const Color logoPineLight = Color(0xFF2ECC71);

  /// Brand Primary — Cobalt → Pine (Logo gradient). Used for splash, brand contexts.
  static const LinearGradient brandPrimary = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [logoCobalt, logoPine],
  );

  /// Brand Primary Dark — Light Cobalt → Pine Light
  static const LinearGradient brandPrimaryDark = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [logoCobaltLight, logoPineLight],
  );

  /// CTA Primary — Trust Blue → Smoky Jade. Used for primary action buttons.
  /// Maps to web: .btn-primary (--trust-blue) + .btn-jade (--smoky-jade)
  static const LinearGradient ctaPrimary = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF1A73E8), Color(0xFF109173)],
  );

  /// CTA Secondary — Warning gradient for caution-state buttons.
  static const LinearGradient ctaSecondary = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFFCC934), Color(0xFFF59E0B)],
  );

  /// CTA Warmth — Warm Earth → Gold. Used for inspiration/impact contexts.
  static const LinearGradient ctaWarmth = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFD59F80), Color(0xFFFCC934)],
  );

  /// Profile/Header gradient — Trust Blue → Smoky Jade
  static const LinearGradient profileHeader = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF1A73E8), Color(0xFF109173)],
  );
}

/// ═══════════════════════════════════════════════════════════════════════════
/// Nammerha Shadows — Pixel-perfect match of web CSS shadow tokens
/// ═══════════════════════════════════════════════════════════════════════════
class NammerhaShadows {
  NammerhaShadows._();

  /// --shadow-glass: 0 8px 32px 0 rgba(26, 115, 232, 0.05)
  static const BoxShadow glass = BoxShadow(
    color: Color(0x0D1A73E8), // 5% trust-blue
    blurRadius: 32,
    offset: Offset(0, 8),
  );

  /// --shadow-elevation: 0 2px 8px rgba(0, 0, 0, 0.08)
  static const BoxShadow elevation = BoxShadow(
    color: Color(0x14000000), // 8% black
    blurRadius: 8,
    offset: Offset(0, 2),
  );

  /// --shadow-cta: 0 4px 16px rgba(26, 115, 232, 0.25)
  static const BoxShadow cta = BoxShadow(
    color: Color(0x401A73E8), // 25% trust-blue
    blurRadius: 16,
    offset: Offset(0, 4),
  );

  /// --shadow-sheet: 0 -10px 40px rgba(0, 0, 0, 0.1)
  static const BoxShadow sheet = BoxShadow(
    color: Color(0x1A000000), // 10% black
    blurRadius: 40,
    offset: Offset(0, -10),
  );
}

/// ═══════════════════════════════════════════════════════════════════════════
/// Nammerha Animations — Standardized durations & curves matching web CSS
/// ═══════════════════════════════════════════════════════════════════════════
class NammerhaAnimations {
  NammerhaAnimations._();

  /// Standard interaction feedback (buttons, toggles)
  static const Duration fast = Duration(milliseconds: 150);
  /// Standard state transitions (hover, focus)
  static const Duration normal = Duration(milliseconds: 200);
  /// Card/element transitions
  static const Duration slow = Duration(milliseconds: 400);
  /// Page transitions
  static const Duration page = Duration(milliseconds: 500);

  /// Web CSS: cubic-bezier(0.34, 1.56, 0.64, 1) — card hover lift
  static const Curve elasticScale = Cubic(0.34, 1.56, 0.64, 1);
  /// Standard ease
  static const Curve ease = Curves.easeInOut;
}
