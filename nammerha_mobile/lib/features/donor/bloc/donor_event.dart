import 'package:equatable/equatable.dart';

abstract class DonorEvent extends Equatable {
  const DonorEvent();

  @override
  List<Object?> get props => [];
}

class DonorLoadTabRequested extends DonorEvent {
  final int tabIndex;
  final bool forceRefresh;

  const DonorLoadTabRequested({required this.tabIndex, this.forceRefresh = false});

  @override
  List<Object?> get props => [tabIndex, forceRefresh];
}

class DonorLoadStandaloneProofsRequested extends DonorEvent {
  const DonorLoadStandaloneProofsRequested();
}
