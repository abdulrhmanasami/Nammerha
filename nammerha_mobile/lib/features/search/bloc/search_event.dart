import 'package:equatable/equatable.dart';

import '../models/marketplace_filter_model.dart';

abstract class SearchEvent extends Equatable {
  const SearchEvent();

  @override
  List<Object?> get props => [];
}

class SearchQueryChanged extends SearchEvent {
  final String query;

  const SearchQueryChanged(this.query);

  @override
  List<Object?> get props => [query];
}

class SearchFiltersApplied extends SearchEvent {
  final MarketplaceFilters filters;

  const SearchFiltersApplied(this.filters);

  @override
  List<Object?> get props => [filters];
}
