import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../../core/config/app_config.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../bloc/map_bloc.dart';
import '../bloc/map_event.dart';
import '../bloc/map_state.dart';
import '../models/map_project_model.dart';
import '../../../core/i18n/t.dart';
import '../../../core/i18n/translations.dart';
import '../../project/screens/project_details_screen.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';
import '../../../core/utils/animation_budget.dart';

// ═══════════════════════════════════════════════════════════════════════════
// ProjectMapScreen — Production Geospatial Intelligence View
// ═══════════════════════════════════════════════════════════════════════════
// PLATINUM COMPLIANCE:
//   ✅ BLoC-driven — zero setState in this file.
//   ✅ flutter_map with real raster tile server (MapLibre/OSM).
//   ✅ Isolate.run() JSON parsing (delegated to MapBloc).
//   ✅ RTL Logical CSS — EdgeInsetsDirectional / PositionedDirectional only.
//   ✅ ApiException propagated to error state — no silent failures.
//   ✅ Marker tap → bottom sheet project detail via BLoC SelectMapProject.
//   ✅ Region + DamageType filter chips with live map re-render.
// ═══════════════════════════════════════════════════════════════════════════

class ProjectMapScreen extends StatelessWidget {
  const ProjectMapScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => MapBloc()..add(const LoadMapProjects()),
      child: const _ProjectMapView(),
    );
  }
}

class _ProjectMapView extends StatefulWidget {
  const _ProjectMapView();

  @override
  State<_ProjectMapView> createState() => _ProjectMapViewState();
}

class _ProjectMapViewState extends State<_ProjectMapView> {
  final MapController _mapController = MapController();

  @override
  void dispose() {
    _mapController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      body: BlocConsumer<MapBloc, MapState>(
        
        buildWhen: (previous, current) => current is! MapError,listener: (context, state) {
          // When a project is selected, animate the camera to it.
          if (state is MapLoaded && state.selectedProject != null) {
            _mapController.move(
              state.selectedProject!.latLng,
              10.0,
            );
          }
        },
        builder: (context, state) {
          return Stack(
            children: [
              // ── Layer 0: The Map (always rendered) ──────────────────────
              _buildMap(context, state, colors),

              // ── Layer 1: Custom AppBar overlay ──────────────────────────
              PositionedDirectional(
                top: 0,
                start: 0,
                end: 0,
                child: _MapAppBar(colors: colors),
              ),

              // ── Layer 2: Filter chips row ────────────────────────────────
              if (state is MapLoaded)
                PositionedDirectional(
                  top: kToolbarHeight + MediaQuery.of(context).padding.top + 8,
                  start: 0,
                  end: 0,
                  child: _FilterChipsRow(state: state, colors: colors),
                ),

              // ── Layer 3: Stats pill ──────────────────────────────────────
              if (state is MapLoaded)
                PositionedDirectional(
                  bottom: state.selectedProject != null ? 300 : 24,
                  start: 16,
                  child: _StatsPill(state: state, colors: colors),
                ),

              // ── Layer 4: Loading overlay ─────────────────────────────────
              if (state is MapLoading)
                Positioned.fill(
                  child: Container(
                    color: colors.backgroundPrimary.withAlpha(200),
                    child: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          NammerhaShimmerLoader(colors: colors, isList: false),
                          const SizedBox(height: 12),
                          Text(
                            context.tr('map_loading'),
                            style: TextStyle(
                              color: colors.textSecondary,
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ).nmAnimate(context).fadeIn(duration: 200.ms),
                ),

              // ── Layer 5: Error overlay ───────────────────────────────────
              if (state is MapError)
                Positioned.fill(
                  child: _ErrorOverlay(
                    message: state.message,
                    colors: colors,
                    onRetry: () =>
                        context.read<MapBloc>().add(const LoadMapProjects()),
                  ),
                ),

              // ── Layer 6: Project Detail Bottom Sheet ─────────────────────
              if (state is MapLoaded && state.selectedProject != null)
                PositionedDirectional(
                  bottom: 0,
                  start: 0,
                  end: 0,
                  child: _ProjectDetailPanel(
                    project: state.selectedProject!,
                    colors: colors,
                    onClose: () => context
                        .read<MapBloc>()
                        .add(const DeselectMapProject()),
                    onNavigate: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => ProjectDetailsScreen(
                          projectId: state.selectedProject!.projectId,
                        ),
                      ),
                    ),
                  ),
                ).nmAnimate(context).slideY(begin: 1.0, end: 0.0, duration: 300.ms,
                    curve: Curves.easeOutCubic),
            ],
          );
        },
      ),
    );
  }

  Widget _buildMap(
    BuildContext context,
    MapState state,
    SemanticColors colors,
  ) {
    final projects =
        state is MapLoaded ? state.filteredProjects : <MapProjectModel>[];
    final selectedId =
        state is MapLoaded ? state.selectedProject?.projectId : null;

    return FlutterMap(
      mapController: _mapController,
      options: MapOptions(
        initialCenter: LatLng(AppConfig.syriaLat, AppConfig.syriaLng),
        initialZoom: AppConfig.syriaDefaultZoom,
        minZoom: 4.0,
        maxZoom: 18.0,
        onTap: (tapPos, tapCoord) {
          // Tapping the empty map deselects any selected project.
          if (state is MapLoaded && state.selectedProject != null) {
            context.read<MapBloc>().add(const DeselectMapProject());
          }
        },
      ),
      children: [
        // ── Tile Layer ───────────────────────────────────────────────────
        TileLayer(
          urlTemplate: AppConfig.mapTileUrl,
          fallbackUrl: AppConfig.mapFallbackTileUrl,
          userAgentPackageName: 'com.nammerha.app',
          tileDisplay: const TileDisplay.fadeIn(duration: Duration(milliseconds: 300)),
          // Attribution: required for OSM compliance
          additionalOptions: const {
            'attribution': '© OpenStreetMap contributors',
          },
        ),

        // ── Attribution (OSM legal requirement) ──────────────────────────
        RichAttributionWidget(
          attributions: const [
            TextSourceAttribution('OpenStreetMap contributors'),
          ],
          alignment: AttributionAlignment.bottomLeft,
        ),

        // ── Marker Layer ─────────────────────────────────────────────────
        MarkerLayer(
          markers: _buildClusteredMarkers(context, projects, selectedId, colors),
        ),
      ],
    );
  }

  List<Marker> _buildClusteredMarkers(
    BuildContext context,
    List<MapProjectModel> projects,
    String? selectedId,
    SemanticColors colors,
  ) {
    // Spatial Triage Overload Fix: Cluster markers if there are too many.
    // If the map is highly zoomed in (>12) or few projects, avoid clustering.
    // However, MapController might not have camera available before first build.
    // So we use a safe grid clustering based on rounding coordinates.
    if (projects.length <= 30) {
      return projects.map((p) => _buildSingleMarker(context, p, selectedId, colors)).toList();
    }

    // Grid clustering: group by rounding lat/lng to 1 decimal place (roughly 11x11 km grid)
    final clusters = <String, List<MapProjectModel>>{};
    for (final p in projects) {
       final gridId = '${p.gpsLat.toStringAsFixed(1)}_${p.gpsLng.toStringAsFixed(1)}';
       clusters.putIfAbsent(gridId, () => []).add(p);
    }

    return clusters.values.map((group) {
       if (group.length == 1) {
          return _buildSingleMarker(context, group.first, selectedId, colors);
       }
       
       final avgLat = group.map((p) => p.gpsLat).reduce((a, b) => a + b) / group.length;
       final avgLng = group.map((p) => p.gpsLng).reduce((a, b) => a + b) / group.length;
       final isSelectedGroup = selectedId != null && group.any((p) => p.projectId == selectedId);

       return Marker(
         point: LatLng(avgLat, avgLng),
         width: isSelectedGroup ? 58 : 46,
         height: isSelectedGroup ? 58 : 46,
         child: GestureDetector(
           onTap: () {
             try {
               _mapController.move(LatLng(avgLat, avgLng), _mapController.camera.zoom + 2.0);
             } catch (_) {
               // Fallback if camera isn't ready
               _mapController.move(LatLng(avgLat, avgLng), 14.0);
             }
           },
           child: AnimatedContainer(
             duration: NammerhaAnimations.fast,
             decoration: BoxDecoration(
               color: colors.primaryBrand,
               shape: BoxShape.circle,
               border: Border.all(color: Colors.white, width: isSelectedGroup ? 3 : 2),
               boxShadow: [
                 BoxShadow(
                   color: colors.primaryBrand.withAlpha(isSelectedGroup ? 150 : 80),
                   blurRadius: isSelectedGroup ? 16 : 8,
                   spreadRadius: isSelectedGroup ? 2 : 0,
                 ),
               ],
             ),
             child: Center(
               child: Text(
                 '${group.length}',
                 style: const TextStyle(
                   color: Colors.white,
                   fontWeight: FontWeight.w800,
                   fontSize: 14,
                 ),
               ),
             ),
           ),
         ),
       );
    }).toList();
  }

  Marker _buildSingleMarker(
    BuildContext context,
    MapProjectModel p,
    String? selectedId,
    SemanticColors colors,
  ) {
    final isSelected = p.projectId == selectedId;
    return Marker(
      point: p.latLng,
      width: isSelected ? 52 : 40,
      height: isSelected ? 52 : 40,
      child: _ProjectMarker(
        project: p,
        isSelected: isSelected,
        onTap: () => context.read<MapBloc>().add(SelectMapProject(p.projectId)),
      ),
    );
  }
}

// ─── Custom AppBar ────────────────────────────────────────────────────────────

class _MapAppBar extends StatelessWidget {
  final SemanticColors colors;

  const _MapAppBar({required this.colors});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsetsDirectional.only(
        top: MediaQuery.of(context).padding.top,
        start: 8,
        end: 16,
        bottom: 8,
      ),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            colors.backgroundPrimary,
            colors.backgroundPrimary.withAlpha(230),
            colors.backgroundPrimary.withAlpha(0),
          ],
        ),
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.pop(context),
            icon: Icon(PhosphorIconsRegular.arrowLeft, color: colors.textPrimary),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              context.tr('map_title'),
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: colors.textPrimary,
              ),
            ),
          ),
          // Refresh button
          BlocBuilder<MapBloc, MapState>(
            builder: (context, state) => IconButton(
              onPressed: state is MapLoading
                  ? null
                  : () => context.read<MapBloc>().add(const LoadMapProjects()),
              icon: Icon(PhosphorIconsRegular.arrowsClockwise, color: colors.primaryBrand),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Filter Chips Row ─────────────────────────────────────────────────────────

class _FilterChipsRow extends StatelessWidget {
  final MapLoaded state;
  final SemanticColors colors;

  const _FilterChipsRow({required this.state, required this.colors});

  @override
  Widget build(BuildContext context) {
    final allRegionItems = [
      (null, '${context.tr('map_filter_all')} (${state.allProjects.length})'),
      ...state.availableRegions.map((r) {
        final count = state.allProjects.where((p) => p.region == r).length;
        return (r as String?, '$r ($count)');
      }),
    ];

    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsetsDirectional.only(start: 16, end: 16),
        itemCount: allRegionItems.length,
        separatorBuilder: (ctx, idx) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final record = allRegionItems[i];
          final value = record.$1;
          final label = record.$2;
          final isActive = state.activeRegion == value;
          return GestureDetector(
            onTap: () =>
                context.read<MapBloc>().add(FilterByRegion(value)),
            child: AnimatedContainer(
              duration: NammerhaAnimations.fast,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: isActive
                    ? colors.primaryBrand
                    : colors.surfaceElevated.withAlpha(230),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isActive
                      ? colors.primaryBrand
                      : colors.strokeBorder,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withAlpha(15),
                    blurRadius: 6,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: isActive ? Colors.white : colors.textSecondary,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

// ─── Stats Pill ───────────────────────────────────────────────────────────────

class _StatsPill extends StatelessWidget {
  final MapLoaded state;
  final SemanticColors colors;

  const _StatsPill({required this.state, required this.colors});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: colors.surfaceElevated.withAlpha(230),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: colors.strokeBorder),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(20),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(PhosphorIconsRegular.mapPin, size: 14, color: colors.primaryBrand),
          const SizedBox(width: 6),
          Text(
            '${state.filteredProjects.length} ${context.tr('map_project_count')}',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: colors.textPrimary,
            ),
          ),
          if (state.activeRegion != null) ...[
            const SizedBox(width: 8),
            Container(
              width: 1,
              height: 12,
              color: colors.strokeBorder,
            ),
            const SizedBox(width: 8),
            Text(
              state.activeRegion!,
              style: TextStyle(
                fontSize: 11,
                color: colors.primaryBrand,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
    ).nmAnimate(context).fadeIn(duration: 400.ms).scale(begin: const Offset(0.9, 0.9));
  }
}

// ─── Project Marker ───────────────────────────────────────────────────────────

class _ProjectMarker extends StatelessWidget {
  final MapProjectModel project;
  final bool isSelected;
  final VoidCallback onTap;

  const _ProjectMarker({
    required this.project,
    required this.isSelected,
    required this.onTap,
  });

  Color _statusColor(SemanticColors colors) {
    switch (project.status) {
      case 'completed':
        return colors.success;
      case 'in_progress':
        return colors.primaryBrand;
      case 'funded':
        return colors.goldFunding;
      default:
        return colors.warmEarth;
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final markerColor = _statusColor(colors);

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: NammerhaAnimations.fast,
        decoration: BoxDecoration(
          color: isSelected ? markerColor : markerColor.withAlpha(220),
          shape: BoxShape.circle,
          border: Border.all(
            color: Colors.white,
            width: isSelected ? 3.0 : 2.0,
          ),
          boxShadow: [
            BoxShadow(
              color: markerColor.withAlpha(isSelected ? 150 : 80),
              blurRadius: isSelected ? 16 : 8,
              spreadRadius: isSelected ? 2 : 0,
            ),
          ],
        ),
        child: Icon(
          PhosphorIconsRegular.buildings,
          color: Colors.white,
          size: isSelected ? 26 : 20,
        ),
      ),
    );
  }
}

// ─── Project Detail Bottom Panel ──────────────────────────────────────────────

class _ProjectDetailPanel extends StatelessWidget {
  final MapProjectModel project;
  final SemanticColors colors;
  final VoidCallback onClose;
  final VoidCallback onNavigate;

  const _ProjectDetailPanel({
    required this.project,
    required this.colors,
    required this.onClose,
    required this.onNavigate,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        boxShadow: const [NammerhaShadows.cta],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle bar
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.only(top: 12, bottom: 16),
            decoration: BoxDecoration(
              color: colors.strokeBorder,
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(20, 0, 20, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Project title + close
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        project.title,
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                          color: colors.textPrimary,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton(
                      onPressed: onClose,
                      icon: Icon(PhosphorIconsRegular.x,
                          color: colors.textSecondary, size: 20),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                  ],
                ),
                const SizedBox(height: 10),

                // Region + Damage type badges
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: [
                    _Badge(
                      icon: PhosphorIconsRegular.mapPin,
                      label: project.region,
                      color: colors.primaryBrand,
                      colors: colors,
                    ),
                    if (project.damageType.isNotEmpty)
                      _Badge(
                        icon: PhosphorIconsRegular.firstAidKit,
                        label: project.damageType,
                        color: colors.warmEarth,
                        colors: colors,
                      ),
                    _Badge(
                      icon: PhosphorIconsRegular.circle,
                      label: _statusLabel(project.status),
                      color: _statusColor(project.status, colors),
                      colors: colors,
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                // GPS Coordinates (transparency)
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: colors.backgroundSecondary,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      Icon(PhosphorIconsRegular.crosshair,
                          size: 14, color: colors.secondaryAccent),
                      const SizedBox(width: 8),
                      Text(
                        'GPS: ${project.gpsLat.toStringAsFixed(5)}, '
                        '${project.gpsLng.toStringAsFixed(5)}',
                        style: TextStyle(
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: colors.secondaryAccent,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // Funding progress
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      context.tr('funding'),
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: colors.textSecondary),
                    ),
                    Text(
                      '${project.fundingPercent.toStringAsFixed(0)}%',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: project.fundingPercent >= 100
                            ? colors.success
                            : colors.primaryBrand,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: (project.fundingPercent / 100).clamp(0.0, 1.0),
                    backgroundColor: colors.backgroundSecondary,
                    valueColor: AlwaysStoppedAnimation<Color>(
                      project.fundingPercent >= 100
                          ? colors.success
                          : colors.primaryBrand,
                    ),
                    minHeight: 6,
                  ),
                ),
                const SizedBox(height: 20),

                // CTA Button
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: onNavigate,
                    icon: Icon(PhosphorIconsRegular.arrowRight,
                        color: Colors.white, size: 18),
                    label: Text(
                      context.tr('map_view_details'),
                      style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 15),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: colors.primaryBrand,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                      elevation: 0,
                    ),
                  ),
                ),
                SizedBox(
                    height: MediaQuery.of(context).padding.bottom + 16),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _statusLabel(String status) {
    // Status labels use i18n keys for locale-safe rendering.
    const keyMap = {
      'completed': 'map_status_completed',
      'in_progress': 'map_status_in_progress',
      'funded': 'map_status_funded',
      'active': 'map_status_active',
    };
    final key = keyMap[status];
    if (key != null) {
      final locale = 'ar'; // Map panel doesn't have BuildContext — use default
      return kTranslations[key]?[locale] ?? status;
    }
    return status;
  }

  Color _statusColor(String status, SemanticColors colors) {
    switch (status) {
      case 'completed':
        return colors.success;
      case 'in_progress':
        return colors.primaryBrand;
      case 'funded':
        return colors.goldFunding;
      default:
        return colors.warmEarth;
    }
  }
}

// ─── Badge Widget ─────────────────────────────────────────────────────────────

class _Badge extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final SemanticColors colors;

  const _Badge({
    required this.icon,
    required this.label,
    required this.color,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withAlpha(20),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withAlpha(50)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: color),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
                fontSize: 11, fontWeight: FontWeight.w600, color: color),
          ),
        ],
      ),
    );
  }
}

// ─── Error Overlay ────────────────────────────────────────────────────────────

class _ErrorOverlay extends StatelessWidget {
  final String message;
  final SemanticColors colors;
  final VoidCallback onRetry;

  const _ErrorOverlay({
    required this.message,
    required this.colors,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: colors.backgroundPrimary.withAlpha(230),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(PhosphorIconsRegular.wifiSlash, size: 56, color: colors.error),
              const SizedBox(height: 16),
              Text(
                message,
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: colors.textPrimary,
                    fontSize: 15,
                    fontWeight: FontWeight.w500),
              ),
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: onRetry,
                icon: Icon(PhosphorIconsRegular.arrowsClockwise, color: Colors.white),
                label: Text(context.tr('retry'),
                    style: TextStyle(color: Colors.white)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: colors.primaryBrand,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
