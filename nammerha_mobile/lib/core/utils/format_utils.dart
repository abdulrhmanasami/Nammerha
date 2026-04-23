/// Shared formatting utilities for display purposes.
///
/// Currency formatting follows Syrian Lira (ل.س) conventions.
class FormatUtils {
  FormatUtils._();

  /// Format a monetary amount with abbreviations.
  ///
  /// - >= 1M → "1.0M ل.س"
  /// - >= 1k → "10k ل.س"
  /// - < 1k → "500 ل.س"
  static String currency(num amount) {
    if (amount >= 1000000) {
      return '${(amount / 1000000).toStringAsFixed(1)}M ل.س';
    } else if (amount >= 1000) {
      return '${(amount / 1000).toStringAsFixed(0)}k ل.س';
    }
    return '${amount.toStringAsFixed(0)} ل.س';
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
}
