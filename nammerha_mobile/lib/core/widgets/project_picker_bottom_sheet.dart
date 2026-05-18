import 'package:flutter/material.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

import '../theme/semantic_colors.dart';
import '../widgets/shimmer_loader.dart';
import '../widgets/bottom_sheet_grabber.dart';
import '../i18n/t.dart';

// ═══════════════════════════════════════════════════════════════════════════
// P2-003 FIX: Extracted ProjectPickerBottomSheet
// ═══════════════════════════════════════════════════════════════════════════
// PREVIOUS: Two near-identical 115-line methods in dashboard_screen.dart:
//   • _showProjectPickerForCamera()
//   • _showProjectPickerForRealityCapture()
//
// Only differences: header icon, header title, leading icon color, onTap nav.
// 230 lines of raw duplication (DRY violation).
//
// NOW: Single reusable widget parameterized by:
//   • headerIcon, headerTitle, leadingColor
//   • onProjectSelected callback (receives projectId + title)
//   • projectsFuture (the data source)
//
// USAGE:
//   ProjectPickerBottomSheet.show(
//     context: context,
//     headerIcon: PhosphorIconsRegular.camera,
//     headerTitleKey: 'select_project_for_camera',
//     leadingColor: colors.success,
//     projectsFuture: _fetchUserProjects(),
//     onProjectSelected: (id, title) => Navigator.push(...),
//   );
// ═══════════════════════════════════════════════════════════════════════════

class ProjectPickerBottomSheet extends StatelessWidget {
  /// The icon shown in the header row.
  final IconData headerIcon;

  /// i18n key for the header title text.
  final String headerTitleKey;

  /// Color for the header icon and leading icon in list tiles.
  final Color leadingColor;

  /// Future that resolves to the list of user projects.
  final Future<List<Map<String, dynamic>>> projectsFuture;

  /// Callback when a project is selected. Receives (projectId, projectTitle).
  final void Function(String projectId, String projectTitle) onProjectSelected;

  const ProjectPickerBottomSheet({
    super.key,
    required this.headerIcon,
    required this.headerTitleKey,
    required this.leadingColor,
    required this.projectsFuture,
    required this.onProjectSelected,
  });

  /// Convenience method to show the picker as a modal bottom sheet.
  static void show({
    required BuildContext context,
    required IconData headerIcon,
    required String headerTitleKey,
    required Color leadingColor,
    required Future<List<Map<String, dynamic>>> projectsFuture,
    required void Function(String projectId, String projectTitle) onProjectSelected,
  }) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ProjectPickerBottomSheet(
        headerIcon: headerIcon,
        headerTitleKey: headerTitleKey,
        leadingColor: leadingColor,
        projectsFuture: projectsFuture,
        onProjectSelected: onProjectSelected,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.6,
      ),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Grab handle — standardized Platinum component
          BottomSheetGrabber(colors: colors),
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(20, 8, 20, 16),
            child: Row(
              children: [
                Icon(headerIcon, color: leadingColor, size: 22),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    context.tr(headerTitleKey),
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: colors.textPrimary,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Flexible(
            child: FutureBuilder<List<Map<String, dynamic>>>(
              future: projectsFuture,
              builder: (ctx, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return Padding(
                    padding: const EdgeInsets.all(40),
                    child: NammerhaShimmerLoader(colors: colors, isList: true),
                  );
                }
                if (snapshot.hasError || (snapshot.data?.isEmpty ?? true)) {
                  return Padding(
                    padding: const EdgeInsets.all(40),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(PhosphorIconsRegular.buildings,
                            color: colors.textSecondary, size: 40),
                        const SizedBox(height: 12),
                        Text(
                          context.tr('no_projects_for_camera'),
                          style: TextStyle(
                              color: colors.textSecondary, fontSize: 14),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  );
                }
                final projects = snapshot.data!;
                return ListView.separated(
                  shrinkWrap: true,
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: projects.length,
                  separatorBuilder: (_, _) => const Divider(
                      height: 1, indent: 20, endIndent: 20),
                  itemBuilder: (_, index) {
                    final p = projects[index];
                    final projectId =
                        p['project_id']?.toString() ?? '';
                    final title = p['title']?.toString() ?? '';
                    final status = p['status']?.toString() ?? '';
                    return ListTile(
                      leading: Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: leadingColor.withAlpha(20),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(PhosphorIconsRegular.buildings,
                            color: leadingColor, size: 20),
                      ),
                      title: Text(title,
                          style: TextStyle(
                              fontWeight: FontWeight.w600,
                              color: colors.textPrimary)),
                      subtitle: Text(
                          status.replaceAll('_', ' '),
                          style: TextStyle(
                              fontSize: 12,
                              color: colors.textSecondary)),
                      trailing: Icon(PhosphorIconsRegular.caretRight,
                          color: colors.textSecondary, size: 18),
                      onTap: () {
                        Navigator.pop(context);
                        onProjectSelected(projectId, title);
                      },
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
