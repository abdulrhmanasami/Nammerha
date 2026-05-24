import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

import '../theme/semantic_colors.dart';
import '../widgets/shimmer_loader.dart';
import '../widgets/bottom_sheet_grabber.dart';
import '../i18n/t.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Cubit State Management for ProjectPicker
// ═══════════════════════════════════════════════════════════════════════════

abstract class ProjectPickerState {}

class ProjectPickerLoading extends ProjectPickerState {}

class ProjectPickerLoaded extends ProjectPickerState {
  final List<Map<String, dynamic>> projects;
  ProjectPickerLoaded(this.projects);
}

class ProjectPickerError extends ProjectPickerState {}

class ProjectPickerCubit extends Cubit<ProjectPickerState> {
  ProjectPickerCubit() : super(ProjectPickerLoading());

  Future<void> fetchProjects(Future<List<Map<String, dynamic>>> Function() fetcher) async {
    try {
      emit(ProjectPickerLoading());
      final projects = await fetcher();
      emit(ProjectPickerLoaded(projects));
    } catch (_) {
      emit(ProjectPickerError());
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// P2-003 FIX: Extracted ProjectPickerBottomSheet
// ═══════════════════════════════════════════════════════════════════════════

class ProjectPickerBottomSheet extends StatelessWidget {
  final IconData headerIcon;
  final String headerTitleKey;
  final Color leadingColor;
  final void Function(String projectId, String projectTitle) onProjectSelected;

  const ProjectPickerBottomSheet({
    super.key,
    required this.headerIcon,
    required this.headerTitleKey,
    required this.leadingColor,
    required this.onProjectSelected,
  });

  static void show({
    required BuildContext context,
    required IconData headerIcon,
    required String headerTitleKey,
    required Color leadingColor,
    required Future<List<Map<String, dynamic>>> Function() fetchProjects,
    required void Function(String projectId, String projectTitle) onProjectSelected,
  }) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => BlocProvider(
        create: (_) => ProjectPickerCubit()..fetchProjects(fetchProjects),
        child: ProjectPickerBottomSheet(
          headerIcon: headerIcon,
          headerTitleKey: headerTitleKey,
          leadingColor: leadingColor,
          onProjectSelected: onProjectSelected,
        ),
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
            child: BlocBuilder<ProjectPickerCubit, ProjectPickerState>(
              builder: (ctx, state) {
                if (state is ProjectPickerLoading) {
                  return Padding(
                    padding: const EdgeInsets.all(40),
                    child: NammerhaShimmerLoader(colors: colors, isList: true),
                  );
                }
                
                if (state is ProjectPickerError || (state is ProjectPickerLoaded && state.projects.isEmpty)) {
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
                
                if (state is ProjectPickerLoaded) {
                  final projects = state.projects;
                  return ListView.separated(
                    shrinkWrap: true,
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemCount: projects.length,
                    separatorBuilder: (_, _) => const Divider(
                        height: 1, indent: 20, endIndent: 20),
                    itemBuilder: (_, index) {
                      final p = projects[index];
                      final projectId = p['project_id']?.toString() ?? '';
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
                }
                
                return const SizedBox.shrink();
              },
            ),
          ),
        ],
      ),
    );
  }
}
