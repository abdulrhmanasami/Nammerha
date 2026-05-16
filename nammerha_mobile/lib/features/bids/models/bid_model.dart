import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// BidModel — Immutable, Type-Safe Bid Entity (P1-002 Architectural Purity)
// ═══════════════════════════════════════════════════════════════════════════
// Replaces raw Map<String, dynamic> access throughout the Bids feature.
// Factory fromJson handles backend key variations (snake_case vs camelCase).
// ═══════════════════════════════════════════════════════════════════════════

class BidModel extends Equatable {
  final String id;
  final String projectTitle;
  final String status;
  final num proposedCost;
  final String methodology;
  final String? createdAt;

  const BidModel({
    required this.id,
    required this.projectTitle,
    required this.status,
    required this.proposedCost,
    required this.methodology,
    this.createdAt,
  });

  /// Factory constructor — handles backend key variations gracefully.
  /// Backend may return snake_case or camelCase depending on endpoint.
  factory BidModel.fromJson(Map<String, dynamic> json) {
    return BidModel(
      id: (json['id'] ?? json['bid_id'] ?? '').toString(),
      projectTitle: (json['project_title'] ?? json['projectTitle'] ?? '').toString(),
      status: (json['status'] ?? '').toString(),
      proposedCost: (json['proposed_cost'] ?? json['bidAmount'] ?? json['amount'] ?? 0) as num,
      methodology: (json['methodology'] ?? json['cover_letter'] ?? '').toString(),
      createdAt: json['created_at']?.toString() ?? json['createdAt']?.toString(),
    );
  }

  /// Normalized status for comparison (lowercase, English-canonical).
  String get normalizedStatus {
    final s = status.toLowerCase();
    // Map Arabic backend values to canonical English keys
    if (s == 'مقبول' || s == 'accepted' || s == 'approved') return 'accepted';
    if (s == 'مرفوض' || s == 'rejected') return 'rejected';
    return 'pending';
  }

  @override
  List<Object?> get props => [id, projectTitle, status, proposedCost, methodology, createdAt];
}
