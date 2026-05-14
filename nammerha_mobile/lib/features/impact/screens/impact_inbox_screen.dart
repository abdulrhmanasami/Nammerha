import '../../../core/i18n/t.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/semantic_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../bloc/impact_bloc.dart';
import '../bloc/impact_event.dart';
import '../bloc/impact_state.dart';
import '../data/impact_repository.dart';
import '../models/impact_message_model.dart';
import '../../../core/widgets/shimmer_loader.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

class ImpactInboxScreen extends StatelessWidget {
  const ImpactInboxScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => ImpactBloc(
        repository: ImpactRepository(),
      )..add(FetchImpactMessages(refresh: true)),
      child: const _ImpactInboxView(),
    );
  }
}

class _ImpactInboxView extends StatefulWidget {
  const _ImpactInboxView();

  @override
  State<_ImpactInboxView> createState() => _ImpactInboxViewState();
}

class _ImpactInboxViewState extends State<_ImpactInboxView> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_isBottom) {
      context.read<ImpactBloc>().add(FetchImpactMessages());
    }
  }

  bool get _isBottom {
    if (!_scrollController.hasClients) return false;
    final maxScroll = _scrollController.position.maxScrollExtent;
    final currentScroll = _scrollController.offset;
    return currentScroll >= (maxScroll - 200);
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<SemanticColors>()!;

    return Scaffold(
      backgroundColor: colors.backgroundSecondary,
      appBar: AppBar(
        title: Text(context.tr('impact_field')), // Impact
        actions: [
          BlocBuilder<ImpactBloc, ImpactState>(
            builder: (context, state) {
              if (state is ImpactLoaded && state.unreadCount > 0) {
                return IconButton(
                  icon: Icon(PhosphorIcons.checks()),
                  tooltip: 'تحديد الكل كمقروء',
                  onPressed: () {
                    context.read<ImpactBloc>().add(MarkAllMessagesAsRead());
                  },
                );
              }
              return const SizedBox.shrink();
            },
          ),
        ],
      ),
      body: BlocBuilder<ImpactBloc, ImpactState>(
        builder: (context, state) {
          if (state is ImpactInitial || (state is ImpactLoading && state.isFirstFetch)) {
            return NammerhaShimmerLoader(colors: colors);
          } else if (state is ImpactError) {
            return _buildErrorState(context, state.message, colors);
          } else if (state is ImpactLoaded || state is ImpactLoading) {
            final messages = (state is ImpactLoaded) 
                ? state.messages 
                : (state as ImpactLoading).oldMessages;
                
            if (messages.isEmpty) {
              return _buildEmptyState(colors);
            }

            return RefreshIndicator(
              onRefresh: () async {
                context.read<ImpactBloc>().add(FetchImpactMessages(refresh: true));
              },
              child: ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsets.symmetric(
                  vertical: NammerhaTheme.spaceMd,
                  horizontal: NammerhaTheme.spaceMd,
                ),
                itemCount: messages.length + (state is ImpactLoading ? 1 : 0),
                itemBuilder: (context, index) {
                  if (index >= messages.length) {
                    return Padding(
                      padding: const EdgeInsets.all(NammerhaTheme.spaceMd),
                      child: Center(child: NammerhaShimmerLoader(colors: colors)),
                    );
                  }
                  return _MessageCard(message: messages[index]);
                },
              ),
            );
          }
          return const SizedBox.shrink();
        },
      ),
    );
  }

  Widget _buildEmptyState(SemanticColors colors) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            PhosphorIcons.envelopeOpen(),
            size: 64,
            color: colors.textMuted,
          ),
          const SizedBox(height: NammerhaTheme.spaceMd),
          Text(
            'لا توجد رسائل أثر حالياً',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: colors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState(BuildContext context, String error, SemanticColors colors) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(PhosphorIcons.warningCircle(), color: colors.error, size: 48),
          const SizedBox(height: NammerhaTheme.spaceMd),
          Text('فشل تحميل رسائل الأثر', style: Theme.of(context).textTheme.titleMedium),
          TextButton(
            onPressed: () {
              context.read<ImpactBloc>().add(FetchImpactMessages(refresh: true));
            },
            child: const Text('إعادة المحاولة'),
          ),
        ],
      ),
    );
  }
}

class _MessageCard extends StatelessWidget {
  final ImpactMessage message;

  const _MessageCard({required this.message});

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<SemanticColors>()!;
    final theme = Theme.of(context);

    return GestureDetector(
      onTap: () {
        if (!message.isRead) {
          context.read<ImpactBloc>().add(MarkMessageAsRead(message.id));
        }
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: NammerhaTheme.spaceMd),
        decoration: BoxDecoration(
          color: message.isRead ? colors.surfaceElevated : colors.primaryBrandLight.withAlpha(77),
          borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
          border: Border.all(
            color: message.isRead ? colors.strokeBorder : colors.primaryBrand.withAlpha(128),
            width: 1,
          ),
          boxShadow: const [NammerhaShadows.elevation],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (message.imageUrl != null && message.imageUrl!.isNotEmpty)
              ClipRRect(
                borderRadius: const BorderRadius.vertical(top: Radius.circular(NammerhaTheme.radiusMd)),
                child: Image.network(
                  message.imageUrl!,
                  height: 160,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  errorBuilder: (ctx, err, stack) => Container(
                    height: 160,
                    color: colors.backgroundPrimary,
                    child: Center(
                      child: Icon(PhosphorIcons.imageBroken(), color: colors.textMuted),
                    ),
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.all(NammerhaTheme.spaceMd),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: _getIconBackgroundColor(colors),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          _getIconForType(),
                          color: _getIconColor(colors),
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: NammerhaTheme.spaceMd),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              message.title,
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: message.isRead ? FontWeight.w600 : FontWeight.w700,
                                color: colors.textHeading,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _formatTimeAgo(message.createdAt),
                              style: theme.textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                      if (!message.isRead)
                        Container(
                          width: 8,
                          height: 8,
                          margin: const EdgeInsetsDirectional.only(start: 8, top: 4),
                          decoration: BoxDecoration(
                            color: colors.primaryBrand,
                            shape: BoxShape.circle,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: NammerhaTheme.spaceMd),
                  Text(
                    message.body,
                    style: theme.textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Formats a DateTime as a human-readable Arabic relative time string.
  /// Uses intl (already in pubspec) instead of the unavailable timeago package.
  String _formatTimeAgo(DateTime dateTime) {
    final now = DateTime.now();
    final diff = now.difference(dateTime);

    if (diff.inMinutes < 1) return 'الآن';
    if (diff.inMinutes < 60) return 'منذ ${diff.inMinutes} دقيقة';
    if (diff.inHours < 24) return 'منذ ${diff.inHours} ساعة';
    if (diff.inDays < 7) return 'منذ ${diff.inDays} يوم';
    return DateFormat('yyyy/MM/dd', 'ar').format(dateTime);
  }

  IconData _getIconForType() {
    switch (message.type) {
      case 'milestone':
        return PhosphorIcons.flag();
      case 'completion':
        return PhosphorIcons.checkCircle();
      case 'thank_you':
        return PhosphorIcons.heart();
      default:
        return PhosphorIcons.info();
    }
  }

  Color _getIconColor(SemanticColors colors) {
    switch (message.type) {
      case 'milestone':
        return const Color(0xFF109173); // Smoky Jade
      case 'completion':
        return colors.primaryBrand;
      case 'thank_you':
        return const Color(0xFFD59F80); // Warm Earth
      default:
        return colors.textSecondary;
    }
  }

  Color _getIconBackgroundColor(SemanticColors colors) {
    return _getIconColor(colors).withAlpha(26);
  }
}
