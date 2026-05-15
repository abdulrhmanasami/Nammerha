import 'package:equatable/equatable.dart';
import '../models/project_model.dart';

abstract class MarketplaceState extends Equatable {
  const MarketplaceState();

  @override
  List<Object?> get props => [];
}

class MarketplaceInitial extends MarketplaceState {}

class MarketplaceLoading extends MarketplaceState {}

class MarketplaceLoaded extends MarketplaceState {
  final List<ProjectModel> projects; // filtered projects
  final List<ProjectModel> allProjects; // raw projects
  final String? activeFilter;
  final String? activeSort;
  final String? activeSearchQuery;
  final bool hasMore;
  final bool isLoadingMore;

  const MarketplaceLoaded({
    required this.projects,
    required this.allProjects,
    this.activeFilter,
    this.activeSort,
    this.activeSearchQuery,
    this.hasMore = true,
    this.isLoadingMore = false,
  });

  MarketplaceLoaded copyWith({
    List<ProjectModel>? projects,
    List<ProjectModel>? allProjects,
    String? activeFilter,
    String? activeSort,
    String? activeSearchQuery,
    bool clearFilter = false,
    bool clearSort = false,
    bool clearSearch = false,
    bool? hasMore,
    bool? isLoadingMore,
  }) {
    return MarketplaceLoaded(
      projects: projects ?? this.projects,
      allProjects: allProjects ?? this.allProjects,
      activeFilter: clearFilter ? null : (activeFilter ?? this.activeFilter),
      activeSort: clearSort ? null : (activeSort ?? this.activeSort),
      activeSearchQuery: clearSearch ? null : (activeSearchQuery ?? this.activeSearchQuery),
      hasMore: hasMore ?? this.hasMore,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
    );
  }

  @override
  List<Object?> get props => [projects, allProjects, activeFilter, activeSort, activeSearchQuery, hasMore, isLoadingMore];
}

class MarketplaceError extends MarketplaceState {
  final String message;

  const MarketplaceError(this.message);

  @override
  List<Object?> get props => [message];
}
