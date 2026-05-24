import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import '../theme/semantic_colors.dart';

class SwipeToConfirm extends StatefulWidget {
  final VoidCallback onConfirm;
  final String label;
  final Color? activeColor;
  final Color? iconColor;

  const SwipeToConfirm({
    super.key,
    required this.onConfirm,
    required this.label,
    this.activeColor,
    this.iconColor,
  });

  @override
  State<SwipeToConfirm> createState() => _SwipeToConfirmState();
}

class _SwipeToConfirmState extends State<SwipeToConfirm> with SingleTickerProviderStateMixin {
  double _dragOffset = 0.0;
  bool _confirmed = false;
  late AnimationController _resetController;
  late Animation<double> _resetAnimation;

  @override
  void initState() {
    super.initState();
    _resetController = AnimationController(vsync: this, duration: const Duration(milliseconds: 300));
    _resetController.addListener(() {
      setState(() {
        _dragOffset = _resetAnimation.value;
      });
    });
  }

  @override
  void dispose() {
    _resetController.dispose();
    super.dispose();
  }

  void _onPanUpdate(DragUpdateDetails details, double maxWidth) {
    if (_confirmed) return;
    
    setState(() {
      _dragOffset += details.delta.dx;
      if (_dragOffset < 0) _dragOffset = 0;
      
      final maxDrag = maxWidth - 56; // 56 is the button width
      if (_dragOffset >= maxDrag) {
        _dragOffset = maxDrag;
        if (!_confirmed) {
          _confirmed = true;
          HapticFeedback.heavyImpact();
          widget.onConfirm();
        }
      }
    });
  }

  void _onPanEnd(DragEndDetails details, double maxWidth) {
    if (_confirmed) return;
    
    final maxDrag = maxWidth - 56;
    if (_dragOffset < maxDrag) {
      _resetAnimation = Tween<double>(begin: _dragOffset, end: 0.0).animate(
        CurvedAnimation(parent: _resetController, curve: Curves.easeOut),
      );
      _resetController.forward(from: 0);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final bgColor = widget.activeColor?.withValues(alpha: 0.1) ?? colors.successLight;
    final fgColor = widget.activeColor ?? colors.success;
    final iColor = widget.iconColor ?? Colors.white;

    return LayoutBuilder(
      builder: (context, constraints) {
        final maxWidth = constraints.maxWidth;
        final maxDrag = maxWidth - 56;
        final dragPercent = maxDrag > 0 ? (_dragOffset / maxDrag).clamp(0.0, 1.0) : 0.0;

        return Container(
          height: 56,
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: fgColor.withValues(alpha: 0.3)),
          ),
          child: Stack(
            children: [
              // Background Progress
              Positioned(
                left: 0,
                top: 0,
                bottom: 0,
                width: _dragOffset + 56,
                child: Container(
                  decoration: BoxDecoration(
                    color: fgColor.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(28),
                  ),
                ),
              ),
              // Center Text
              Center(
                child: Opacity(
                  opacity: (1.0 - dragPercent * 1.5).clamp(0.0, 1.0),
                  child: Text(
                    widget.label,
                    style: TextStyle(
                      color: fgColor,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
              // Draggable Button
              Positioned(
                left: _dragOffset,
                top: 0,
                bottom: 0,
                child: GestureDetector(
                  onPanUpdate: (details) => _onPanUpdate(details, maxWidth),
                  onPanEnd: (details) => _onPanEnd(details, maxWidth),
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: fgColor,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: fgColor.withValues(alpha: 0.3),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        )
                      ],
                    ),
                    child: Center(
                      child: Icon(
                        _confirmed ? PhosphorIconsRegular.check : PhosphorIconsRegular.caretDoubleRight,
                        color: iColor,
                        size: 24,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
