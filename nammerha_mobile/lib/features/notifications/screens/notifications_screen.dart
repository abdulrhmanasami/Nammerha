import '../../../core/i18n/t.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../core/theme/semantic_colors.dart';
import '../bloc/notifications_bloc.dart';
import '../bloc/notifications_event.dart';
import '../bloc/notifications_state.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<NotificationsBloc>().add(LoadNotificationsRequested());
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  /// Wave 4: Infinite scroll trigger — 80% threshold.
  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent * 0.8) {
      context.read<NotificationsBloc>().add(const LoadMoreNotificationsEvent());
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
              if (state is NotificationsLoaded && state.notifications.isNotEmpty) {
                return TextButton(
                  onPressed: () {
                    context.read<NotificationsBloc>().add(MarkAllAsReadRequested());
                  },
                  child: Text(context.tr('notifications_mark_all_read'), style: TextStyle(color: colors.primaryBrand, fontSize: 13)),
                );
              }
              return const SizedBox.shrink();
            },
          ),
        ],
      ),
      body: BlocBuilder<NotificationsBloc, NotificationsState>(
        builder: (context, state) {
          if (state is NotificationsInitial || (state is NotificationsLoading && state.oldNotifications == null)) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  NammerhaShimmerLoader(colors: colors, isList: false),
                  const SizedBox(height: 16),
                  Text(context.tr('notifications_loading'), style: TextStyle(color: colors.textSecondary)),
                ],
              ),
            );
          }

          if (state is NotificationsError) {
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

          List<Map<String, dynamic>> notifications = [];
          if (state is NotificationsLoaded) {
            notifications = state.notifications;
          } else if (state is NotificationsLoading) {
            notifications = state.oldNotifications ?? [];
          }

          if (notifications.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(PhosphorIconsRegular.bellSlash, size: 64, color: colors.textSecondary),
                  const SizedBox(height: 16),
                  Text(context.tr('notifications_empty'), style: TextStyle(color: colors.textSecondary, fontSize: 16)),
                ],
              ),
            );
          }

          final isLoadingMore = state is NotificationsLoaded && state.isLoadingMore;

          return RefreshIndicator(
            onRefresh: () async {
              context.read<NotificationsBloc>().add(LoadNotificationsRequested());
            },
            color: colors.primaryBrand,
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: notifications.length + (isLoadingMore ? 1 : 0),
              controller: _scrollController,
              itemBuilder: (context, index) {
                // Loading footer for pagination
                if (index >= notifications.length) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Center(
                      child: Text(
                        context.tr('loading_more'),
                        style: TextStyle(color: colors.textSecondary, fontSize: 13),
                      ),
                    ),
                  );
                }
                final n = notifications[index];
                final isRead = n['is_read'] ?? n['isRead'] ?? false;
                final title = n['title'] ?? '';
                final message = n['message'] ?? n['body'] ?? '';
                final type = n['type'] ?? '';
                final createdAt = n['created_at'] ?? n['createdAt'] ?? '';
                final notifId = (n['notification_id'] ?? n['id'] ?? '').toString();

                IconData icon;
                Color iconColor;
                switch (type.toString().toLowerCase()) {
                  case 'funding':
                  case 'donation': // Legacy backend alias
                  case 'escrow':
                    icon = PhosphorIconsRegular.heart;
                    iconColor = colors.success;
                    break;
                  case 'proof':
                  case 'spatial_proof':
                    icon = PhosphorIconsRegular.camera;
                    iconColor = colors.primaryBrand;
                    break;
                  case 'bid':
                  case 'matchmaking':
                    icon = PhosphorIconsRegular.gavel;
                    iconColor = colors.warning;
                    break;
                  case 'order':
                  case 'delivery':
                    icon = PhosphorIconsRegular.truck;
                    iconColor = colors.info;
                    break;
                  default:
                    icon = PhosphorIconsRegular.bell;
                    iconColor = colors.primaryBrand;
                }

                return GestureDetector(
                  onTap: () {
                    HapticFeedback.lightImpact();
                    if (!isRead) {
                      context.read<NotificationsBloc>().add(MarkAsReadRequested(notifId));
                    }
                  },
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: isRead ? colors.surfaceElevated : colors.primaryBrandLight,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: isRead ? colors.strokeSubtle : colors.primaryBrand.withAlpha(30)),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 42, height: 42,
                          decoration: BoxDecoration(
                            color: iconColor.withAlpha(15),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(icon, color: iconColor, size: 20),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                title.toString(),
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: isRead ? FontWeight.w500 : FontWeight.w700,
                                  color: colors.textPrimary,
                                ),
                              ),
                              if (message.toString().isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(
                                  message.toString(),
                                  style: TextStyle(fontSize: 12, color: colors.textSecondary, height: 1.4),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                              if (createdAt.toString().isNotEmpty) ...[
                                const SizedBox(height: 6),
                                Text(
                                  _formatTime(createdAt.toString()),
                                  style: TextStyle(fontSize: 10, color: colors.textSecondary),
                                ),
                              ],
                            ],
                          ),
                        ),
                        if (!isRead)
                          Container(
                            width: 8, height: 8,
                            margin: const EdgeInsets.only(top: 4),
                            decoration: BoxDecoration(color: colors.primaryBrand, shape: BoxShape.circle),
                          ),
                      ],
                    ),
                  ),
                ).animate(delay: (index * 60).ms).fadeIn().slideX(begin: 0.03);
              },
            ),
          );
        },
      ),
    );
  }

  String _formatTime(String isoString) {
    try {
      final dt = DateTime.parse(isoString);
      final diff = DateTime.now().difference(dt);
      if (diff.inMinutes < 60) return context.tr('time_ago_minutes').replaceAll(r'$1', '${diff.inMinutes}');
      if (diff.inHours < 24) return context.tr('time_ago_hours').replaceAll(r'$1', '${diff.inHours}');
      if (diff.inDays < 7) return context.tr('time_ago_days').replaceAll(r'$1', '${diff.inDays}');
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (_) {
      return '';
    }
  }
}
