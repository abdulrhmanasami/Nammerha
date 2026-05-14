import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/shimmer_loader.dart';
import '../../../core/widgets/bottom_sheet_grabber.dart';
import '../../../core/i18n/t.dart';
import '../../cart/state/cart_store.dart';
import '../../cart/screens/cart_screen.dart';
import '../../map/screens/project_map_screen.dart';
import '../bloc/marketplace_bloc.dart';
import '../bloc/marketplace_event.dart';
import '../bloc/marketplace_state.dart';
import '../data/marketplace_repository.dart';
import '../models/project_model.dart';
import 'project_details_screen.dart';

// UX-F022 FIX: Accept optional initialFilter to differentiate Bento Grid card destinations.
class MarketplaceScreen extends StatelessWidget {
  final String? initialFilter;
  const MarketplaceScreen({super.key, this.initialFilter});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) {
        final bloc = MarketplaceBloc(repository: MarketplaceRepository())..add(const LoadProjectsEvent());
        // UX-F022 FIX: Apply initial filter from Bento Grid navigation.
        if (initialFilter != null) {
          bloc.add(FilterProjectsEvent(filter: initialFilter));
        }
        return bloc;
      },
      child: const MarketplaceView(),
    );
  }
}

class MarketplaceView extends StatefulWidget {
  const MarketplaceView({super.key});

  @override
  State<MarketplaceView> createState() => _MarketplaceViewState();
}

class _MarketplaceViewState extends State<MarketplaceView> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

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
        title: Text(context.tr('browse_projects')),
        actions: [
          IconButton(
            icon: Icon(PhosphorIconsRegular.faders, color: colors.primaryBrand),
            onPressed: () => _showFilterBottomSheet(context, colors),
          ),
          ListenableBuilder(
            listenable: CartStore.instance,
            builder: (context, _) {
              final count = CartStore.instance.items.length;
              return Stack(
                alignment: Alignment.center,
                children: [
                  IconButton(
                    icon: Icon(PhosphorIconsRegular.shoppingCart, color: colors.primaryBrand),
                    onPressed: () {
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const CartScreen()));
                    },
                  ),
                  if (count > 0)
                    PositionedDirectional(
                      top: 8,
                      end: 8,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: colors.error,
                          shape: BoxShape.circle,
                        ),
                        child: Text(
                          '$count',
                          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
          const SizedBox(width: 8),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          Navigator.push(context, MaterialPageRoute(builder: (_) => const ProjectMapScreen()));
        },
        backgroundColor: colors.primaryBrand,
        icon: Icon(PhosphorIconsRegular.mapTrifold, color: Colors.white),
        label: Text(context.tr('map_of_projects'), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: Column(
        children: [
          // Search Bar
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(16, 12, 16, 0),
            child: TextField(
              controller: _searchController,
              onChanged: (value) {
                context.read<MarketplaceBloc>().add(FilterProjectsEvent(searchQuery: value));
              },
              decoration: InputDecoration(
                hintText: context.tr('search_projects_hint'),
                prefixIcon: Icon(PhosphorIconsRegular.magnifyingGlass, color: colors.textSecondary),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: Icon(PhosphorIconsRegular.xCircle, color: colors.textSecondary),
                        onPressed: () {
                          _searchController.clear();
                          context.read<MarketplaceBloc>().add(const FilterProjectsEvent(searchQuery: ''));
                        },
                      )
                    : null,
                filled: true,
                fillColor: colors.surfaceElevated,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide(color: colors.strokeSubtle),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide(color: colors.strokeSubtle),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide(color: colors.primaryBrand),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: BlocBuilder<MarketplaceBloc, MarketplaceState>(
              builder: (context, state) {
          if (state is MarketplaceLoading || state is MarketplaceInitial) {
            return NammerhaShimmerLoader(colors: colors, itemCount: 3);
          }

          if (state is MarketplaceError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(PhosphorIconsRegular.cloudSlash, size: 64, color: colors.textSecondary),
                    const SizedBox(height: 16),
                    Text(state.message, style: TextStyle(color: colors.error, fontSize: 16), textAlign: TextAlign.center),
                    const SizedBox(height: 20),
                    ElevatedButton.icon(
                      onPressed: () => context.read<MarketplaceBloc>().add(const LoadProjectsEvent()),
                      icon: Icon(PhosphorIconsRegular.arrowsClockwise),
                      label: Text(context.tr('retry')),
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
                  Icon(PhosphorIconsRegular.wrench, size: 64, color: colors.textSecondary),
                  const SizedBox(height: 16),
                  Text(context.tr('no_data'), style: TextStyle(color: colors.textSecondary, fontSize: 16)),
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
                padding: const EdgeInsetsDirectional.fromSTEB(16, 8, 16, 20),
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
    ),
  ],
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
          // UX-F028: Hero shared element — gradient header morphs into details page header.
          // Tag uses project.id to uniquely pair source ↔ destination.
          Hero(
            tag: 'project_header_${project.id}',
            child: Container(
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
                  Center(child: Icon(PhosphorIconsRegular.buildings, size: 48, color: colors.primaryBrand.withAlpha(60))),
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
                        child: Text(context.tr('active'), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white)),
                      ),
                    ),
                ],
              ),
            ),
          ),

          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // UX-F028: Hero shared element — title morphs into details AppBar title.
                // Material(type: transparency) prevents background flash during flight.
                Hero(
                  tag: 'project_title_${project.id}',
                  child: Material(
                    type: MaterialType.transparency,
                    child: Text(
                      project.title,
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary),
                      maxLines: 2, overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Icon(PhosphorIconsRegular.mapPin, size: 14, color: colors.textSecondary),
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
                    icon: Icon(PhosphorIconsRegular.heart, size: 18),
                    label: Text(context.tr('browse_projects')),
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
              BottomSheetGrabber(colors: colors),
              Text(context.tr('filter_sort'), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: colors.textPrimary)),
              const SizedBox(height: 20),
              Text(context.tr('project_status'), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.textSecondary)),
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
              Text(context.tr('funding_ratio'), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.textSecondary)),
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
