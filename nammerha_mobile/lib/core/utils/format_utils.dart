import 'package:flutter/widgets.dart';
import '../i18n/t.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Shared Formatting Utilities — Platinum Standard
/// ═══════════════════════════════════════════════════════════════════════════
/// Single source of truth for currency and date formatting across the entire
/// app. Eliminates the 8+ duplicate formatCurrency() methods scattered across
/// feature screens.
///
/// Usage:
///   FormatUtils.currency(500000)         → "500k ل.س" (static, no context)
///   FormatUtils.currencyL10n(ctx, 5000)  → "5k SYP" or "5k ل.س" (i18n-aware)
/// ═══════════════════════════════════════════════════════════════════════════
class FormatUtils {
  FormatUtils._();

  /// The currency symbol key in translations.dart
  static const String _currencySymbolKey = 'currency_syp';

  /// Format a monetary amount with abbreviations (static — no context needed).
  /// Uses the Arabic symbol "ل.س" as the default.
  ///
  /// - >= 1M → "1.0M ل.س"
  /// - >= 1k → "10k ل.س"
  /// - < 1k → "500 ل.س"
  static String currency(num amount) {
    return _formatWithSymbol(amount, 'ل.س');
  }

  /// i18n-aware currency formatter that uses the current locale's symbol.
  /// Pass a BuildContext to resolve the translated currency symbol.
  ///
  /// - Arabic: "500k ل.س"
  /// - English: "500k SYP"
  static String currencyL10n(BuildContext context, num amount) {
    final symbol = context.tr(_currencySymbolKey);
    return _formatWithSymbol(amount, symbol);
  }

  /// Full-precision currency formatter with thousand separators.
  /// No abbreviations — shows the exact amount.
  ///
  /// - 1234567 → "1,234,567 ل.س"
  static String currencyFull(num amountCents) {
    final amount = amountCents is int ? amountCents : amountCents.toInt();
    final formatted = amount.toStringAsFixed(0).replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (Match m) => '${m[1]},',
    );
    return '$formatted ل.س';
  }

  /// Full-precision i18n-aware currency formatter.
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
    } catch (_) {
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
