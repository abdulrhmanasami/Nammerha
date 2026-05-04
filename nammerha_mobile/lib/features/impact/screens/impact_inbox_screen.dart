import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../../core/theme/semantic_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../bloc/impact_bloc.dart';
import '../bloc/impact_event.dart';
import '../bloc/impact_state.dart';
import '../data/impact_repository.dart';
import '../models/impact_message_model.dart';

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
        title: const Text('أثرك الميداني'), // Impact
        actions: [
          BlocBuilder<ImpactBloc, ImpactState>(
            builder: (context, state) {
              if (state is ImpactLoaded && state.unreadCount > 0) {
                return IconButton(
                  icon: Icon(PhosphorIcons.checkDouble(PhosphorIconsStyle.regular)),
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
            return const Center(child: CircularProgressIndicator());
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
                    return const Padding(
                      padding: EdgeInsets.all(NammerhaTheme.spaceMd),
                      child: Center(child: CircularProgressIndicator()),
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
            PhosphorIcons.envelopeOpen(PhosphorIconsStyle.light),
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
          Icon(PhosphorIcons.warning(PhosphorIconsStyle.regular), color: colors.error, size: 48),
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

    // Enforcing Logical CSS for RTL languages
    return GestureDetector(
      onTap: () {
        if (!message.isRead) {
          context.read<ImpactBloc>().add(MarkMessageAsRead(message.id));
        }
        // Could navigate to full screen image or project details here
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: NammerhaTheme.spaceMd),
        decoration: BoxDecoration(
          color: message.isRead ? colors.surfaceElevated : colors.primaryBrandLight.withOpacity(0.3),
          borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
          border: Border.all(
            color: message.isRead ? colors.strokeBorder : colors.primaryBrand.withOpacity(0.5),
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
                      child: Icon(PhosphorIcons.imageBroken(PhosphorIconsStyle.regular), color: colors.textMuted),
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
                              timeago.format(message.createdAt, locale: 'ar'),
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

  IconData _getIconForType() {
    switch (message.type) {
      case 'milestone':
        return PhosphorIcons.flag(PhosphorIconsStyle.fill);
      case 'completion':
        return PhosphorIcons.checkCircle(PhosphorIconsStyle.fill);
      case 'thank_you':
        return PhosphorIcons.heart(PhosphorIconsStyle.fill);
      default:
        return PhosphorIcons.info(PhosphorIconsStyle.fill);
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
    return _getIconColor(colors).withOpacity(0.1);
  }
}
