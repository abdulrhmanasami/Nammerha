import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../state/cart_store.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Cart FAB — Floating badge showing item count
/// ═══════════════════════════════════════════════════════════════════════════
/// Shows on marketplace/project screens. Animates on item add.
/// Badge uses brand warning gradient for attention.
/// ═══════════════════════════════════════════════════════════════════════════
class CartFab extends StatelessWidget {
  final VoidCallback onTap;

  const CartFab({super.key, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return ListenableBuilder(
      listenable: CartStore.instance,
      builder: (context, _) {
        final count = CartStore.instance.count;
        if (count == 0) return const SizedBox.shrink();

        return GestureDetector(
          onTap: onTap,
          child: AnimatedContainer(
            duration: NammerhaAnimations.normal,
            curve: NammerhaAnimations.elasticScale,
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              gradient: NammerhaGradients.ctaPrimary,
              borderRadius: BorderRadius.circular(NammerhaTheme.radiusLg),
              boxShadow: const [NammerhaShadows.cta],
            ),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                // Cart icon
                const Center(
                  child: Icon(
                    Icons.shopping_cart_rounded,
                    color: Colors.white,
                    size: 28,
                  ),
                ),
                // Badge
                PositionedDirectional(
                  top: -4,
                  end: -4,
                  child: AnimatedScale(
                    scale: count > 0 ? 1.0 : 0.0,
                    duration: NammerhaAnimations.fast,
                    curve: NammerhaAnimations.elasticScale,
                    child: Container(
                      width: 24,
                      height: 24,
                      decoration: BoxDecoration(
                        color: colors.error,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                      child: Center(
                        child: Text(
                          count > 99 ? '99+' : '$count',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
