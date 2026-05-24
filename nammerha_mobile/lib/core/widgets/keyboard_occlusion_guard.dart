import 'package:flutter/material.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Keyboard Occlusion Guard — Platinum Standard
/// ═══════════════════════════════════════════════════════════════════════════
/// PLAT-UX-001: Handles Keyboard Occlusion by using FocusNode and animateTo.
/// When the wrapped text field gains focus, it automatically scrolls the view
/// to ensure the field (and any subsequent buttons) are perfectly visible
/// above the keyboard.
/// ═══════════════════════════════════════════════════════════════════════════
class KeyboardOcclusionGuard extends StatefulWidget {
  final Widget child;
  final FocusNode focusNode;
  final double alignment;

  const KeyboardOcclusionGuard({
    super.key,
    required this.child,
    required this.focusNode,
    this.alignment = 0.5, // 0.0 is top, 1.0 is bottom, 0.5 is center
  });

  @override
  State<KeyboardOcclusionGuard> createState() => _KeyboardOcclusionGuardState();
}

class _KeyboardOcclusionGuardState extends State<KeyboardOcclusionGuard> {
  @override
  void initState() {
    super.initState();
    widget.focusNode.addListener(_onFocusChange);
  }

  @override
  void dispose() {
    widget.focusNode.removeListener(_onFocusChange);
    super.dispose();
  }

  @override
  void didUpdateWidget(KeyboardOcclusionGuard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.focusNode != widget.focusNode) {
      oldWidget.focusNode.removeListener(_onFocusChange);
      widget.focusNode.addListener(_onFocusChange);
    }
  }

  void _onFocusChange() {
    if (widget.focusNode.hasFocus) {
      // Delay allows the keyboard to animate up before we calculate the new geometry.
      Future.delayed(const Duration(milliseconds: 300), () {
        if (!mounted) return;
        
        Scrollable.ensureVisible(
          context,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeInOut,
          alignment: widget.alignment,
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return widget.child;
  }
}
