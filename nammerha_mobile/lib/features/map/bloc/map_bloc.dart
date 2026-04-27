import 'dart:isolate';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/network/api_client.dart';
import '../../../core/services/api_services.dart';
import '../models/map_project_model.dart';
import 'map_event.dart';
import 'map_state.dart';

// ═══════════════════════════════════════════════════════════════════════════
// MapBloc — Production Geospatial Intelligence Engine
// ═══════════════════════════════════════════════════════════════════════════
// Platinum Standard compliance:
//   ✅ All state derived via BLoC — zero setState in the UI layer.
//   ✅ JSON parsing offloaded to Isolate.run() — UI thread sovereignty.
//   ✅ ApiException propagated to MapError — zero silent failures.
//   ✅ Filter operations are pure synchronous derivations of MapLoaded state.
// ═══════════════════════════════════════════════════════════════════════════

class MapBloc extends Bloc<MapEvent, MapState> {
  final MarketplaceApi _api;

  MapBloc({MarketplaceApi? api})
      : _api = api ?? MarketplaceApi(),
        super(const MapInitial()) {
    on<LoadMapProjects>(_onLoad);
    on<SelectMapProject>(_onSelect);
    on<DeselectMapProject>(_onDeselect);
    on<FilterByRegion>(_onFilterRegion);
    on<FilterByDamageType>(_onFilterDamageType);
  }

  // ─── Load Handler ────────────────────────────────────────────────────────

  Future<void> _onLoad(
    LoadMapProjects event,
    Emitter<MapState> emit,
  ) async {
    emit(const MapLoading());

    try {
      // Fetch all projects (up to 200 — sufficient for Syria's current project
      // volume; pagination can be added in Wave 2 with infinite tile loading).
      final rawList = await _api.getProjects(limit: 200);

      // PLATINUM MANDATE: Offload heavy JSON → model parsing to an Isolate.
      // This prevents janky frames on the main thread for large datasets.
      final projects = await Isolate.run<List<MapProjectModel>>(
        () => parseMapProjects(rawList),
      );

      // Derive unique filter values from the parsed data.
      final regions = projects
          .map((p) => p.region)
          .toSet()
          .where((r) => r.isNotEmpty)
          .toList()
        ..sort();

      final damageTypes = projects
          .map((p) => p.damageType)
          .toSet()
          .where((dt) => dt.isNotEmpty)
          .toList()
        ..sort();

      emit(MapLoaded(
        allProjects: projects,
        filteredProjects: projects,
        availableRegions: regions,
        availableDamageTypes: damageTypes,
      ));
    } on ApiException catch (e) {
      emit(MapError(e.message));
    } catch (e) {
      emit(MapError('تعذّر تحميل خريطة المشاريع: ${e.toString()}'));
    }
  }

  // ─── Selection Handlers ──────────────────────────────────────────────────

  void _onSelect(SelectMapProject event, Emitter<MapState> emit) {
    final current = state;
    if (current is! MapLoaded) return;

    final project = current.filteredProjects
        .cast<MapProjectModel?>()
        .firstWhere(
          (p) => p?.projectId == event.projectId,
          orElse: () => null,
        );

    emit(current.copyWith(selectedProject: () => project));
  }

  void _onDeselect(DeselectMapProject event, Emitter<MapState> emit) {
    final current = state;
    if (current is! MapLoaded) return;
    emit(current.copyWith(selectedProject: () => null));
  }

  // ─── Filter Handlers ─────────────────────────────────────────────────────

  void _onFilterRegion(FilterByRegion event, Emitter<MapState> emit) {
    final current = state;
    if (current is! MapLoaded) return;

    final filtered = _applyFilters(
      all: current.allProjects,
      region: event.region,
      damageType: current.activeDamageType,
    );

    emit(current.copyWith(
      filteredProjects: filtered,
      activeRegion: () => event.region,
      selectedProject: () => null, // clear selection when filter changes
    ));
  }

  void _onFilterDamageType(
    FilterByDamageType event,
    Emitter<MapState> emit,
  ) {
    final current = state;
    if (current is! MapLoaded) return;

    final filtered = _applyFilters(
      all: current.allProjects,
      region: current.activeRegion,
      damageType: event.damageType,
    );

    emit(current.copyWith(
      filteredProjects: filtered,
      activeDamageType: () => event.damageType,
      selectedProject: () => null,
    ));
  }

  // ─── Pure Filter Logic ────────────────────────────────────────────────────

  List<MapProjectModel> _applyFilters({
    required List<MapProjectModel> all,
    required String? region,
    required String? damageType,
  }) {
    return all.where((p) {
      final regionMatch = region == null || p.region == region;
      final damageMatch = damageType == null || p.damageType == damageType;
      return regionMatch && damageMatch;
    }).toList();
  }
}
