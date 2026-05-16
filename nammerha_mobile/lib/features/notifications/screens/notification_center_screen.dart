import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../bloc/notifications_bloc.dart';
import '../bloc/notifications_event.dart';
import '../bloc/notifications_state.dart';
import '../../../core/i18n/t.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';
import 'package:nammerha_mobile/core/utils/notification_navigator.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Notification Center — Full notification history + mark read
/// ═══════════════════════════════════════════════════════════════════════════
/// Absolute Zero Architecture: Managed natively via NotificationsBloc.
/// ═══════════════════════════════════════════════════════════════════════════
class NotificationCenterScreen extends StatefulWidget {
  const NotificationCenterScreen({super.key});

  @override
  State<NotificationCenterScreen> createState() => _NotificationCenterScreenState();
}

class _NotificationCenterScreenState extends State<NotificationCenterScreen> {

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<NotificationsBloc>().add(LoadNotificationsRequested());
    });
  }

  IconData _iconForType(String type) {
    switch (type.toLowerCase()) {
      case 'bid_accepted': return PhosphorIconsRegular.checkCircle;
      case 'bid_received': return PhosphorIconsRegular.gavel;
      case 'payment_received': return PhosphorIconsRegular.currencyCircleDollar;
      case 'escrow_released': return PhosphorIconsRegular.lockKeyOpen;
      case 'project_update': return PhosphorIconsRegular.buildings;
      case 'proof_verified': return PhosphorIconsRegular.sealCheck;
      case 'assignment': return PhosphorIconsRegular.clipboardText;
      case 'request': return PhosphorIconsRegular.chatDots;
      default: return PhosphorIconsRegular.bell;
    }
  }

  Color _colorForType(String type, SemanticColors colors) {
    switch (type.toLowerCase()) {
      case 'bid_accepted': return colors.success;
      case 'bid_received': return colors.primaryBrand;
      case 'payment_received': return colors.secondaryAccent;
      case 'escrow_released': return colors.success;
      case 'proof_verified': return colors.secondaryAccent;
      default: return colors.info;
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text(context.tr('notifications_title')),
        actions: [
          BlocBuilder<NotificationsBloc, NotificationsState>(
            builder: (context, state) {
              if (state is NotificationsLoaded) {
                 final unreadCount = state.notifications.where((n) => n['is_read'] != true && n['isRead'] != true).length;
                 if (unreadCount > 0) {
                  return TextButton(
                    onPressed: () => context.read<NotificationsBloc>().add(MarkAllAsReadRequested()),
                    child: Text(context.tr('notifications_mark_all_read'), style: TextStyle(fontSize: 13, color: colors.primaryBrand, fontWeight: FontWeight.w600)),
                  );
                 }
              }
              return const SizedBox.shrink();
            },
          )
        ],
      ),
      body: BlocBuilder<NotificationsBloc, NotificationsState>(
        builder: (context, state) {
          if (state is NotificationsInitial || (state is NotificationsLoading && state.oldNotifications == null)) {
            return NammerhaShimmerLoader(colors: colors);
          }

          List<Map<String, dynamic>> notifications = [];
          if (state is NotificationsLoaded) {
            notifications = state.notifications;
          } else if (state is NotificationsLoading) {
            notifications = state.oldNotifications ?? [];
          } else if (state is NotificationsError) {
             return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(PhosphorIconsRegular.cloudSlash, size: 64, color: colors.textSecondary),
                    const SizedBox(height: 16),
                    Text(state.message, style: TextStyle(color: colors.error), textAlign: TextAlign.center),
                    const SizedBox(height: 20),
                    ElevatedButton.icon(
                      onPressed: () => context.read<NotificationsBloc>().add(LoadNotificationsRequested()),
                      icon: Icon(PhosphorIconsRegular.arrowsClockwise),
                      label: Text(context.tr('retry')),
                      style: ElevatedButton.styleFrom(backgroundColor: colors.primaryBrand),
                    ),
                  ],
                ),
              ),
            );
          }

          if (notifications.isEmpty) {
            return _emptyState(colors);
          }

          return RefreshIndicator(
            onRefresh: () async {
              context.read<NotificationsBloc>().add(LoadNotificationsRequested());
            },
            color: colors.primaryBrand,
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: notifications.length,
              itemBuilder: (_, i) => _notificationCard(notifications[i], colors, i, context),
            ),
          );
        },
      )
    );
  }

  Widget _notificationCard(Map<String, dynamic> n, SemanticColors colors, int index, BuildContext context) {
    final isRead = n['is_read'] == true || n['isRead'] == true;
    final type = n['type']?.toString() ?? '';
    final iconColor = _colorForType(type, colors);

    return GestureDetector(
      onTap: () {
        // P0-003: Route to target screen (marks as read internally)
        NotificationNavigator.handleTap(context, n);
      },
      child: AnimatedContainer(
        duration: NammerhaAnimations.fast,
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isRead ? colors.surfaceElevated : iconColor.withAlpha(6),
          borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
          border: Border.all(color: isRead ? colors.strokeSubtle : iconColor.withAlpha(30)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Icon
            Container(
              width: 42, height: 42,
              decoration: BoxDecoration(
                color: iconColor.withAlpha(15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(_iconForType(type), size: 20, color: iconColor),
            ),
            const SizedBox(width: 12),
            // Content
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    n['title']?.toString() ?? '',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: isRead ? FontWeight.w500 : FontWeight.w700,
                      color: colors.textPrimary,
                    ),
                  ),
                  if (n['body'] != null || n['message'] != null) ...[
                    const SizedBox(height: 3),
                    Text(
                      n['body']?.toString() ?? n['message']?.toString() ?? '',
                      style: TextStyle(fontSize: 12, color: colors.textSecondary),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  const SizedBox(height: 6),
                  Text(
                    _relativeTime(n['created_at']?.toString() ?? n['createdAt']?.toString() ?? ''),
                    style: TextStyle(fontSize: 11, color: colors.textSubtle),
                  ),
                ],
              ),
            ),
            // Unread dot
            if (!isRead)
              Container(
                width: 8, height: 8,
                margin: const EdgeInsetsDirectional.only(start: 8, top: 4),
                decoration: BoxDecoration(
                  color: colors.primaryBrand,
                  shape: BoxShape.circle,
                ),
              ),
            // P0-003: Chevron indicator for navigable notifications
            if (NotificationNavigator.isNavigable(n))
              Padding(
                padding: const EdgeInsetsDirectional.only(start: 4),
                child: Icon(
                  PhosphorIconsRegular.caretRight,
                  size: 14,
                  color: colors.textSubtle,
                ),
              ),
          ],
        ),
      ),
    ).animate(delay: (index * 50).ms).fadeIn();
  }

  Widget _emptyState(SemanticColors colors) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(PhosphorIconsRegular.bellSlash, size: 64, color: colors.textSubtle),
          const SizedBox(height: 16),
          Text(context.tr('notifications_empty'), style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
          const SizedBox(height: 6),
          Text(context.tr('notifications_empty_hint'), style: TextStyle(fontSize: 13, color: colors.textSecondary)),
        ],
      ),
    );
  }

  String _relativeTime(String dateStr) {
    try {
      final dt = DateTime.parse(dateStr);
      final diff = DateTime.now().difference(dt);
      if (diff.inMinutes < 1) return context.tr('now');
      if (diff.inMinutes < 60) return context.tr('time_ago_minutes').replaceAll(r'$1', '${diff.inMinutes}');
      if (diff.inHours < 24) return context.tr('time_ago_hours').replaceAll(r'$1', '${diff.inHours}');
      if (diff.inDays < 7) return context.tr('time_ago_days').replaceAll(r'$1', '${diff.inDays}');
      return '${dt.year}/${dt.month.toString().padLeft(2, '0')}/${dt.day.toString().padLeft(2, '0')}';
    } catch (_) {
      return dateStr;
    }
  }
}
