import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/semantic_colors.dart';
import '../bloc/project_bloc.dart';
import '../bloc/project_event.dart';
import '../bloc/project_state.dart';
import '../data/project_repository.dart';
import '../../../core/widgets/shimmer_loader.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

class ProjectListScreen extends StatelessWidget {
  const ProjectListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return BlocProvider(
      create: (context) => ProjectBloc(repository: ProjectRepository())..add(FetchEngineerProjectsEvent()),
      child: Scaffold(
        backgroundColor: colors.backgroundPrimary,
        appBar: AppBar(
          title: const Text('مشاريعي المعيّنة'),
        ),
        body: BlocBuilder<ProjectBloc, ProjectState>(
          builder: (context, state) {
            if (state is ProjectLoading || state is ProjectInitial) {
              return NammerhaShimmerLoader(colors: colors);
            } else if (state is ProjectError) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Text(
                    state.message,
                    style: TextStyle(color: colors.error),
                    textAlign: TextAlign.center,
                  ),
                ),
              );
            } else if (state is ProjectLoaded) {
              final projects = state.projects;

              if (projects.isEmpty) {
                return Center(
                  child: Text(
                    'لا توجد مشاريع حالياً',
                    style: TextStyle(color: colors.textSecondary),
                  ),
                );
              }

              return RefreshIndicator(
                onRefresh: () async {
                  context.read<ProjectBloc>().add(FetchEngineerProjectsEvent());
                },
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: projects.length,
                  itemBuilder: (context, index) {
                    final project = projects[index];
                    final funded = project.fundedPercentage;

                    return Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: colors.surfaceElevated,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: colors.strokeSubtle),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  project.title,
                                  style: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 15,
                                    color: colors.textPrimary,
                                  ),
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: colors.primaryBrand.withAlpha(15),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  project.status,
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: colors.primaryBrand,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                              value: funded / 100,
                              backgroundColor: colors.strokeSubtle,
                              valueColor: AlwaysStoppedAnimation<Color>(colors.primaryBrand),
                              minHeight: 6,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                '${funded.toStringAsFixed(1)}% مموّل',
                                style: TextStyle(fontSize: 12, color: colors.textSecondary),
                              ),
                              Row(
                                children: [
                                  Icon(PhosphorIcons.hourglassHigh(), size: 14, color: colors.warning),
                                  const SizedBox(width: 4),
                                  Text(
                                    '${project.pendingProofs} إثبات معلّق',
                                    style: TextStyle(fontSize: 12, color: colors.warning, fontWeight: FontWeight.w600),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ],
                      ),
                    );
                  },
                ),
              );
            }
            return const SizedBox();
          },
        ),
      ),
    );
  }
}
