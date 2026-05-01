import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/services/api_services.dart';

// ═══════════════════════════════════════════════════════════════════════════
// OPEN DATA BLOC — GAP-S11 / GAP-G01-G04 REMEDIATION
// Populates ghost directories with proper OCDS transparency state management
// ═══════════════════════════════════════════════════════════════════════════

// ─── Events ─────────────────────────────────────────────────────────────────

abstract class OpenDataEvent {}

class LoadOpenDataDashboard extends OpenDataEvent {}

class LoadOpenDataStats extends OpenDataEvent {}

class LoadProjectListings extends OpenDataEvent {
  final int? limit;
  final int? offset;
  LoadProjectListings({this.limit, this.offset});
}

class LoadProjectCard extends OpenDataEvent {
  final String projectId;
  LoadProjectCard(this.projectId);
}

class LoadOCDSRelease extends OpenDataEvent {
  final String projectId;
  LoadOCDSRelease(this.projectId);
}

class ExportReport extends OpenDataEvent {
  final String projectId;
  final String format;
  ExportReport({required this.projectId, this.format = 'pdf'});
}

// ─── State ──────────────────────────────────────────────────────────────────

class OpenDataState {
  final bool isLoading;
  final String? error;
  final Map<String, dynamic> stats;
  final List<Map<String, dynamic>> projects;
  final Map<String, dynamic>? selectedProject;
  final Map<String, dynamic>? ocdsRelease;
  final String? exportUrl;

  const OpenDataState({
    this.isLoading = false,
    this.error,
    this.stats = const {},
    this.projects = const [],
    this.selectedProject,
    this.ocdsRelease,
    this.exportUrl,
  });

  OpenDataState copyWith({
    bool? isLoading,
    String? error,
    Map<String, dynamic>? stats,
    List<Map<String, dynamic>>? projects,
    Map<String, dynamic>? selectedProject,
    Map<String, dynamic>? ocdsRelease,
    String? exportUrl,
  }) {
    return OpenDataState(
      isLoading: isLoading ?? this.isLoading,
      error: error,
      stats: stats ?? this.stats,
      projects: projects ?? this.projects,
      selectedProject: selectedProject ?? this.selectedProject,
      ocdsRelease: ocdsRelease ?? this.ocdsRelease,
      exportUrl: exportUrl ?? this.exportUrl,
    );
  }
}

// ─── BLoC ────────────────────────────────────────────────────────────────────

class OpenDataBloc extends Bloc<OpenDataEvent, OpenDataState> {
  final OpenDataApi _openDataApi;

  OpenDataBloc({OpenDataApi? openDataApi})
      : _openDataApi = openDataApi ?? OpenDataApi(),
        super(const OpenDataState()) {
    on<LoadOpenDataDashboard>(_onLoadDashboard);
    on<LoadOpenDataStats>(_onLoadStats);
    on<LoadProjectListings>(_onLoadProjects);
    on<LoadProjectCard>(_onLoadProjectCard);
    on<LoadOCDSRelease>(_onLoadOCDSRelease);
    on<ExportReport>(_onExportReport);
  }

  Future<void> _onLoadDashboard(
    LoadOpenDataDashboard event,
    Emitter<OpenDataState> emit,
  ) async {
    emit(state.copyWith(isLoading: true, error: null));
    try {
      final results = await Future.wait([
        _openDataApi.getStats(),
        _openDataApi.getProjectListings(limit: 20),
      ]);
      emit(state.copyWith(
        isLoading: false,
        stats: results[0] as Map<String, dynamic>,
        projects: results[1] as List<Map<String, dynamic>>,
      ));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  Future<void> _onLoadStats(
    LoadOpenDataStats event,
    Emitter<OpenDataState> emit,
  ) async {
    emit(state.copyWith(isLoading: true));
    try {
      final stats = await _openDataApi.getStats();
      emit(state.copyWith(isLoading: false, stats: stats));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  Future<void> _onLoadProjects(
    LoadProjectListings event,
    Emitter<OpenDataState> emit,
  ) async {
    emit(state.copyWith(isLoading: true));
    try {
      final projects = await _openDataApi.getProjectListings(
        limit: event.limit,
        offset: event.offset,
      );
      emit(state.copyWith(isLoading: false, projects: projects));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  Future<void> _onLoadProjectCard(
    LoadProjectCard event,
    Emitter<OpenDataState> emit,
  ) async {
    emit(state.copyWith(isLoading: true));
    try {
      final project = await _openDataApi.getProjectCard(event.projectId);
      emit(state.copyWith(isLoading: false, selectedProject: project));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  Future<void> _onLoadOCDSRelease(
    LoadOCDSRelease event,
    Emitter<OpenDataState> emit,
  ) async {
    emit(state.copyWith(isLoading: true));
    try {
      final release = await _openDataApi.getOCDSRelease(event.projectId);
      emit(state.copyWith(isLoading: false, ocdsRelease: release));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  Future<void> _onExportReport(
    ExportReport event,
    Emitter<OpenDataState> emit,
  ) async {
    emit(state.copyWith(isLoading: true));
    try {
      final url = await _openDataApi.exportReport(
        event.projectId,
        format: event.format,
      );
      emit(state.copyWith(isLoading: false, exportUrl: url));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }
}
