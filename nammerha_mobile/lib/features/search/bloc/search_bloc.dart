import 'dart:async';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../data/search_repository.dart';
import '../models/marketplace_filter_model.dart';
import 'search_event.dart';
import 'search_state.dart';

class SearchBloc extends Bloc<SearchEvent, SearchState> {
  final SearchRepository _searchRepository;
  Timer? _debounce;
  MarketplaceFilters _currentFilters = const MarketplaceFilters();

  SearchBloc({required SearchRepository searchRepository})
      : _searchRepository = searchRepository,
        super(SearchInitial()) {
    on<SearchQueryChanged>(_onQueryChanged);
    on<SearchFiltersApplied>(_onFiltersApplied);
  }

  Future<void> _onQueryChanged(
    SearchQueryChanged event,
    Emitter<SearchState> emit,
  ) async {
    _currentFilters = _currentFilters.copyWith(keyword: event.query);
    
    // Debounce the search to prevent excessive API calls
    final completer = Completer<void>();
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), () async {
      if (!completer.isCompleted) completer.complete();
    });
    
    await completer.future;
    
    emit(SearchLoading(_currentFilters));
    try {
      final projects = await _searchRepository.searchProjects(filters: _currentFilters);
      emit(SearchLoaded(projects, _currentFilters));
    } catch (e) {
      emit(SearchError(e.toString(), _currentFilters));
    }
  }

  Future<void> _onFiltersApplied(
    SearchFiltersApplied event,
    Emitter<SearchState> emit,
  ) async {
    _currentFilters = event.filters;
    emit(SearchLoading(_currentFilters));
    try {
      final projects = await _searchRepository.searchProjects(filters: _currentFilters);
      emit(SearchLoaded(projects, _currentFilters));
    } catch (e) {
      emit(SearchError(e.toString(), _currentFilters));
    }
  }

  @override
  Future<void> close() {
    _debounce?.cancel();
    return super.close();
  }
}
