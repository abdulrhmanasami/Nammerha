import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Map BLoC — Events
// ═══════════════════════════════════════════════════════════════════════════

abstract class MapEvent extends Equatable {
  const MapEvent();

  @override
  List<Object?> get props => [];
}

/// Triggers the initial (or refresh) load of all map projects.
class LoadMapProjects extends MapEvent {
  const LoadMapProjects();
}

/// User selects a specific project marker on the map.
class SelectMapProject extends MapEvent {
  final String projectId;

  const SelectMapProject(this.projectId);

  @override
  List<Object?> get props => [projectId];
}

/// User deselects the currently selected project (closes bottom sheet).
class DeselectMapProject extends MapEvent {
  const DeselectMapProject();
}

/// User applies a region filter chip.
class FilterByRegion extends MapEvent {
  final String? region; // null = show all

  const FilterByRegion(this.region);

  @override
  List<Object?> get props => [region];
}

/// User applies a damage type filter.
class FilterByDamageType extends MapEvent {
  final String? damageType; // null = show all

  const FilterByDamageType(this.damageType);

  @override
  List<Object?> get props => [damageType];
}
