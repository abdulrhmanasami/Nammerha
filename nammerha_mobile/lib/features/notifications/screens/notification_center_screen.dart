import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../bloc/notifications_bloc.dart';
import '../bloc/notifications_event.dart';
import '../bloc/notifications_state.dart';
import '../../../core/i18n/t.dart';

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
      case 'bid_accepted': return Icons.check_circle_rounded;
      case 'bid_received': return Icons.gavel_rounded;
      case 'payment_received': return Icons.payments_rounded;
      case 'escrow_released': return Icons.lock_open_rounded;
      case 'project_update': return Icons.business_rounded;
      case 'proof_verified': return Icons.verified_rounded;
      case 'assignment': return Icons.assignment_rounded;
      case 'request': return Icons.handshake_rounded;
      default: return Icons.notifications_rounded;
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
        title: const Text('الإشعارات'),
        actions: [
          BlocBuilder<NotificationsBloc, NotificationsState>(
            builder: (context, state) {
              if (state is NotificationsLoaded) {
                 final unreadCount = state.notifications.where((n) => n['is_read'] != true && n['isRead'] != true).length;
                 if (unreadCount > 0) {
                  return TextButton(
                    onPressed: () => context.read<NotificationsBloc>().add(MarkAllAsReadRequested()),
                    child: Text('قراءة الكل', style: TextStyle(fontSize: 13, color: colors.primaryBrand, fontWeight: FontWeight.w600)),
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
            return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
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
                    Icon(Icons.cloud_off_rounded, size: 64, color: colors.textSecondary),
                    const SizedBox(height: 16),
                    Text(state.message, style: TextStyle(color: colors.error), textAlign: TextAlign.center),
                    const SizedBox(height: 20),
                    ElevatedButton.icon(
                      onPressed: () => context.read<NotificationsBloc>().add(LoadNotificationsRequested()),
                      icon: const Icon(Icons.refresh_rounded),
                      label: const Text('إعادة المحاولة'),
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
    final notifId = (n['notification_id'] ?? n['id'] ?? '').toString();

    return GestureDetector(
      onTap: () {
        if (!isRead) {
          context.read<NotificationsBloc>().add(MarkAsReadRequested(notifId));
        }
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
          Icon(Icons.notifications_off_rounded, size: 64, color: colors.textSubtle),
          const SizedBox(height: 16),
          Text('لا توجد إشعارات', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
          const SizedBox(height: 6),
          Text('ستظهر الإشعارات الجديدة هنا', style: TextStyle(fontSize: 13, color: colors.textSecondary)),
        ],
      ),
    );
  }

  String _relativeTime(String dateStr) {
    try {
      final dt = DateTime.parse(dateStr);
      final diff = DateTime.now().difference(dt);
      if (diff.inMinutes < 1) return context.tr('str_3d57faea');
      if (diff.inMinutes < 60) return 'منذ ${diff.inMinutes} دقيقة';
      if (diff.inHours < 24) return 'منذ ${diff.inHours} ساعة';
      if (diff.inDays < 7) return 'منذ ${diff.inDays} يوم';
      return '${dt.year}/${dt.month.toString().padLeft(2, '0')}/${dt.day.toString().padLeft(2, '0')}';
    } catch (_) {
      return dateStr;
    }
  }
}
