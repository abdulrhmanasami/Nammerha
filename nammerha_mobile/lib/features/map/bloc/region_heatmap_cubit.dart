import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// RegionHeatmapCubit — Platinum Standard (Absolute Zero setState)
// ═══════════════════════════════════════════════════════════════════════════

class RegionHeatmapState extends Equatable {
  final bool isLoading;
  final List<dynamic> regions;
  final Map<String, dynamic> stats;
  final int maxCount;

  const RegionHeatmapState({
    this.isLoading = true,
    this.regions = const [],
    this.stats = const {},
    this.maxCount = 1,
  });

  @override
  List<Object?> get props => [isLoading, regions, stats, maxCount];
}

class RegionHeatmapCubit extends Cubit<RegionHeatmapState> {
  RegionHeatmapCubit() : super(const RegionHeatmapState());

  void setLoading() => emit(const RegionHeatmapState(isLoading: true));

  void setLoaded({
    required List<dynamic> regions,
    required Map<String, dynamic> stats,
    required int maxCount,
  }) {
    emit(RegionHeatmapState(
      isLoading: false,
      regions: regions,
      stats: stats,
      maxCount: maxCount,
    ));
  }
}
