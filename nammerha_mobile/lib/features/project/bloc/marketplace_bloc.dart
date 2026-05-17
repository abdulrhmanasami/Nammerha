import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/marketplace_repository.dart';
import '../models/project_model.dart';
import 'marketplace_event.dart';
import 'marketplace_state.dart';

/// Wave 4: Pagination-aware MarketplaceBloc.
/// Page size = 20 (optimized for Syria 2G networks).
class MarketplaceBloc extends Bloc<MarketplaceEvent, MarketplaceState> {
  final MarketplaceRepository repository;
  static const int _pageSize = 20;

  MarketplaceBloc({required this.repository}) : super(MarketplaceInitial()) {
    on<LoadProjectsEvent>(_onLoadProjects);
    on<FilterProjectsEvent>(_onFilterProjects);
    on<LoadMoreProjectsEvent>(_onLoadMore);
  }

  Future<void> _onLoadProjects(
    LoadProjectsEvent event,
    Emitter<MarketplaceState> emit,
  ) async {
    // Show loading UI on first load, otherwise retain UI for refresh indicator
    if (!event.isRefresh) {
      emit(MarketplaceLoading());
    }

    try {
      final projects = await repository.fetchProjects(limit: _pageSize, offset: 0);
      emit(MarketplaceLoaded(
        projects: projects,
        allProjects: projects,
        hasMore: projects.length >= _pageSize,
      ));
    } catch (e) {
      debugPrint('[Nammerha] bloc/marketplace_bloc: $e');
      emit(MarketplaceError(e.toString()));
    }
  }

  /// Wave 4: Infinite scroll — appends next page to existing data.
  Future<void> _onLoadMore(
    LoadMoreProjectsEvent event,
    Emitter<MarketplaceState> emit,
  ) async {
    if (state is! MarketplaceLoaded) return;
    final currentState = state as MarketplaceLoaded;

    // Guard: don't load if already loading or no more pages
    if (currentState.isLoadingMore || !currentState.hasMore) return;

    emit(currentState.copyWith(isLoadingMore: true));

    try {
      final nextPage = await repository.fetchProjects(
        limit: _pageSize,
        offset: currentState.allProjects.length,
      );

      final allProjects = [...currentState.allProjects, ...nextPage];
      // Re-apply any active filters to the merged list
      final filtered = _applyFilters(
        allProjects,
        currentState.activeFilter,
        currentState.activeSort,
        currentState.activeSearchQuery,
      );

      emit(currentState.copyWith(
        projects: filtered,
        allProjects: allProjects,
        hasMore: nextPage.length >= _pageSize,
        isLoadingMore: false,
      ));
    } catch (e) {
      debugPrint('[Nammerha] bloc/marketplace_bloc: $e');
      // Silently fail pagination — keep showing existing data
      emit(currentState.copyWith(isLoadingMore: false));
    }
  }

  void _onFilterProjects(
    FilterProjectsEvent event,
    Emitter<MarketplaceState> emit,
  ) {
    if (state is MarketplaceLoaded) {
      final currentState = state as MarketplaceLoaded;

      final filter = event.filter ?? currentState.activeFilter;
      final sort = event.sort ?? currentState.activeSort;
      final search = event.searchQuery ?? currentState.activeSearchQuery;

      final filtered = _applyFilters(currentState.allProjects, filter, sort, search);

      emit(currentState.copyWith(
        projects: filtered,
        activeFilter: event.filter == 'all' ? null : filter,
        activeSort: sort,
        activeSearchQuery: search,
        clearFilter: event.filter == 'all',
        clearSort: event.sort == null && currentState.activeSort != null && event.filter == null && event.searchQuery == null,
        clearSearch: event.searchQuery?.isEmpty == true,
      ));
    }
  }

  /// Applies search, filter, and sort to a list of projects.
  static List<ProjectModel> _applyFilters(
    List<ProjectModel> projects,
    String? filter,
    String? sort,
    String? searchQuery,
  ) {
    List<ProjectModel> filtered = List<ProjectModel>.from(projects);

    if (searchQuery != null && searchQuery.isNotEmpty) {
      final query = searchQuery.toLowerCase();
      filtered = filtered.where((p) =>
          p.title.toLowerCase().contains(query) ||
          p.damageType.toLowerCase().contains(query)).toList();
    }

    if (filter != null && filter != 'all') {
      filtered = filtered.where((p) => p.status.toLowerCase() == filter.toLowerCase()).toList();
    }

    if (sort == 'highest_funding') {
      filtered.sort((a, b) => b.fundedPercentage.compareTo(a.fundedPercentage));
    } else if (sort == 'lowest_funding') {
      filtered.sort((a, b) => a.fundedPercentage.compareTo(b.fundedPercentage));
    }

    return filtered;
  }
}
