import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Damage Type Selector — Grid of damage categories
/// ═══════════════════════════════════════════════════════════════════════════
/// Categories match web homeowner-report.ts WizardState.damageType
/// ═══════════════════════════════════════════════════════════════════════════

class DamageCategory {
  final String key;
  final String label;
  final IconData icon;
  final Color Function(SemanticColors) colorGetter;

  const DamageCategory({
    required this.key,
    required this.label,
    required this.icon,
    required this.colorGetter,
  });
}

class DamageTypeSelector extends StatelessWidget {
  final String? selectedType;
  final ValueChanged<String> onSelected;

  const DamageTypeSelector({
    super.key,
    this.selectedType,
    required this.onSelected,
  });

  static final List<DamageCategory> categories = [
    DamageCategory(
      key: 'structural',
      label: 'إنشائي',
      icon: PhosphorIconsRegular.warningCircle,
      colorGetter: (c) => c.error,
    ),
    DamageCategory(
      key: 'electrical',
      label: 'كهربائي',
      icon: PhosphorIconsRegular.warningCircle,
      colorGetter: (c) => c.warning,
    ),
    DamageCategory(
      key: 'plumbing',
      label: 'سباكة',
      icon: PhosphorIconsRegular.warningCircle,
      colorGetter: (c) => c.info,
    ),
    DamageCategory(
      key: 'finishing',
      label: 'تشطيبات',
      icon: PhosphorIconsRegular.paintRoller,
      colorGetter: (c) => c.secondaryAccent,
    ),
    DamageCategory(
      key: 'roofing',
      label: 'أسقف',
      icon: PhosphorIconsRegular.warningCircle,
      colorGetter: (c) => c.primaryBrand,
    ),
    DamageCategory(
      key: 'other',
      label: 'أخرى',
      icon: PhosphorIconsRegular.wrench,
      colorGetter: (c) => c.textSecondary,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        childAspectRatio: 1.0,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
      ),
      itemCount: categories.length,
      itemBuilder: (context, index) {
        final cat = categories[index];
        final isSelected = selectedType == cat.key;
        final accent = cat.colorGetter(colors);

        return GestureDetector(
          onTap: () => onSelected(cat.key),
          child: AnimatedContainer(
            duration: NammerhaAnimations.fast,
            decoration: BoxDecoration(
              color: isSelected
                  ? accent.withAlpha(15)
                  : colors.surfaceElevated,
              borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
              border: Border.all(
                color: isSelected ? accent : colors.strokeSubtle,
                width: isSelected ? 2 : 1,
              ),
              boxShadow: isSelected
                  ? [
                      BoxShadow(
                        color: accent.withAlpha(30),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      )
                    ]
                  : [],
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AnimatedContainer(
                  duration: NammerhaAnimations.fast,
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: isSelected
                        ? accent.withAlpha(25)
                        : colors.backgroundSecondary,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(
                    cat.icon,
                    color: isSelected ? accent : colors.textSecondary,
                    size: 24,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  cat.label,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                    color: isSelected ? accent : colors.textSecondary,
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
