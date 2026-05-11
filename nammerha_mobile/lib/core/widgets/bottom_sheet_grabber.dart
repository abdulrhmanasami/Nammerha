import 'package:flutter/material.dart';
import '../theme/semantic_colors.dart';

/// Wave 6 Demonic UX Fix: Phantom Affordance Grabber
/// Adds a visual drag handle to the top of BottomSheets to indicate they are swipable.
class BottomSheetGrabber extends StatelessWidget {
  final SemanticColors colors;
  
  const BottomSheetGrabber({super.key, required this.colors});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        width: 40,
        height: 5,
        decoration: BoxDecoration(
          color: colors.strokeSubtle.withAlpha(150),
          borderRadius: BorderRadius.circular(10),
        ),
      ),
    );
  }
}
