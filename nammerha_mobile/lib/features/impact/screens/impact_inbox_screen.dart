import '../../../core/i18n/t.dart';
import '../../../core/widgets/error_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/utils/date_utils.dart';

import '../../../core/theme/semantic_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../bloc/impact_bloc.dart';
import '../bloc/impact_event.dart';
import '../bloc/impact_state.dart';
import '../data/impact_repository.dart';
import '../models/impact_message_model.dart';
import '../../../core/widgets/shimmer_loader.dart';
// AUD-015 FIX: Import PhosphorIconsRegular (constant syntax) instead of
// PhosphorIcons (function syntax) for compile-time icon resolution.
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'impact_message_detail_screen.dart';

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
    // AUD-016 FIX: Theme.of(context).extension<SemanticColors>()! → context.colors
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundSecondary,
      appBar: AppBar(
        title: Text(context.tr('impact_field')), // Impact
        actions: [
          BlocBuilder<ImpactBloc, ImpactState>(
            builder: (context, state) {
              if (state is ImpactLoaded && state.unreadCount > 0) {
                return IconButton(
                  // AUD-015 FIX: PhosphorIcons.checks() → PhosphorIconsRegular.checks
                  icon: Icon(PhosphorIconsRegular.checks),
                  tooltip: context.tr('notifications_mark_all_read'),
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
          // AUD-015 FIX: PhosphorIcons.envelopeOpen() → PhosphorIconsRegular.envelopeOpen
          Icon(
            PhosphorIconsRegular.envelopeOpen,
            size: 64,
            color: colors.textMuted,
          ),
          const SizedBox(height: NammerhaTheme.spaceMd),
          // AUD-016 FIX: Theme.of(context).textTheme → direct TextStyle with semantic tokens
          Text(
            context.tr('no_impact_messages'),
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: colors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState(BuildContext context, String error, SemanticColors colors) {
    return NammerhaErrorState(
      message: context.tr('failed_to_load'),
      onRetry: () => context.read<ImpactBloc>().add(FetchImpactMessages(refresh: true)),
      iconSize: 48,
    );
  }
}

class _MessageCard extends StatelessWidget {
  final ImpactMessage message;

  const _MessageCard({required this.message});

  @override
  Widget build(BuildContext context) {
    // AUD-016 FIX: Theme.of(context).extension<SemanticColors>()! → context.colors
    // Removed: `final theme = Theme.of(context);` — all textTheme references
    // replaced with direct TextStyle using semantic color tokens.
    final colors = context.colors;

    // AUD-020 FIX: Semantics wrapper for screen readers.
    // VoiceOver/TalkBack announces: "{title} — Open message"
    return Semantics(
      label: '${message.title} — ${context.tr("open_message")}',
      button: true,
      child: GestureDetector(
      onTap: () {
        // AUD-017 FIX: Mark as read AND navigate to detail screen.
        // Previously only marked as read — dead end, user saw no detail.
        if (!message.isRead) {
          context.read<ImpactBloc>().add(MarkMessageAsRead(message.id));
        }
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ImpactMessageDetailScreen(message: message),
          ),
        );
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
                child: Hero(
                  tag: 'impact_image_${message.id}',
                  child: Image.network(
                    message.imageUrl!,
                    height: 160,
                    width: double.infinity,
                    fit: BoxFit.cover,
                    errorBuilder: (ctx, err, stack) => Container(
                      height: 160,
                      color: colors.backgroundPrimary,
                      child: Center(
                        // AUD-015 FIX: PhosphorIcons.imageBroken() → PhosphorIconsRegular.imageBroken
                        child: Icon(PhosphorIconsRegular.imageBroken, color: colors.textMuted),
                      ),
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
                            // AUD-016 FIX: theme.textTheme.titleMedium?.copyWith → direct TextStyle
                            Text(
                              message.title,
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: message.isRead ? FontWeight.w600 : FontWeight.w700,
                                color: colors.textHeading,
                              ),
                            ),
                            const SizedBox(height: 4),
                            // AUD-016 FIX: theme.textTheme.bodySmall → direct TextStyle
                            Text(
                              NammerhaDateUtils.relativeTime(context, message.createdAt),
                              style: TextStyle(
                                fontSize: 12,
                                color: colors.textSecondary,
                              ),
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
                  // AUD-016 FIX: theme.textTheme.bodyMedium → direct TextStyle
                  Text(
                    message.body,
                    style: TextStyle(
                      fontSize: 14,
                      color: colors.textPrimary,
                      height: 1.5,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ), // Semantics (AUD-020)
    );
  }



  // AUD-015 FIX: All PhosphorIcons.xxx() → PhosphorIconsRegular.xxx
  // Compile-time constant syntax replaces runtime function calls.
  IconData _getIconForType() {
    switch (message.type) {
      case 'milestone':
        return PhosphorIconsRegular.flag;
      case 'completion':
        return PhosphorIconsRegular.checkCircle;
      case 'thank_you':
        return PhosphorIconsRegular.heart;
      default:
        return PhosphorIconsRegular.info;
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
