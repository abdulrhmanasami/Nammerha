import 'package:phosphor_flutter/phosphor_flutter.dart';
import '../../../core/widgets/error_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/shimmer_loader.dart';
import '../../../core/widgets/bottom_sheet_grabber.dart';
import '../../../core/i18n/t.dart';
import '../../../core/utils/format_utils.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../cart/state/cart_store.dart';
import '../../cart/screens/cart_screen.dart';
import '../../map/screens/project_map_screen.dart';
import '../bloc/marketplace_bloc.dart';
import '../bloc/marketplace_event.dart';
import '../bloc/marketplace_state.dart';
import '../data/marketplace_repository.dart';
import '../models/project_model.dart';
import 'project_details_screen.dart';
import '../../../core/utils/animation_budget.dart';

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
  final ScrollController _scrollController = ScrollController();

  /// P3-004: First-time welcome card visibility.
  /// Defaults to false (hidden) until SharedPreferences confirms first visit.
  bool _showWelcome = false;
  static const _welcomeKey = 'nm_marketplace_welcome_dismissed';

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _loadWelcomeState();
  }

  /// P3-004: Load welcome card visibility from SharedPreferences.
  Future<void> _loadWelcomeState() async {
    final prefs = await SharedPreferences.getInstance();
    final dismissed = prefs.getBool(_welcomeKey) ?? false;
    if (!dismissed && mounted) {
      setState(() => _showWelcome = true);
    }
  }

  /// P3-004: Dismiss welcome card and persist.
  Future<void> _dismissWelcome() async {
    setState(() => _showWelcome = false);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_welcomeKey, true);
  }

  @override
  void dispose() {
    _searchController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  /// Wave 4: Infinite scroll trigger — loads next page at 80% threshold.
  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent * 0.8) {
      context.read<MarketplaceBloc>().add(const LoadMoreProjectsEvent());
    }
  }

  // Centralized formatter via FormatUtils (Platinum Standard)
  String formatCurrency(num amount) => FormatUtils.currency(amount);

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
            tooltip: context.tr('filter_sort'), // P3-002: WCAG 4.1.2
            onPressed: () => _showFilterBottomSheet(context, colors),
          ),
          ListenableBuilder(
            listenable: CartStore.instance,
            builder: (context, _) {
              final count = CartStore.instance.items.length;
              // UX-REM-J008: Hide cart icon when empty — matches dashboard pattern.
              if (count == 0) return const SizedBox.shrink();
              return Stack(
                alignment: Alignment.center,
                children: [
                  IconButton(
                    icon: Icon(PhosphorIconsRegular.shoppingCart, color: colors.primaryBrand),
                    tooltip: context.tr('cart'), // P3-002: WCAG 4.1.2
                    onPressed: () {
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const CartScreen()));
                    },
                  ),
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
            return NammerhaErrorState(
              message: state.message,
              onRetry: () => context.read<MarketplaceBloc>().add(const LoadProjectsEvent()),
            );
          }

          if (state is MarketplaceLoaded && state.projects.isEmpty) {
            // P1-006 FIX: Differentiate "no results" (filter active) vs "truly empty" (no data).
            // Nielsen #9: Help users recognize, diagnose, and recover from errors.
            final bool isFiltered = state.allProjects.isNotEmpty;

            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      isFiltered ? PhosphorIconsRegular.funnel : PhosphorIconsRegular.magnifyingGlass,
                      size: 64,
                      color: colors.textSecondary,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      context.tr(isFiltered ? 'marketplace_empty_hint' : 'marketplace_no_projects_yet'),
                      style: TextStyle(color: colors.textSecondary, fontSize: 16),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 24),
                    if (isFiltered) ...[
                      // Primary CTA: Clear all filters to recover
                      ElevatedButton.icon(
                        onPressed: () {
                          _searchController.clear();
                          context.read<MarketplaceBloc>().add(const LoadProjectsEvent(isRefresh: true));
                        },
                        icon: const Icon(PhosphorIconsRegular.funnelSimple),
                        label: Text(context.tr('clear_filters')),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: colors.primaryBrand,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                      const SizedBox(height: 12),
                      // Secondary CTA: Browse all
                      TextButton.icon(
                        onPressed: () {
                          _searchController.clear();
                          context.read<MarketplaceBloc>().add(const LoadProjectsEvent(isRefresh: true));
                        },
                        icon: Icon(PhosphorIconsRegular.arrowsClockwise, color: colors.primaryBrand),
                        label: Text(context.tr('browse_all_projects'), style: TextStyle(color: colors.primaryBrand)),
                      ),
                    ] else ...[
                      // Truly empty — just offer refresh
                      ElevatedButton.icon(
                        onPressed: () => context.read<MarketplaceBloc>().add(const LoadProjectsEvent(isRefresh: true)),
                        icon: const Icon(PhosphorIconsRegular.arrowsClockwise),
                        label: Text(context.tr('browse_all_projects')),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: colors.primaryBrand,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            );
          }

          if (state is MarketplaceLoaded) {
            final welcomeOffset = _showWelcome ? 1 : 0;
            return RefreshIndicator(
              onRefresh: () async {
                context.read<MarketplaceBloc>().add(const LoadProjectsEvent(isRefresh: true));
                await Future.delayed(const Duration(milliseconds: 500));
              },
              color: colors.primaryBrand,
              child: ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsetsDirectional.fromSTEB(16, 8, 16, 20),
                // P3-004: +1 for welcome card, +1 for loading footer
                itemCount: state.projects.length + welcomeOffset + (state.isLoadingMore ? 1 : 0),
                itemBuilder: (context, index) {
                  // P3-004: Welcome card at position 0
                  if (_showWelcome && index == 0) {
                    return _buildWelcomeCard(context, colors);
                  }
                  final projectIndex = index - welcomeOffset;
                  // Loading footer
                  if (projectIndex >= state.projects.length) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      child: Center(
                        child: Text(
                          context.tr('loading_more'),
                          style: TextStyle(color: colors.textSecondary, fontSize: 13),
                        ),
                      ),
                    );
                  }
                  final project = state.projects[projectIndex];
                  return _buildProjectCard(context, project, colors, projectIndex);
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

  /// P3-004: First-time welcome card — explains marketplace context.
  /// Dismissible via close button → persisted to SharedPreferences.
  Widget _buildWelcomeCard(BuildContext context, SemanticColors colors) {
    return Semantics(
      label: context.tr('marketplace_welcome_title'),
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [colors.primaryBrand.withAlpha(20), colors.secondaryAccent.withAlpha(12)],
            begin: AlignmentDirectional.topStart,
            end: AlignmentDirectional.bottomEnd,
          ),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: colors.primaryBrand.withAlpha(40)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(PhosphorIconsRegular.lightbulb, size: 22, color: colors.primaryBrand),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    context.tr('marketplace_welcome_title'),
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: colors.textPrimary),
                  ),
                ),
                GestureDetector(
                  onTap: _dismissWelcome,
                  child: Semantics(
                    button: true,
                    label: context.tr('marketplace_welcome_dismiss'),
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        color: colors.textSubtle.withAlpha(20),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(PhosphorIconsRegular.x, size: 16, color: colors.textSubtle),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _welcomeBullet(context, colors, PhosphorIconsRegular.buildings, 'marketplace_welcome_bullet_1'),
            const SizedBox(height: 10),
            _welcomeBullet(context, colors, PhosphorIconsRegular.chartBar, 'marketplace_welcome_bullet_2'),
            const SizedBox(height: 10),
            _welcomeBullet(context, colors, PhosphorIconsRegular.handTap, 'marketplace_welcome_bullet_3'),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: _dismissWelcome,
                style: TextButton.styleFrom(
                  backgroundColor: colors.primaryBrand.withAlpha(15),
                  foregroundColor: colors.primaryBrand,
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: Text(
                  context.tr('marketplace_welcome_dismiss'),
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: colors.primaryBrand),
                ),
              ),
            ),
          ],
        ),
      ),
    ).nmAnimate(context).fadeIn(duration: 400.ms).slideY(begin: -0.03);
  }

  Widget _welcomeBullet(BuildContext context, SemanticColors colors, IconData icon, String key) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsetsDirectional.only(top: 2),
          child: Icon(icon, size: 16, color: colors.primaryBrand.withAlpha(180)),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            context.tr(key),
            style: TextStyle(fontSize: 13, color: colors.textSecondary, height: 1.5),
          ),
        ),
      ],
    );
  }

  Widget _buildProjectCard(BuildContext context, ProjectModel project, SemanticColors colors, int index) {
    return Semantics(
      // P3-002: WCAG 4.1.2 — screen reader announces project title, location, funding
      label: '${project.title}, ${project.addressText}, ${formatCurrency(project.totalEstimatedCost)}, ${project.fundedPercentage.toStringAsFixed(0)}%',
      child: Container(
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
                            enableHero: true, // P3-003: marketplace has source Heroes
                          ),
                        ));
                      },
                      icon: Icon(PhosphorIconsRegular.heart, size: 18),
                      label: Text(context.tr('view_details')),
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
      ),
    )
    .nmAnimate(context, delay: (100 + index * 80).ms)
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
                  _filterChip(context, context.tr('filter_all'), 'all', colors),
                  _filterChip(context, context.tr('filter_active'), 'active', colors),
                  _filterChip(context, context.tr('filter_completed'), 'completed', colors),
                ],
              ),
              const SizedBox(height: 24),
              Text(context.tr('funding_ratio'), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.textSecondary)),
              const SizedBox(height: 10),
              Wrap(
                spacing: 10,
                children: [
                  _sortChip(context, context.tr('sort_highest_funding'), 'highest_funding', colors),
                  _sortChip(context, context.tr('sort_lowest_funding'), 'lowest_funding', colors),
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
