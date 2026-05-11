import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../theme/semantic_colors.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Gradient Button — Nammerha Premium CTA Component
/// ═══════════════════════════════════════════════════════════════════════════
/// Default gradient: Trust Blue (#1A73E8) → Smoky Jade (#109173)
/// Matches web platform: .btn-primary + .btn-jade fusion
/// Shadow: --shadow-cta token from web CSS
///
/// PREVIOUS (WRONG): Default was teal #0D7377→#14919B — NOT a brand color.
/// NOW: Uses NammerhaGradients.ctaPrimary for brand compliance.
/// ═══════════════════════════════════════════════════════════════════════════
class GradientButton extends StatefulWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;
  final IconData? icon;
  final List<Color>? colors;
  final double height;
  final double borderRadius;

  const GradientButton({
    super.key,
    required this.label,
    this.onPressed,
    this.isLoading = false,
    this.icon,
    this.colors,
    this.height = 56,
    this.borderRadius = 16,
  });

  @override
  State<GradientButton> createState() => _GradientButtonState();
}

class _GradientButtonState extends State<GradientButton>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  bool _isPressed = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: NammerhaAnimations.fast,
    );
    _scaleAnimation = Tween<double>(begin: 1.0, end: 0.96).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Brand-governed default: Trust Blue → Smoky Jade
    final gradientColors = widget.colors ?? NammerhaGradients.ctaPrimary.colors;
    final colors = Theme.of(context).extension<SemanticColors>()!;

    return GestureDetector(
      onTapDown: (_) {
        if (widget.onPressed != null && !widget.isLoading) {
          _controller.forward();
          setState(() => _isPressed = true);
        }
      },
      onTapUp: (_) {
        _controller.reverse();
        setState(() => _isPressed = false);
        if (widget.onPressed != null && !widget.isLoading) {
          widget.onPressed!();
        }
      },
      onTapCancel: () {
        _controller.reverse();
        setState(() => _isPressed = false);
      },
      child: AnimatedBuilder(
        animation: _scaleAnimation,
        builder: (context, child) {
          return Transform.scale(
            scale: _scaleAnimation.value,
            child: AnimatedContainer(
              duration: NammerhaAnimations.normal,
              height: widget.height,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: widget.onPressed == null
                      ? [Colors.grey.shade400, Colors.grey.shade500]
                      : gradientColors,
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(widget.borderRadius),
                boxShadow: _isPressed || widget.onPressed == null
                    ? []
                    : const [NammerhaShadows.cta],
              ),
              child: Center(
                child: widget.isLoading
                    ? SizedBox(width: 24, height: 24, child: NammerhaShimmerLoader(colors: colors),
                      )
                    : Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (widget.icon != null) ...[
                            Icon(widget.icon, color: Colors.white, size: 20),
                            const SizedBox(width: 10),
                          ],
                          Text(
                            widget.label,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.3,
                            ),
                          ),
                        ],
                      ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Simple AnimatedBuilder wrapper
class AnimatedBuilder extends AnimatedWidget {
  final Widget Function(BuildContext, Widget?) builder;
  final Widget? child;

  const AnimatedBuilder({
    super.key,
    required Animation<double> animation,
    required this.builder,
    this.child,
  }) : super(listenable: animation);

  @override
  Widget build(BuildContext context) {
    return builder(context, child);
  }
}
