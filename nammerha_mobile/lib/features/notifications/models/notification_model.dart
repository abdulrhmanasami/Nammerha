import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// MED-MOB-003: Typed Notification Model
// ═══════════════════════════════════════════════════════════════════════════════
// Replaces raw Map<String, dynamic> with a proper immutable, type-safe model.
// Handles both snake_case (API response) and camelCase (FCM push payload) keys.
//
// Architecture:
//   - NotificationType enum → exhaustive switch in UI (no default: needed)
//   - fromJson factory → null-safe field extraction with snake/camel fallback
//   - toMap() → backward compatibility for NotificationNavigator + FCM paths
//   - Equatable → proper BLoC state comparison (prevents duplicate rebuilds)
// ═══════════════════════════════════════════════════════════════════════════════

/// All known notification types from the backend + FCM push payloads.
///
/// Backend (types/index.ts): project_funding_milestone, proof_submitted, etc.
/// FCM aliases: funding, escrow, proof, bid, order, delivery, etc.
enum NotificationType {
  // ── Backend canonical types ──
  paymentReceived,
  proofSubmitted,
  fundsReleased,
  deliveryConfirmed,
  engineerAssigned,
  poGenerated,
  projectPublished,
  kycApproved,
  kycRejected,
  discrepancyFlagged,
  refundApproved,
  refundRejected,

  // ── FCM mobile aliases ──
  bidAccepted,
  bidReceived,
  escrowReleased,
  projectUpdate,
  proofVerified,
  assignment,
  request,

  // ── Grouped categories (used for icon mapping) ──
  funding,
  escrow,
  proof,
  spatialProof,
  bid,
  matchmaking,
  order,
  delivery,

  // ── Catch-all ──
  general;

  /// Parses a raw backend/FCM type string into the enum.
  static NotificationType fromString(String? raw) {
    if (raw == null || raw.isEmpty) return general;
    switch (raw.toLowerCase()) {
      case 'project_funding_milestone':
      case 'payment': // Legacy alias
        return paymentReceived;
      case 'proof_submitted':
        return proofSubmitted;
      case 'funds_released':
        return fundsReleased;
      case 'delivery_confirmed':
        return deliveryConfirmed;
      case 'engineer_assigned':
        return engineerAssigned;
      case 'po_generated':
        return poGenerated;
      case 'project_published':
        return projectPublished;
      case 'kyc_approved':
      case 'kyc_verified':
        return kycApproved;
      case 'kyc_rejected':
        return kycRejected;
      case 'discrepancy_flagged':
        return discrepancyFlagged;
      case 'refund_approved':
        return refundApproved;
      case 'refund_rejected':
        return refundRejected;
      case 'bid_accepted':
        return bidAccepted;
      case 'bid_received':
        return bidReceived;
      case 'payment_received':
        return paymentReceived;
      case 'escrow_released':
        return escrowReleased;
      case 'project_update':
        return projectUpdate;
      case 'proof_verified':
        return proofVerified;
      case 'assignment':
        return assignment;
      case 'request':
        return request;
      case 'funding':
        return funding;
      case 'escrow':
        return escrow;
      case 'proof':
      case 'spatial_proof':
        return spatialProof;
      case 'bid':
        return bid;
      case 'matchmaking':
        return matchmaking;
      case 'order':
        return order;
      case 'delivery':
        return delivery;
      default:
        return general;
    }
  }

  /// The icon category group for UI rendering.
  /// Maps the fine-grained types into 4 visual categories.
  NotificationIconCategory get iconCategory {
    switch (this) {
      case paymentReceived:
      case funding:
      case escrow:
      case fundsReleased:
      case escrowReleased:
        return NotificationIconCategory.financial;
      case proofSubmitted:
      case proofVerified:
      case proof:
      case spatialProof:
        return NotificationIconCategory.proof;
      case bid:
      case bidAccepted:
      case bidReceived:
      case matchmaking:
        return NotificationIconCategory.bid;
      case order:
      case delivery:
      case deliveryConfirmed:
      case poGenerated:
        return NotificationIconCategory.delivery;
      default:
        return NotificationIconCategory.general;
    }
  }
}

/// Visual icon categories for notification rendering.
enum NotificationIconCategory {
  financial,  // wallet icon, green
  proof,      // camera icon, blue
  bid,        // gavel icon, yellow
  delivery,   // truck icon, info blue
  general,    // bell icon, primary blue
}

/// Typed notification model — replaces `Map<String, dynamic>`.
///
/// Immutable, Equatable, null-safe. Handles both API and FCM field naming.
class NotificationModel extends Equatable {
  final String id;
  final String title;
  final String message;
  final NotificationType type;
  final bool isRead;
  final String createdAt;
  final Map<String, dynamic> data; // Opaque payload for navigation routing

  const NotificationModel({
    required this.id,
    required this.title,
    required this.message,
    required this.type,
    required this.isRead,
    required this.createdAt,
    this.data = const {},
  });

  /// Parses from API response or FCM push payload.
  /// Handles both snake_case and camelCase variants.
  factory NotificationModel.fromJson(Map<String, dynamic> json) {
    // ID: notification_id → id (fallback)
    final id = (json['notification_id'] ?? json['id'] ?? '').toString();

    // Type: string → enum
    final typeRaw = (json['type'] ?? '').toString();

    // Message: message → body (FCM alias)
    final message = (json['message'] ?? json['body'] ?? '').toString();

    // Read status: is_read → isRead (camelCase alias)
    final isRead = json['is_read'] == true || json['isRead'] == true;

    // Created at: created_at → createdAt
    final createdAt = (json['created_at'] ?? json['createdAt'] ?? '').toString();

    // Data payload: nested Map for navigation
    Map<String, dynamic> data;
    final rawData = json['data'];
    if (rawData is Map<String, dynamic>) {
      data = rawData;
    } else if (rawData is Map) {
      data = Map<String, dynamic>.from(rawData);
    } else {
      data = const {};
    }

    return NotificationModel(
      id: id,
      title: (json['title'] ?? '').toString(),
      message: message,
      type: NotificationType.fromString(typeRaw),
      isRead: isRead,
      createdAt: createdAt,
      data: data,
    );
  }

  /// Returns a copy with isRead = true (for mark-as-read operations).
  NotificationModel markAsRead() {
    return NotificationModel(
      id: id,
      title: title,
      message: message,
      type: type,
      isRead: true,
      createdAt: createdAt,
      data: data,
    );
  }

  /// Converts back to Map for backward compatibility with
  /// NotificationNavigator.handleTap() and FCM injection paths.
  Map<String, dynamic> toMap() => {
    'notification_id': id,
    'id': id,
    'title': title,
    'message': message,
    'body': message,
    'type': type.name,
    'is_read': isRead,
    'isRead': isRead,
    'created_at': createdAt,
    'createdAt': createdAt,
    'data': data,
  };

  @override
  List<Object?> get props => [id, title, message, type, isRead, createdAt, data];
}
