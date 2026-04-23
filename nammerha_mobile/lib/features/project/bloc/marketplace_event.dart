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
