import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Wizard Stepper — Horizontal step indicator for multi-step wizards
/// ═══════════════════════════════════════════════════════════════════════════
/// Shows 4 steps with active/completed/upcoming states.
/// Animated transitions between steps with brand colors.
/// ═══════════════════════════════════════════════════════════════════════════
class WizardStepper extends StatelessWidget {
  final int currentStep;
  final List<String> stepLabels;

  const WizardStepper({
    super.key,
    required this.currentStep,
    required this.stepLabels,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: List.generate(stepLabels.length * 2 - 1, (index) {
          if (index.isOdd) {
            // Connector line between steps
            final stepBefore = index ~/ 2;
            final isCompleted = stepBefore < currentStep;
            return Expanded(
              child: AnimatedContainer(
                duration: NammerhaAnimations.normal,
                height: 3,
                margin: const EdgeInsets.symmetric(horizontal: 4),
                decoration: BoxDecoration(
                  color: isCompleted ? colors.primaryBrand : colors.strokeSubtle,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            );
          }

          // Step circle + label
          final stepIndex = index ~/ 2;
          final isActive = stepIndex == currentStep;
          final isCompleted = stepIndex < currentStep;

          return _StepDot(
            label: stepLabels[stepIndex],
            stepNumber: stepIndex + 1,
            isActive: isActive,
            isCompleted: isCompleted,
            colors: colors,
          );
        }),
      ),
    );
  }
}

class _StepDot extends StatelessWidget {
  final String label;
  final int stepNumber;
  final bool isActive;
  final bool isCompleted;
  final SemanticColors colors;

  const _StepDot({
    required this.label,
    required this.stepNumber,
    required this.isActive,
    required this.isCompleted,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        AnimatedContainer(
          duration: NammerhaAnimations.normal,
          width: isActive ? 36 : 30,
          height: isActive ? 36 : 30,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isCompleted
                ? colors.success
                : isActive
                    ? colors.primaryBrand
                    : colors.backgroundSecondary,
            border: Border.all(
              color: isCompleted
                  ? colors.success
                  : isActive
                      ? colors.primaryBrand
                      : colors.strokeSubtle,
              width: isActive ? 2.5 : 1.5,
            ),
            boxShadow: isActive
                ? [
                    BoxShadow(
                      color: colors.primaryBrand.withAlpha(40),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    )
                  ]
                : [],
          ),
          child: Center(
            child: isCompleted
                ? Icon(PhosphorIconsRegular.check, color: Colors.white, size: 18)
                : Text(
                    '$stepNumber',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: isActive ? Colors.white : colors.textSecondary,
                    ),
                  ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          label,
          style: TextStyle(
            fontSize: 10,
            fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
            color: isActive ? colors.primaryBrand : colors.textSubtle,
          ),
        ),
      ],
    );
  }
}
