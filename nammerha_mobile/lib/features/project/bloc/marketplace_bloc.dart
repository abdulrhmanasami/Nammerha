import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/marketplace_repository.dart';
import 'marketplace_event.dart';
import 'marketplace_state.dart';

class MarketplaceBloc extends Bloc<MarketplaceEvent, MarketplaceState> {
  final MarketplaceRepository repository;

  MarketplaceBloc({required this.repository}) : super(MarketplaceInitial()) {
    on<LoadProjectsEvent>(_onLoadProjects);
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
      emit(MarketplaceLoaded(projects: projects));
    } catch (e) {
      emit(MarketplaceError(e.toString()));
    }
  }
}
