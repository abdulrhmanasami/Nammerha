import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../core/utils/date_utils.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

import '../../../core/i18n/t.dart';
import '../../../core/theme/semantic_colors.dart';
import '../models/impact_message_model.dart';
import '../../../core/utils/animation_budget.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Impact Message Detail Screen — Platinum Standard
/// ═══════════════════════════════════════════════════════════════════════════
/// AUD-017 FIX: Previously, tapping an Impact message only removed the
/// unread dot — no detail view opened. Now, this screen provides a full
/// immersive view of the message with:
///   - Hero-animated image (if present)
///   - Message type badge (milestone/completion/thank_you)
///   - Full body text with proper typography
///   - Timestamp and project reference
///   - Share action for transparency
///
/// Standard: Nielsen #3 (User control and freedom — clear back navigation)
/// ═══════════════════════════════════════════════════════════════════════════
class ImpactMessageDetailScreen extends StatelessWidget {
  final ImpactMessage message;

  const ImpactMessageDetailScreen({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      body: CustomScrollView(
        slivers: [
          // ─── Hero Image App Bar ──────────────────────────────────
          _buildSliverAppBar(context, colors),

          // ─── Content ─────────────────────────────────────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Type badge + timestamp
                  _buildMetaRow(context, colors),
                  const SizedBox(height: 16),

                  // Title
                  Text(
                    message.title,
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: colors.textHeading,
                      height: 1.3,
                    ),
                  ).nmAnimate(context).fadeIn(duration: 300.ms).slideY(begin: 0.05),
                  const SizedBox(height: 16),

                  // Divider
                  Container(
                    height: 3,
                    width: 40,
                    decoration: BoxDecoration(
                      color: _getTypeColor(colors),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Body
                  Text(
                    message.body,
                    style: TextStyle(
                      fontSize: 16,
                      color: colors.textPrimary,
                      height: 1.7,
                      letterSpacing: 0.15,
                    ),
                  ).nmAnimate(context, delay: 100.ms).fadeIn(duration: 300.ms),
                  const SizedBox(height: 24),

                  // Project reference card (if linked)
                  if (message.projectId != null && message.projectId!.isNotEmpty)
                    _buildProjectCard(context, colors),

                  const SizedBox(height: 32),

                  // Transparency footer
                  _buildTransparencyFooter(context, colors),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─── Sliver App Bar with Hero Image ──────────────────────────────────

  Widget _buildSliverAppBar(BuildContext context, SemanticColors colors) {
    final hasImage = message.imageUrl != null && message.imageUrl!.isNotEmpty;

    return SliverAppBar(
      expandedHeight: hasImage ? 260 : 0,
      pinned: true,
      stretch: true,
      backgroundColor: colors.backgroundPrimary,
      foregroundColor: colors.textPrimary,
      leading: IconButton(
        icon: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: colors.backgroundPrimary.withAlpha(200),
            shape: BoxShape.circle,
          ),
          child: Icon(PhosphorIconsRegular.arrowLeft, size: 20, color: colors.textPrimary),
        ),
        onPressed: () => Navigator.of(context).pop(),
      ),
      flexibleSpace: hasImage
          ? FlexibleSpaceBar(
              stretchModes: const [StretchMode.zoomBackground],
              background: Hero(
                tag: 'impact_image_${message.id}',
                child: Image.network(
                  message.imageUrl!,
                  fit: BoxFit.cover,
                  width: double.infinity,
                  errorBuilder: (_, _, _) => Container(
                    color: colors.backgroundSecondary,
                    child: Center(
                      child: Icon(PhosphorIconsRegular.imageBroken, size: 48, color: colors.textSubtle),
                    ),
                  ),
                ),
              ),
            )
          : null,
    );
  }

  // ─── Meta Row (Type Badge + Timestamp) ───────────────────────────────

  Widget _buildMetaRow(BuildContext context, SemanticColors colors) {
    return Row(
      children: [
        // Type badge
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: _getTypeColor(colors).withAlpha(20),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: _getTypeColor(colors).withAlpha(50)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(_getTypeIcon(), size: 14, color: _getTypeColor(colors)),
              const SizedBox(width: 6),
              Text(
                _getTypeLabel(context),
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: _getTypeColor(colors),
                ),
              ),
            ],
          ),
        ),
        const Spacer(),
        // Timestamp
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(PhosphorIconsRegular.clock, size: 14, color: colors.textSubtle),
            const SizedBox(width: 4),
            Text(
              NammerhaDateUtils.formatDate(context, message.createdAt),
              style: TextStyle(
                fontSize: 12,
                color: colors.textSubtle,
              ),
            ),
          ],
        ),
      ],
    ).nmAnimate(context).fadeIn(duration: 200.ms);
  }

  // ─── Project Reference Card ──────────────────────────────────────────

  Widget _buildProjectCard(BuildContext context, SemanticColors colors) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: colors.primaryBrand.withAlpha(15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(PhosphorIconsRegular.buildings, size: 20, color: colors.primaryBrand),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  context.tr('impact_linked_project'),
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: colors.textSubtle, letterSpacing: 0.5),
                ),
                const SizedBox(height: 2),
                Text(
                  'PRJ-${message.projectId!.substring(0, message.projectId!.length.clamp(0, 8))}',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.primaryBrand, fontFamily: 'monospace'),
                ),
              ],
            ),
          ),
          Icon(PhosphorIconsRegular.arrowSquareOut, size: 18, color: colors.textSubtle),
        ],
      ),
    ).nmAnimate(context, delay: 200.ms).fadeIn().slideY(begin: 0.05);
  }

  // ─── Transparency Footer ─────────────────────────────────────────────

  Widget _buildTransparencyFooter(BuildContext context, SemanticColors colors) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF0A6E55).withAlpha(8), // Smoky Jade tint
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF0A6E55).withAlpha(25)),
      ),
      child: Row(
        children: [
          Icon(PhosphorIconsRegular.shieldCheck, size: 20, color: const Color(0xFF0A6E55)),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              context.tr('impact_transparency_note'),
              style: TextStyle(
                fontSize: 12,
                color: colors.textSecondary,
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    ).nmAnimate(context, delay: 300.ms).fadeIn();
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  IconData _getTypeIcon() {
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

  Color _getTypeColor(SemanticColors colors) {
    switch (message.type) {
      case 'milestone':
        return const Color(0xFF0A6E55); // Smoky Jade
      case 'completion':
        return colors.primaryBrand;
      case 'thank_you':
        return const Color(0xFFD59F80); // Warm Earth
      default:
        return colors.textSecondary;
    }
  }

  String _getTypeLabel(BuildContext context) {
    switch (message.type) {
      case 'milestone':
        return context.tr('impact_type_milestone');
      case 'completion':
        return context.tr('impact_type_completion');
      case 'thank_you':
        return context.tr('impact_type_thanks');
      default:
        return context.tr('impact_type_update');
    }
  }
}
