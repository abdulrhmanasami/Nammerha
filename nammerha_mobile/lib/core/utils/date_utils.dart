import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../i18n/t.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// AUD-023 FIX: Centralized Date Formatting Utilities
/// ═══════════════════════════════════════════════════════════════════════════
/// Previously, 3+ screens each had their own `_formatTimeAgo()` or
/// `_relativeTime()` or `_formatTime()` methods with identical logic.
///
/// This utility provides a single, locale-aware, i18n-driven implementation
/// that all screens should use. Supports both relative time ("5 minutes ago")
/// and absolute date formatting ("15 May 2026, 14:30").
///
/// Usage:
///   NammerhaDateUtils.relativeTime(context, someDateTime)
///   NammerhaDateUtils.formatDate(context, someDateTime)
/// ═══════════════════════════════════════════════════════════════════════════
class NammerhaDateUtils {
  NammerhaDateUtils._();

  /// Returns a human-readable relative time string.
  ///
  /// Examples:
  ///   - < 1 min:    "الآن" / "Just now"
  ///   - < 60 min:   "منذ 5 دقائق" / "5 minutes ago"
  ///   - < 24 hours: "منذ 3 ساعات" / "3 hours ago"
  ///   - < 7 days:   "منذ 2 أيام" / "2 days ago"
  ///   - >= 7 days:  "2026/05/15" (locale-formatted)
  static String relativeTime(BuildContext context, DateTime dateTime) {
    final now = DateTime.now();
    final diff = now.difference(dateTime);

    if (diff.inMinutes < 1) return context.tr('time_ago_just_now');
    if (diff.inMinutes < 60) {
      return context.tr('time_ago_minutes').replaceAll(r'$1', '${diff.inMinutes}');
    }
    if (diff.inHours < 24) {
      return context.tr('time_ago_hours').replaceAll(r'$1', '${diff.inHours}');
    }
    if (diff.inDays < 7) {
      return context.tr('time_ago_days').replaceAll(r'$1', '${diff.inDays}');
    }
    return DateFormat('yyyy/MM/dd', context.localeCode).format(dateTime);
  }

  /// Parses an ISO 8601 string and returns relative time.
  /// Returns empty string on parse failure (fail-safe, no crash).
  static String relativeTimeFromString(BuildContext context, String isoString) {
    try {
      final dt = DateTime.parse(isoString);
      return relativeTime(context, dt);
    } catch (_) {
      return '';
    }
  }

  /// Returns a formatted absolute date string.
  /// Format: "15 May 2026, 14:30"
  static String formatDate(BuildContext context, DateTime dateTime) {
    return DateFormat('d MMM yyyy, HH:mm', context.localeCode).format(dateTime);
  }
}
