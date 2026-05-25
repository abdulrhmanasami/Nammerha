import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../features/bids/screens/bids_screen.dart';
import '../../features/notifications/bloc/notifications_bloc.dart';
import '../../features/notifications/bloc/notifications_event.dart';
import '../../features/payments/screens/contract_details_screen.dart';
import '../../features/profile/screens/profile_screen.dart';
import '../../features/project/screens/project_details_screen.dart';
import 'debounced_navigator.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// P0-003: Notification Navigation Router
/// ═══════════════════════════════════════════════════════════════════════════
/// Resolves the "Notification Dead-End" UX violation by routing each
/// notification type to its corresponding screen. The `data` JSONB payload
/// from the backend carries the required entity IDs (project_id, contract_id).
///
/// Architecture:
///   1. Mark notification as read (fire-and-forget via BLoC)
///   2. Extract navigation target from `type` + `data`
///   3. Navigator.push to the resolved screen
///   4. Graceful fallback: if required IDs are missing, mark as read only
///
/// Backend NotificationType enum values (from types/index.ts):
///   project_funding_milestone, proof_submitted, funds_released, delivery_confirmed,
///   engineer_assigned, po_generated, project_published, kyc_approved,
///   kyc_rejected, discrepancy_flagged, refund_approved, refund_rejected
///
/// Mobile-extended type aliases (from FCM push payloads):
///   bid_accepted, bid_received, payment_received, escrow_released,
///   project_update, proof_verified, assignment, request, funding,
///   escrow, proof, spatial_proof, bid, matchmaking, order, delivery
/// ═══════════════════════════════════════════════════════════════════════════

class NotificationNavigator {
  NotificationNavigator._();

  /// Handles a notification tap: marks as read, then navigates if possible.
  ///
  /// Returns `true` if navigation occurred, `false` if only marked as read.
  static bool handleTap(BuildContext context, Map<String, dynamic> notification) {
    final notifId = (notification['notification_id'] ?? notification['id'] ?? '').toString();
    final isRead = notification['is_read'] == true || notification['isRead'] == true;

    // 1. Mark as read (fire-and-forget)
    if (!isRead && notifId.isNotEmpty) {
      context.read<NotificationsBloc>().add(MarkAsReadRequested(notifId));
    }

    // 2. Extract type + data
    final type = (notification['type'] ?? '').toString().toLowerCase();
    final rawData = notification['data'];
    final Map<String, dynamic> data;
    if (rawData is Map<String, dynamic>) {
      data = rawData;
    } else if (rawData is Map) {
      data = Map<String, dynamic>.from(rawData);
    } else {
      data = <String, dynamic>{};
    }

    // 3. Resolve target screen
    final screen = _resolveScreen(type, data, notification);
    if (screen == null) return false;

    // 4. Navigate with haptic feedback
    HapticFeedback.lightImpact();
    DebouncedNavigator.push(context, MaterialPageRoute(builder: (_) => screen));
    return true;
  }

  /// Returns `true` if this notification type has a navigation target.
  /// Used to show a chevron/arrow visual cue on navigable cards.
  static bool isNavigable(Map<String, dynamic> notification) {
    final type = (notification['type'] ?? '').toString().toLowerCase();
    final rawData = notification['data'];
    final Map<String, dynamic> data;
    if (rawData is Map<String, dynamic>) {
      data = rawData;
    } else if (rawData is Map) {
      data = Map<String, dynamic>.from(rawData);
    } else {
      data = <String, dynamic>{};
    }
    return _resolveScreen(type, data, notification) != null;
  }

  /// Core routing logic: type + data → Widget?
  static Widget? _resolveScreen(
    String type,
    Map<String, dynamic> data,
    Map<String, dynamic> notification,
  ) {
    // ── Project-centric types ──
    // These all need a project_id to navigate
    if (_isProjectType(type)) {
      final projectId = _extractId(data, 'project_id', notification);
      if (projectId == null) return null;
      final title = data['project_title']?.toString() ?? notification['title']?.toString();
      return ProjectDetailsScreen(
        projectId: projectId, 
        projectTitle: title,
        preHydratedData: data,
      );
    }

    // ── Contract/Payment-centric types ──
    if (_isContractType(type)) {
      // Try contract_id first, fall back to project navigation
      final contractId = _extractId(data, 'contract_id', notification);
      if (contractId != null) {
        return ContractDetailsScreen(contractId: contractId);
      }
      // Fallback: if there's a project_id, go to project
      final projectId = _extractId(data, 'project_id', notification);
      if (projectId != null) {
        return ProjectDetailsScreen(
          projectId: projectId,
          preHydratedData: data,
        );
      }
      return null;
    }

    // ── Bid/Matchmaking types ──
    if (_isBidType(type)) {
      // UX PLATINUM FIX: Pre-hydrated Notification Routing (WSOD Prevention)
      // When a contractor receives a 'bid_accepted' notification, we extract
      // the project data from the payload and inject it immediately into the State.
      if (type == 'bid_accepted') {
        final projectId = _extractId(data, 'project_id', notification);
        if (projectId != null) {
          final title = data['project_title']?.toString() ?? notification['title']?.toString();
          return ProjectDetailsScreen(
            projectId: projectId,
            projectTitle: title,
            preHydratedData: data, // Instant hydration payload
          );
        }
      }
      return const BidsScreen();
    }

    // ── KYC types ──
    if (_isKycType(type)) {
      return const ProfileScreen();
    }

    // ── No navigation target (refund_approved, refund_rejected, generic) ──
    return null;
  }

  // ─── Type Classification ────────────────────────────────────────────────

  static bool _isProjectType(String type) {
    return const {
      // AUD-024 VERIFIED: 'project_funding_milestone' is a BACKEND CONTRACT KEY
      // preserved per payment Eradication KI. The backend still sends this
      // type in push payloads. DO NOT REMOVE without coordinated backend migration.
      'project_funding_milestone',
      'funding',
      'escrow',
      'proof_submitted',
      'proof',
      'spatial_proof',
      'proof_verified',
      'funds_released',
      'escrow_released',
      'engineer_assigned',
      'assignment',
      'po_generated',
      'project_published',
      'project_update',
      'discrepancy_flagged',
    }.contains(type);
  }

  static bool _isContractType(String type) {
    return const {
      'payment_received',
      'delivery_confirmed',
      'order',
      'delivery',
    }.contains(type);
  }

  static bool _isBidType(String type) {
    return const {
      'bid_accepted',
      'bid_received',
      'bid',
      'matchmaking',
    }.contains(type);
  }

  static bool _isKycType(String type) {
    return const {
      'kyc_approved',
      'kyc_rejected',
    }.contains(type);
  }

  // ─── ID Extraction ──────────────────────────────────────────────────────

  /// Extracts an entity ID from the `data` JSONB payload, with fallback to
  /// snake_case and camelCase variants in both `data` and the notification root.
  static String? _extractId(
    Map<String, dynamic> data,
    String snakeKey,
    Map<String, dynamic> notification,
  ) {
    // Convert snake_case → camelCase for fallback
    final camelKey = snakeKey.replaceAllMapped(
      RegExp(r'_([a-z])'),
      (m) => m.group(1)!.toUpperCase(),
    );

    // Priority: data[snake] → data[camel] → notification[snake] → notification[camel]
    final value = data[snakeKey] ?? data[camelKey] ?? notification[snakeKey] ?? notification[camelKey];
    final str = value?.toString();
    return (str != null && str.isNotEmpty && str != 'null') ? str : null;
  }
}
