import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/semantic_colors.dart';
import '../bloc/marketplace_bloc.dart';
import '../bloc/marketplace_event.dart';
import '../bloc/marketplace_state.dart';
import '../data/marketplace_repository.dart';
import '../models/project_model.dart';
import 'project_details_screen.dart';

class MarketplaceScreen extends StatelessWidget {
  const MarketplaceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => MarketplaceBloc(repository: MarketplaceRepository())..add(const LoadProjectsEvent()),
      child: const MarketplaceView(),
    );
  }
}

class MarketplaceView extends StatelessWidget {
  const MarketplaceView({super.key});

  // Fallback formatter instead of importing the internal wallet formatter logic directly
  String formatCurrency(num amount) {
    if (amount >= 1000000) {
      return '${(amount / 1000000).toStringAsFixed(1)}M ل.س';
    } else if (amount >= 1000) {
      return '${(amount / 1000).toStringAsFixed(0)}k ل.س';
    }
    return '${amount.toStringAsFixed(0)} ل.س';
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: const Text('مشاريع إعادة الإعمار'),
        actions: [
          IconButton(
            icon: Icon(Icons.filter_list_rounded, color: colors.primaryBrand),
            onPressed: () => _showFilterBottomSheet(context, colors),
          ),
        ],
      ),
      body: BlocBuilder<MarketplaceBloc, MarketplaceState>(
        builder: (context, state) {
          if (state is MarketplaceLoading || state is MarketplaceInitial) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircularProgressIndicator(color: colors.primaryBrand),
                  const SizedBox(height: 16),
                  Text('جارٍ تحميل المشاريع...', style: TextStyle(color: colors.textSecondary)),
                ],
              ),
            );
          }

          if (state is MarketplaceError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.cloud_off_rounded, size: 64, color: colors.textSecondary),
                    const SizedBox(height: 16),
                    Text(state.message, style: TextStyle(color: colors.error, fontSize: 16), textAlign: TextAlign.center),
                    const SizedBox(height: 20),
                    ElevatedButton.icon(
                      onPressed: () => context.read<MarketplaceBloc>().add(const LoadProjectsEvent()),
                      icon: const Icon(Icons.refresh_rounded),
                      label: const Text('إعادة المحاولة'),
                      style: ElevatedButton.styleFrom(backgroundColor: colors.primaryBrand),
                    ),
                  ],
                ),
              ),
            );
          }

          if (state is MarketplaceLoaded && state.projects.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.construction_rounded, size: 64, color: colors.textSecondary),
                  const SizedBox(height: 16),
                  Text('لا توجد مشاريع حالياً', style: TextStyle(color: colors.textSecondary, fontSize: 16)),
                ],
              ),
            );
          }

          if (state is MarketplaceLoaded) {
            return RefreshIndicator(
              onRefresh: () async {
                context.read<MarketplaceBloc>().add(const LoadProjectsEvent(isRefresh: true));
                // Await a short delay to satisfy the refresh indicator contract, real network is monitored by BLoC
                await Future.delayed(const Duration(milliseconds: 500));
              },
              color: colors.primaryBrand,
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
                itemCount: state.projects.length,
                itemBuilder: (context, index) {
                  final project = state.projects[index];
                  return _buildProjectCard(context, project, colors, index);
                },
              ),
            );
          }

          return const SizedBox.shrink();
        },
      ),
    );
  }

  Widget _buildProjectCard(BuildContext context, ProjectModel project, SemanticColors colors, int index) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colors.strokeSubtle),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(6),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header image placeholder with damage type badge
          Container(
            height: 120,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [colors.primaryBrand.withAlpha(40), colors.primaryBrand.withAlpha(15)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: Stack(
              children: [
                Center(child: Icon(Icons.home_work_rounded, size: 48, color: colors.primaryBrand.withAlpha(60))),
                PositionedDirectional(
                  top: 10, end: 10,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: colors.surfaceElevated.withAlpha(230),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(project.damageType, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: colors.primaryBrand)),
                  ),
                ),
                if (project.status == 'ACTIVE')
                  PositionedDirectional(
                    top: 10, start: 10,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: colors.success,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text('نشط', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white)),
                    ),
                  ),
              ],
            ),
          ),

          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  project.title,
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary),
                  maxLines: 2, overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Icon(Icons.location_on_rounded, size: 14, color: colors.textSecondary),
                    const SizedBox(width: 4),
                    Text(project.addressText, style: TextStyle(fontSize: 12, color: colors.textSecondary)),
                  ],
                ),
                const SizedBox(height: 14),

                // Funding progress
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      formatCurrency(project.totalEstimatedCost),
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: colors.primaryBrand),
                    ),
                    Text(
                      '${project.fundedPercentage.toStringAsFixed(1)}%',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.success),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: LinearProgressIndicator(
                    value: (project.fundedPercentage / 100).clamp(0.0, 1.0),
                    minHeight: 8,
                    backgroundColor: colors.strokeSubtle,
                    color: project.fundedPercentage > 75 ? colors.success : colors.primaryBrand,
                  ),
                ),

                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      Navigator.push(context, MaterialPageRoute(
                        builder: (_) => ProjectDetailsScreen(
                          projectId: project.id,
                          projectTitle: project.title,
                        ),
                      ));
                    },
                    icon: const Icon(Icons.volunteer_activism_rounded, size: 18),
                    label: const Text('ادعم هذا المشروع'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: colors.primaryBrand,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    )
    .animate(delay: (100 + index * 80).ms)
    .fadeIn()
    .slideY(begin: 0.05, end: 0);
  }

  void _showFilterBottomSheet(BuildContext context, SemanticColors colors) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) {
        return Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: colors.surfaceElevated,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('فرز وتصفية', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: colors.textPrimary)),
              const SizedBox(height: 20),
              Text('حالة المشروع', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.textSecondary)),
              const SizedBox(height: 10),
              Wrap(
                spacing: 10,
                children: [
                  _filterChip(context, 'الكل', 'all', colors),
                  _filterChip(context, 'نشط', 'active', colors),
                  _filterChip(context, 'مكتمل', 'completed', colors),
                ],
              ),
              const SizedBox(height: 24),
              Text('نسبة التمويل', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.textSecondary)),
              const SizedBox(height: 10),
              Wrap(
                spacing: 10,
                children: [
                  _sortChip(context, 'الأعلى تمويلاً', 'highest_funding', colors),
                  _sortChip(context, 'الأقل تمويلاً', 'lowest_funding', colors),
                ],
              ),
              SizedBox(height: MediaQuery.of(context).padding.bottom + 20),
            ],
          ),
        );
      },
    );
  }

  Widget _filterChip(BuildContext context, String label, String filterValue, SemanticColors colors) {
    final bloc = context.read<MarketplaceBloc>();
    final state = bloc.state;
    final isActive = state is MarketplaceLoaded && (state.activeFilter == filterValue || (state.activeFilter == null && filterValue == 'all'));

    return ChoiceChip(
      label: Text(label),
      selected: isActive,
      onSelected: (selected) {
        if (selected) {
          final currentSort = state is MarketplaceLoaded ? state.activeSort : null;
          bloc.add(FilterProjectsEvent(filter: filterValue, sort: currentSort));
          Navigator.pop(context);
        }
      },
      selectedColor: colors.primaryBrand.withAlpha(40),
      labelStyle: TextStyle(color: isActive ? colors.primaryBrand : colors.textPrimary, fontWeight: isActive ? FontWeight.bold : FontWeight.normal),
    );
  }

  Widget _sortChip(BuildContext context, String label, String sortValue, SemanticColors colors) {
    final bloc = context.read<MarketplaceBloc>();
    final state = bloc.state;
    final isActive = state is MarketplaceLoaded && state.activeSort == sortValue;

    return ChoiceChip(
      label: Text(label),
      selected: isActive,
      onSelected: (selected) {
        final currentFilter = state is MarketplaceLoaded ? state.activeFilter : null;
        bloc.add(FilterProjectsEvent(filter: currentFilter, sort: selected ? sortValue : null));
        Navigator.pop(context);
      },
      selectedColor: colors.primaryBrand.withAlpha(40),
      labelStyle: TextStyle(color: isActive ? colors.primaryBrand : colors.textPrimary, fontWeight: isActive ? FontWeight.bold : FontWeight.normal),
    );
  }
}
