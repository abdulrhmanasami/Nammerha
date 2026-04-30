import 'package:flutter/foundation.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Donation Model — Type-safe data class for donation entries
/// ═══════════════════════════════════════════════════════════════════════════
/// P0-003 REMEDIATION: Created missing data model for the donations feature.
/// Maps 1:1 to backend GET /api/donor/donations response schema.
/// ═══════════════════════════════════════════════════════════════════════════

@immutable
class DonationEntry {
  final String escrowId;
  final String projectTitle;
  final String materialName;
  final int amountLocked;
  final String paymentStatus;
  final String? lockedAt;
  final String? releasedAt;
  final String? projectId;
  final String? itemId;

  const DonationEntry({
    required this.escrowId,
    required this.projectTitle,
    required this.materialName,
    required this.amountLocked,
    required this.paymentStatus,
    this.lockedAt,
    this.releasedAt,
    this.projectId,
    this.itemId,
  });

  factory DonationEntry.fromJson(Map<String, dynamic> json) {
    return DonationEntry(
      escrowId: (json['escrow_id'] ?? json['escrowId'] ?? '').toString(),
      projectTitle:
          (json['project_title'] ?? json['projectTitle'] ?? '').toString(),
      materialName:
          (json['material_name'] ?? json['materialName'] ?? '').toString(),
      amountLocked:
          (json['amount_locked'] ?? json['amountLocked'] ?? 0) as int,
      paymentStatus:
          (json['payment_status'] ?? json['paymentStatus'] ?? 'PENDING')
              .toString(),
      lockedAt: json['locked_at']?.toString() ?? json['lockedAt']?.toString(),
      releasedAt:
          json['released_at']?.toString() ?? json['releasedAt']?.toString(),
      projectId:
          json['project_id']?.toString() ?? json['projectId']?.toString(),
      itemId: json['item_id']?.toString() ?? json['itemId']?.toString(),
    );
  }

  /// Isolate-safe batch parsing for large donation lists.
  static Future<List<DonationEntry>> parseList(
      List<Map<String, dynamic>> jsonList) async {
    if (jsonList.length > 50) {
      return compute(_parseListIsolate, jsonList);
    }
    return jsonList.map((j) => DonationEntry.fromJson(j)).toList();
  }

  static List<DonationEntry> _parseListIsolate(
      List<Map<String, dynamic>> jsonList) {
    return jsonList.map((j) => DonationEntry.fromJson(j)).toList();
  }

  bool get isReleased => paymentStatus == 'ESCROW_RELEASED';
  bool get isLocked => paymentStatus == 'SUCCESS';
  bool get isRefunded => paymentStatus == 'REFUNDED';
  bool get isPending =>
      !isReleased && !isLocked && !isRefunded;
}

/// Summary of a user's escrow balances.
@immutable
class EscrowSummary {
  final int totalLocked;
  final int totalReleased;
  final int pendingRelease;

  const EscrowSummary({
    required this.totalLocked,
    required this.totalReleased,
    required this.pendingRelease,
  });

  factory EscrowSummary.fromJson(Map<String, dynamic> json) {
    return EscrowSummary(
      totalLocked: (json['total_locked'] ?? json['totalLocked'] ?? 0) as int,
      totalReleased:
          (json['total_released'] ?? json['totalReleased'] ?? 0) as int,
      pendingRelease:
          (json['pending_release'] ?? json['pendingRelease'] ?? 0) as int,
    );
  }

  static const empty = EscrowSummary(
    totalLocked: 0,
    totalReleased: 0,
    pendingRelease: 0,
  );
}
