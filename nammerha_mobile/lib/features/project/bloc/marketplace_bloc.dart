import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/marketplace_repository.dart';
import '../models/project_model.dart';
import 'marketplace_event.dart';
import 'marketplace_state.dart';

class MarketplaceBloc extends Bloc<MarketplaceEvent, MarketplaceState> {
  final MarketplaceRepository repository;

  MarketplaceBloc({required this.repository}) : super(MarketplaceInitial()) {
    on<LoadProjectsEvent>(_onLoadProjects);
    on<FilterProjectsEvent>(_onFilterProjects);
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
      final projects = await repository.fetchProjects();
      emit(MarketplaceLoaded(projects: projects, allProjects: projects));
    } catch (e) {
      emit(MarketplaceError(e.toString()));
    }
  }

  void _onFilterProjects(
    FilterProjectsEvent event,
    Emitter<MarketplaceState> emit,
  ) {
    if (state is MarketplaceLoaded) {
      final currentState = state as MarketplaceLoaded;
      List<ProjectModel> filtered = List<ProjectModel>.from(currentState.allProjects);

      final search = event.searchQuery ?? currentState.activeSearchQuery;
      if (search != null && search.isNotEmpty) {
        final query = search.toLowerCase();
        filtered = filtered.where((p) =>
            p.title.toLowerCase().contains(query) ||
            p.damageType.toLowerCase().contains(query)).toList();
      }

      final filter = event.filter ?? currentState.activeFilter;
      if (filter != null && filter != 'all') {
        filtered = filtered.where((p) => p.status.toLowerCase() == filter.toLowerCase()).toList();
      }

      final sort = event.sort ?? currentState.activeSort;
      if (sort == 'highest_funding') {
        filtered.sort((a, b) => b.fundedPercentage.compareTo(a.fundedPercentage));
      } else if (sort == 'lowest_funding') {
        filtered.sort((a, b) => a.fundedPercentage.compareTo(b.fundedPercentage));
      }

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
}
