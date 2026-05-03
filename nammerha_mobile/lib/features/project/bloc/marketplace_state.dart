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

  const MarketplaceLoaded({
    required this.projects,
    required this.allProjects,
    this.activeFilter,
    this.activeSort,
  });

  MarketplaceLoaded copyWith({
    List<ProjectModel>? projects,
    List<ProjectModel>? allProjects,
    String? activeFilter,
    String? activeSort,
    bool clearFilter = false,
    bool clearSort = false,
  }) {
    return MarketplaceLoaded(
      projects: projects ?? this.projects,
      allProjects: allProjects ?? this.allProjects,
      activeFilter: clearFilter ? null : (activeFilter ?? this.activeFilter),
      activeSort: clearSort ? null : (activeSort ?? this.activeSort),
    );
  }

  @override
  List<Object?> get props => [projects, allProjects, activeFilter, activeSort];
}

class MarketplaceError extends MarketplaceState {
  final String message;

  const MarketplaceError(this.message);

  @override
  List<Object?> get props => [message];
}
