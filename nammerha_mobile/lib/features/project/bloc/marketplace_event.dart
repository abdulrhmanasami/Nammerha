import 'package:equatable/equatable.dart';

abstract class MarketplaceEvent extends Equatable {
  const MarketplaceEvent();

  @override
  List<Object?> get props => [];
}

class LoadProjectsEvent extends MarketplaceEvent {
  final bool isRefresh;

  const LoadProjectsEvent({this.isRefresh = false});

  @override
  List<Object?> get props => [isRefresh];
}

class FilterProjectsEvent extends MarketplaceEvent {
  final String? filter;
  final String? sort; // 'highest_funding', 'lowest_funding', null
  final String? searchQuery;

  const FilterProjectsEvent({this.filter, this.sort, this.searchQuery});

  @override
  List<Object?> get props => [filter, sort, searchQuery];
}
