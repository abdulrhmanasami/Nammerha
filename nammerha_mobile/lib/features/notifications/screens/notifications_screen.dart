import '../../../core/i18n/t.dart';
import '../../../core/widgets/error_state.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/utils/date_utils.dart';
import '../../../core/utils/animation_budget.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../core/theme/semantic_colors.dart';
import '../bloc/notifications_bloc.dart';
import '../bloc/notifications_event.dart';
import '../bloc/notifications_state.dart';
import '../models/notification_model.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';
import 'package:nammerha_mobile/core/utils/notification_navigator.dart';

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
            return NammerhaErrorState(
              message: state.message,
              onRetry: () => context.read<NotificationsBloc>().add(LoadNotificationsRequested()),
            );
          }

          // MED-MOB-003: Typed list — no more raw Map access
          List<NotificationModel> notifications = [];
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

                // MED-MOB-003: Typed field access — no more n['field'] raw access
                final n = notifications[index];

                // MED-MOB-003: Exhaustive icon mapping via NotificationIconCategory enum
                final IconData icon;
                final Color iconColor;
                switch (n.type.iconCategory) {
                  case NotificationIconCategory.financial:
                    icon = PhosphorIconsRegular.wallet;
                    iconColor = colors.success;
                  case NotificationIconCategory.proof:
                    icon = PhosphorIconsRegular.camera;
                    iconColor = colors.primaryBrand;
                  case NotificationIconCategory.bid:
                    icon = PhosphorIconsRegular.gavel;
                    iconColor = colors.warning;
                  case NotificationIconCategory.delivery:
                    icon = PhosphorIconsRegular.truck;
                    iconColor = colors.info;
                  case NotificationIconCategory.general:
                    icon = PhosphorIconsRegular.bell;
                    iconColor = colors.primaryBrand;
                }

                // AUD-020: Semantics + AUD-022: Conditional animation
                // MED-MOB-003: NotificationNavigator still expects Map — use toMap()
                final rawCard = GestureDetector(
                  onTap: () {
                    HapticFeedback.lightImpact();
                    NotificationNavigator.handleTap(context, n.toMap());
                  },
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: n.isRead ? colors.surfaceElevated : colors.primaryBrandLight,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: n.isRead ? colors.strokeSubtle : colors.primaryBrand.withAlpha(30)),
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
                                n.title,
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: n.isRead ? FontWeight.w500 : FontWeight.w700,
                                  color: colors.textPrimary,
                                ),
                              ),
                              if (n.message.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(
                                  n.message,
                                  style: TextStyle(fontSize: 12, color: colors.textSecondary, height: 1.4),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                              if (n.createdAt.isNotEmpty) ...[
                                const SizedBox(height: 6),
                                Text(
                                  NammerhaDateUtils.relativeTimeFromString(context, n.createdAt),
                                  style: TextStyle(fontSize: 10, color: colors.textSecondary),
                                ),
                              ],
                            ],
                          ),
                        ),
                        if (!n.isRead)
                          Container(
                            width: 8, height: 8,
                            margin: const EdgeInsets.only(top: 4),
                            decoration: BoxDecoration(color: colors.primaryBrand, shape: BoxShape.circle),
                          ),
                        if (NotificationNavigator.isNavigable(n.toMap()))
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
                );
                final card = Semantics(
                  label: '${n.title} — ${n.type.name} ${context.tr("notification")}',
                  button: true,
                  child: rawCard,
                );
                return card.nmAnimate(context, delay: (index * 60).ms).fadeIn().slideX(begin: 0.03);
              },
            ),
          );
        },
      ),
    );
  }

}
