import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/marketplace_repository.dart';
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
      List<ProjectModel> filtered = List.from(currentState.allProjects);

      if (event.filter != null && event.filter != 'all') {
        filtered = filtered.where((p) => p.status.toLowerCase() == event.filter!.toLowerCase()).toList();
      }

      if (event.sort == 'highest_funding') {
        filtered.sort((a, b) => b.fundedPercentage.compareTo(a.fundedPercentage));
      } else if (event.sort == 'lowest_funding') {
        filtered.sort((a, b) => a.fundedPercentage.compareTo(b.fundedPercentage));
      }

      emit(currentState.copyWith(
        projects: filtered,
        activeFilter: event.filter == 'all' ? null : event.filter,
        activeSort: event.sort,
        clearFilter: event.filter == 'all',
        clearSort: event.sort == null,
      ));
    }
  }
}
