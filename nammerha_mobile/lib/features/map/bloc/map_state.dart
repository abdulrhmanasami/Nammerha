import 'package:equatable/equatable.dart';
import '../models/map_project_model.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Map BLoC — States
// ═══════════════════════════════════════════════════════════════════════════

abstract class MapState extends Equatable {
  const MapState();

  @override
  List<Object?> get props => [];
}

/// Initial state before any data is fetched.
class MapInitial extends MapState {
  const MapInitial();
}

/// Projects are being fetched from the API (Isolate is running).
class MapLoading extends MapState {
  const MapLoading();
}

/// Projects loaded successfully. Contains all data needed to render the map.
class MapLoaded extends MapState {
  /// ALL projects returned by the API that have valid GPS coordinates.
  final List<MapProjectModel> allProjects;

  /// Projects visible on the map after applying active filters.
  final List<MapProjectModel> filteredProjects;

  /// Currently selected project (drives the bottom sheet panel).
  final MapProjectModel? selectedProject;

  /// Active region filter (null = all regions).
  final String? activeRegion;

  /// Active damage type filter (null = all types).
  final String? activeDamageType;

  /// All unique regions extracted from the project list for filter chips.
  final List<String> availableRegions;

  /// All unique damage types for filter chips.
  final List<String> availableDamageTypes;

  const MapLoaded({
    required this.allProjects,
    required this.filteredProjects,
    required this.availableRegions,
    required this.availableDamageTypes,
    this.selectedProject,
    this.activeRegion,
    this.activeDamageType,
  });

  @override
  List<Object?> get props => [
        allProjects,
        filteredProjects,
        selectedProject,
        activeRegion,
        activeDamageType,
      ];

  /// Produces a new MapLoaded with a different active selection/filter.
  MapLoaded copyWith({
    List<MapProjectModel>? filteredProjects,
    MapProjectModel? Function()? selectedProject,
    String? Function()? activeRegion,
    String? Function()? activeDamageType,
  }) {
    return MapLoaded(
      allProjects: allProjects,
      availableRegions: availableRegions,
      availableDamageTypes: availableDamageTypes,
      filteredProjects: filteredProjects ?? this.filteredProjects,
      selectedProject:
          selectedProject != null ? selectedProject() : this.selectedProject,
      activeRegion: activeRegion != null ? activeRegion() : this.activeRegion,
      activeDamageType: activeDamageType != null
          ? activeDamageType()
          : this.activeDamageType,
    );
  }
}

/// An error occurred during project loading.
class MapError extends MapState {
  final String message;

  const MapError(this.message);

  @override
  List<Object?> get props => [message];
}
