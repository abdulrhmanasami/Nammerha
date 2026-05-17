import 'package:flutter/widgets.dart';
import '../i18n/t.dart';
import '../i18n/translations.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Shared Formatting Utilities — Platinum Standard
/// ═══════════════════════════════════════════════════════════════════════════
/// Single source of truth for currency and date formatting across the entire
/// app. Eliminates the 8+ duplicate formatCurrency() methods scattered across
/// feature screens.
///
/// LOCALE-AWARE ARCHITECTURE:
/// All static methods resolve the currency symbol from kTranslations using the
/// active locale tracked via [setLocale]. This means ALL call sites
/// (FormatUtils.currency(x)) are automatically bilingual — no context needed.
///
/// The [LocaleCubit] calls [FormatUtils.setLocale()] on init and on every
/// locale switch, keeping the symbol in sync.
///
/// Usage:
///   FormatUtils.currency(500000)         → "500k ل.س" (ar) / "500k SYP" (en)
///   FormatUtils.currencyL10n(ctx, 5000)  → same, but derives locale from ctx
/// ═══════════════════════════════════════════════════════════════════════════
class FormatUtils {
  FormatUtils._();

  /// The currency symbol key in translations.dart
  static const String _currencySymbolKey = 'currency_syp';

  /// The resolved currency symbol — cached to avoid repeated map lookups.
  static String _symbol = 'ل.س';

  /// Called by [LocaleCubit] on init and on every locale switch.
  /// Resolves the currency symbol from kTranslations for the new locale.
  static void setLocale(String localeCode) {
    final entry = kTranslations[_currencySymbolKey];
    _symbol = entry?[localeCode] ?? entry?['ar'] ?? 'ل.س';
  }

  /// Format a monetary amount with abbreviations (locale-aware).
  ///
  /// Uses the current locale's currency symbol (auto-synced via [setLocale]).
  /// - >= 1M → "1.0M SYP"
  /// - >= 1k → "10k SYP"
  /// - < 1k → "500 SYP"
  static String currency(num amount) {
    return _formatWithSymbol(amount, _symbol);
  }

  /// i18n-aware currency formatter that uses BuildContext to resolve locale.
  /// Prefer [currency()] which auto-resolves via the locale singleton.
  /// This method is provided for edge cases where context-derived locale
  /// may differ from the global locale (e.g., in-flight locale switch).
  static String currencyL10n(BuildContext context, num amount) {
    final symbol = context.tr(_currencySymbolKey);
    return _formatWithSymbol(amount, symbol);
  }

  /// Full-precision currency formatter with thousand separators.
  /// No abbreviations — shows the exact amount (locale-aware).
  ///
  /// - 1234567 → "1,234,567 ل.س" (ar) / "1,234,567 SYP" (en)
  static String currencyFull(num amountCents) {
    final amount = amountCents is int ? amountCents : amountCents.toInt();
    final formatted = amount.toStringAsFixed(0).replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (Match m) => '${m[1]},',
    );
    return '$formatted $_symbol';
  }

  /// Full-precision i18n-aware currency formatter (context-based).
  static String currencyFullL10n(BuildContext context, num amountCents) {
    final amount = amountCents is int ? amountCents : amountCents.toInt();
    final symbol = context.tr(_currencySymbolKey);
    final formatted = amount.toStringAsFixed(0).replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (Match m) => '${m[1]},',
    );
    return '$formatted $symbol';
  }

  /// Format an ISO date string to "YYYY/MM/DD".
  static String date(String dateStr) {
    try {
      final dt = DateTime.parse(dateStr);
      return '${dt.year}/${dt.month.toString().padLeft(2, '0')}/${dt.day.toString().padLeft(2, '0')}';
    } catch (e) {
      debugPrint('[Nammerha] utils/format_utils: $e');
      return dateStr;
    }
  }

  // ─── Internal ────────────────────────────────────────────────────────
  static String _formatWithSymbol(num amount, String symbol) {
    if (amount >= 1000000) {
      return '${(amount / 1000000).toStringAsFixed(1)}M $symbol';
    } else if (amount >= 1000) {
      return '${(amount / 1000).toStringAsFixed(0)}k $symbol';
    }
    return '${amount.toStringAsFixed(0)} $symbol';
  }
}
