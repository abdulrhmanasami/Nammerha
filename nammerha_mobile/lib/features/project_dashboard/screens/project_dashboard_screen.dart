import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/shimmer_loader.dart';
import '../../../core/widgets/bottom_sheet_grabber.dart';
import '../bloc/project_dashboard_bloc.dart';
import '../bloc/project_dashboard_event_state.dart';
import '../../../core/i18n/t.dart';

/// Project Dashboard Screen — per-project management console.
///
/// GAP-C6 FIX: Previously web-only. Enables engineers and homeowners to:
///   - View project overview KPIs (progress, funding, milestones)
///   - Browse daily construction logs
///   - Submit daily work reports with weather/worker counts
///   - Create and respond to material approval requests
///
/// Architecture:
///   - BlocProvider scoped to this screen (ephemeral lifecycle)
///   - Loads overview + logs in parallel via Future.wait
///   - Pull-to-refresh triggers full reload
class ProjectDashboardScreen extends StatelessWidget {
  final String projectId;
  final String projectTitle;

  const ProjectDashboardScreen({
    super.key,
    required this.projectId,
    required this.projectTitle,
  });

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => ProjectDashboardBloc()
        ..add(LoadProjectDashboard(projectId)),
      child: _ProjectDashboardView(
        projectId: projectId,
        projectTitle: projectTitle,
      ),
    );
  }
}

class _ProjectDashboardView extends StatelessWidget {
  final String projectId;
  final String projectTitle;

  const _ProjectDashboardView({
    required this.projectId,
    required this.projectTitle,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text(
          projectTitle.isNotEmpty ? projectTitle : 'لوحة المشروع',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: colors.textPrimary,
          ),
        ),
        backgroundColor: colors.backgroundPrimary,
        elevation: 0,
        iconTheme: IconThemeData(color: colors.textPrimary),
      ),
      body: BlocConsumer<ProjectDashboardBloc, ProjectDashboardState>(
        listener: (context, state) {
          if (state is DailyLogSubmitted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: colors.success,
              ),
            );
          } else if (state is ApprovalSubmitted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: colors.success,
              ),
            );
          } else if (state is ApprovalResponded) {
            final label = state.decision == 'approved' ? 'تمت الموافقة ✅' : 'تم الرفض ❌';
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(label), backgroundColor: colors.primaryBrand),
            );
          } else if (state is ProjectDashboardError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: colors.error,
              ),
            );
          }
        },
        builder: (context, state) {
          if (state is ProjectDashboardLoading || state is DailyLogSubmitting || state is ApprovalSubmitting) {
            return NammerhaShimmerLoader(colors: colors, itemCount: 4);
          }

          if (state is ProjectDashboardLoaded) {
            return _buildLoadedView(context, state);
          }

          if (state is ProjectDashboardError) {
            return _buildErrorView(context, state.message);
          }

          return const SizedBox.shrink();
        },
      ),
      floatingActionButton: BlocBuilder<ProjectDashboardBloc, ProjectDashboardState>(
        builder: (context, state) {
          if (state is! ProjectDashboardLoaded) return const SizedBox.shrink();
          return FloatingActionButton.extended(
            onPressed: () => _showSubmitLogDialog(context),
            backgroundColor: colors.primaryBrand,
            icon: Icon(PhosphorIcons.notePencil(), color: Colors.white),
            label: Text(context.tr('daily_log'), style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
          );
        },
      ),
    );
  }

  Widget _buildLoadedView(BuildContext context, ProjectDashboardLoaded state) {
    final colors = context.colors;
    final overview = state.overview;
    final logs = state.dailyLogs;

    return RefreshIndicator(
      onRefresh: () async {
        context.read<ProjectDashboardBloc>().add(LoadProjectDashboard(projectId));
      },
      color: colors.primaryBrand,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Overview KPI Cards
            _buildOverviewSection(context, overview),
            const SizedBox(height: 28),

            // Daily Logs
            Text(
              'السجلات اليومية',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: colors.textPrimary,
              ),
            ).animate(delay: 300.ms).fadeIn(),
            const SizedBox(height: 14),

            if (logs.isEmpty)
              _buildEmptyLogs(context)
            else
              ...logs.asMap().entries.map((entry) =>
                  _buildLogCard(context, entry.value, entry.key)),
          ],
        ),
      ),
    );
  }

  Widget _buildOverviewSection(BuildContext context, Map<String, dynamic> overview) {
    final colors = context.colors;

    final progress = (overview['progress'] as num?)?.toDouble() ?? 0;
    final fundingPercent = (overview['funding_percentage'] as num?)?.toDouble() ?? 0;
    final milestonesDone = overview['milestones_completed'] as int? ?? 0;
    final milestonesTotal = overview['milestones_total'] as int? ?? 0;
    final teamSize = overview['team_size'] as int? ?? 0;

    return Column(
      children: [
        // Progress + Funding
        Row(
          children: [
            Expanded(
              child: _KPICard(
                label: 'تقدم البناء',
                value: '${progress.toStringAsFixed(0)}%',
                icon: PhosphorIcons.trendUp(),
                color: colors.success,
                progress: progress / 100,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _KPICard(
                label: 'نسبة التمويل',
                value: '${fundingPercent.toStringAsFixed(0)}%',
                icon: PhosphorIcons.wallet(),
                color: colors.primaryBrand,
                progress: fundingPercent / 100,
              ),
            ),
          ],
        ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.1),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _KPICard(
                label: 'المراحل المنجزة',
                value: '$milestonesDone / $milestonesTotal',
                icon: PhosphorIcons.flag(),
                color: colors.goldFunding,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _KPICard(
                label: 'فريق العمل',
                value: '$teamSize',
                icon: PhosphorIcons.users(),
                color: colors.info,
              ),
            ),
          ],
        ).animate(delay: 200.ms).fadeIn(duration: 400.ms).slideY(begin: 0.1),
      ],
    );
  }

  Widget _buildEmptyLogs(BuildContext context) {
    final colors = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 24),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Column(
        children: [
          Icon(PhosphorIcons.fileText(), size: 48, color: colors.textSecondary.withAlpha(80)),
          const SizedBox(height: 12),
          Text(
            context.tr('no_daily_logs_yet'),
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: colors.textSecondary),
          ),
          const SizedBox(height: 4),
          Text(
            'اضغط الزر أدناه لإضافة أول سجل بناء',
            style: TextStyle(fontSize: 12, color: colors.textSecondary.withAlpha(150)),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    ).animate(delay: 400.ms).fadeIn();
  }

  Widget _buildLogCard(BuildContext context, Map<String, dynamic> log, int index) {
    final colors = context.colors;
    final description = log['description'] as String? ?? '';
    final workCompleted = log['work_completed'] as String?;
    final weatherConditions = log['weather_conditions'] as String?;
    final workersOnSite = log['workers_on_site'] as int?;
    final createdAt = log['created_at'] as String?;
    final images = (log['images'] as List<dynamic>?)?.cast<String>() ?? [];

    String dateLabel = '';
    if (createdAt != null) {
      try {
        final dt = DateTime.parse(createdAt);
        dateLabel = '${dt.day}/${dt.month}/${dt.year}';
      } catch (_) {}
    }

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
          // Header
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: colors.primaryBrand.withAlpha(15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(PhosphorIcons.article(), size: 18, color: colors.primaryBrand),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'سجل يومي #${index + 1}',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary),
                    ),
                    if (dateLabel.isNotEmpty)
                      Text(dateLabel, style: TextStyle(fontSize: 11, color: colors.textSubtle)),
                  ],
                ),
              ),
              // Metadata chips
              if (workersOnSite != null)
                _MetaChip(icon: PhosphorIcons.user(), label: '$workersOnSite', colors: colors),
              if (weatherConditions != null) ...[
                const SizedBox(width: 6),
                _MetaChip(icon: PhosphorIcons.cloud(), label: weatherConditions, colors: colors),
              ],
            ],
          ),
          const SizedBox(height: 12),
          // Description
          Text(
            description,
            style: TextStyle(fontSize: 13, color: colors.textPrimary, height: 1.5),
            maxLines: 4,
            overflow: TextOverflow.ellipsis,
          ),
          if (workCompleted != null && workCompleted.isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: colors.successLight,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(PhosphorIcons.checkCircle(), size: 16, color: colors.success),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      workCompleted,
                      style: TextStyle(fontSize: 12, color: colors.success, fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ),
          ],
          // Images
          if (images.isNotEmpty) ...[
            const SizedBox(height: 10),
            SizedBox(
              height: 64,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: images.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (_, i) => ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.network(
                    images[i],
                    width: 64,
                    height: 64,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => Container(
                      width: 64,
                      height: 64,
                      color: colors.backgroundSecondary,
                      child: Icon(PhosphorIcons.imageBroken(), color: colors.textSubtle, size: 24),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    ).animate(delay: (400 + index * 100).ms).fadeIn().slideY(begin: 0.05, end: 0);
  }

  void _showSubmitLogDialog(BuildContext context) {
    final colors = context.colors;
    final descController = TextEditingController();
    final workController = TextEditingController();
    final issuesController = TextEditingController();
    String weatherCondition = context.tr('weather_sunny');
    int workersOnSite = 1;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: colors.surfaceElevated,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Padding(
          padding: EdgeInsetsDirectional.fromSTEB(
            20,
            20,
            20,
            MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Handle
                BottomSheetGrabber(colors: colors),
                const SizedBox(height: 16),
                Text(
                  'إضافة سجل يومي',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.textPrimary),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),

                // Description
                _DialogTextField(
                  controller: descController,
                  label: 'وصف العمل اليومي *',
                  maxLines: 3,
                  colors: colors,
                ),
                const SizedBox(height: 14),

                // Work Completed
                _DialogTextField(
                  controller: workController,
                  label: 'الأعمال المنجزة',
                  colors: colors,
                ),
                const SizedBox(height: 14),

                // Issues
                _DialogTextField(
                  controller: issuesController,
                  label: 'مشاكل واجهت العمل (اختياري)',
                  colors: colors,
                ),
                const SizedBox(height: 14),

                // Weather
                Row(
                  children: [
                    Text(context.tr('weather'), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.textPrimary)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: DropdownButton<String>(
                        value: weatherCondition,
                        isExpanded: true,
                        dropdownColor: colors.surfaceElevated,
                        style: TextStyle(color: colors.textPrimary, fontSize: 13),
                        items: [context.tr('weather_sunny'), context.tr('weather_cloudy'), context.tr('weather_rainy'), context.tr('weather_windy'), context.tr('weather_snowy')]
                            .map((w) => DropdownMenuItem(value: w, child: Text(w)))
                            .toList(),
                        onChanged: (v) => setModalState(() => weatherCondition = v ?? weatherCondition),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                // Workers
                Row(
                  children: [
                    Text('عمال الموقع:', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.textPrimary)),
                    const Spacer(),
                    IconButton(
                      onPressed: () => setModalState(() => workersOnSite = (workersOnSite - 1).clamp(0, 999)),
                      icon: Icon(PhosphorIcons.minusCircle(), color: colors.textSecondary),
                    ),
                    Text('$workersOnSite', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
                    IconButton(
                      onPressed: () => setModalState(() => workersOnSite++),
                      icon: Icon(PhosphorIcons.plusCircle(), color: colors.primaryBrand),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // Submit
                ElevatedButton(
                  onPressed: () {
                    if (descController.text.trim().isEmpty) return;
                    context.read<ProjectDashboardBloc>().add(
                      SubmitDailyLog(
                        projectId: projectId,
                        description: descController.text.trim(),
                        workCompleted: workController.text.trim().isNotEmpty ? workController.text.trim() : null,
                        issuesEncountered: issuesController.text.trim().isNotEmpty ? issuesController.text.trim() : null,
                        weatherConditions: weatherCondition,
                        workersOnSite: workersOnSite,
                      ),
                    );
                    Navigator.pop(ctx);
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: colors.primaryBrand,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  child: Text(context.tr('submit_log'), style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildErrorView(BuildContext context, String message) {
    final colors = context.colors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(PhosphorIcons.warningCircle(), size: 64, color: colors.error),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center, style: TextStyle(color: colors.textPrimary, fontSize: 15)),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: () {
                context.read<ProjectDashboardBloc>().add(LoadProjectDashboard(projectId));
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: colors.primaryBrand,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: Text(context.tr('retry'), style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Helper Widgets ──────────────────────────────────────────────────────────

class _KPICard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final double? progress;

  const _KPICard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    this.progress,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: color.withAlpha(20),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, size: 16, color: color),
              ),
              const Spacer(),
              Text(
                value,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: colors.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(label, style: TextStyle(fontSize: 12, color: colors.textSecondary)),
          if (progress != null) ...[
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: progress!.clamp(0.0, 1.0),
                backgroundColor: colors.backgroundSecondary,
                valueColor: AlwaysStoppedAnimation<Color>(color),
                minHeight: 4,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final SemanticColors colors;

  const _MetaChip({required this.icon, required this.label, required this.colors});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: colors.backgroundSecondary,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: colors.textSubtle),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(fontSize: 11, color: colors.textSubtle)),
        ],
      ),
    );
  }
}

class _DialogTextField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final int maxLines;
  final SemanticColors colors;

  const _DialogTextField({
    required this.controller,
    required this.label,
    this.maxLines = 1,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      maxLines: maxLines,
      style: TextStyle(color: colors.textPrimary, fontSize: 14),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: TextStyle(color: colors.textSecondary, fontSize: 13),
        filled: true,
        fillColor: colors.backgroundSecondary,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colors.strokeSubtle),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colors.strokeSubtle),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colors.primaryBrand, width: 2),
        ),
      ),
    );
  }
}
