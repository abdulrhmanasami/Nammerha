import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/i18n/t.dart';
import '../../../core/utils/animation_budget.dart';

class PasswordStrengthIndicator extends StatelessWidget {
  final String password;

  const PasswordStrengthIndicator({super.key, required this.password});

  int get _strengthScore {
    if (password.isEmpty) return 0;
    int score = 0;
    if (password.length >= 8) score++;
    if (password.contains(RegExp(r'[A-Z]'))) score++;
    if (password.contains(RegExp(r'[a-z]'))) score++;
    if (password.contains(RegExp(r'[0-9!@#\$&*~]'))) score++;
    return score;
  }

  Color _getStrengthColor(int score, SemanticColors colors) {
    if (score == 0) return colors.strokeSubtle;
    if (score == 1) return colors.error;
    if (score == 2) return Colors.orange;
    if (score == 3) return Colors.lime;
    return colors.success;
  }

  String _getStrengthText(int score, BuildContext context) {
    if (score == 0) return context.tr('pw_strength_none');
    if (score == 1) return context.tr('pw_strength_weak');
    if (score == 2) return context.tr('pw_strength_fair');
    if (score == 3) return context.tr('pw_strength_good');
    return context.tr('pw_strength_strong');
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final score = _strengthScore;
    final color = _getStrengthColor(score, colors);

    if (password.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 8.0, bottom: 16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                _getStrengthText(score, context),
                style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: List.generate(4, (index) {
              final isActive = index < score;
              return Expanded(
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  height: 4,
                  margin: EdgeInsetsDirectional.only(end: index < 3 ? 4 : 0),
                  decoration: BoxDecoration(
                    color: isActive ? color : colors.strokeSubtle,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              );
            }),
          ),
        ],
      ).nmAnimate(context).fadeIn(duration: 200.ms),
    );
  }
}
