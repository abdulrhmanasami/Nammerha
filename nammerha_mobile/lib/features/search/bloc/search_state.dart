import 'package:equatable/equatable.dart';
import '../../project/data/models/project_model.dart';
import '../models/marketplace_filter_model.dart';

abstract class SearchState extends Equatable {
  const SearchState();

  @override
  List<Object?> get props => [];
}

class SearchInitial extends SearchState {}

class SearchLoading extends SearchState {
  final MarketplaceFilters currentFilters;

  const SearchLoading(this.currentFilters);

  @override
  List<Object?> get props => [currentFilters];
}

class SearchLoaded extends SearchState {
  final List<ProjectModel> projects;
  final MarketplaceFilters currentFilters;

  const SearchLoaded(this.projects, this.currentFilters);

  @override
  List<Object?> get props => [projects, currentFilters];
}

class SearchError extends SearchState {
  final String message;
  final MarketplaceFilters currentFilters;

  const SearchError(this.message, this.currentFilters);

  @override
  List<Object?> get props => [message, currentFilters];
}
