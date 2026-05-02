import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// HomeownerProjectsCubit — Platinum Standard (Absolute Zero setState)
// ═══════════════════════════════════════════════════════════════════════════

class HomeownerProjectsState extends Equatable {
  final bool isLoading;
  final String? error;
  final List<Map<String, dynamic>> projects;

  const HomeownerProjectsState({this.isLoading = true, this.error, this.projects = const []});

  HomeownerProjectsState copyWith({bool? isLoading, String? error, List<Map<String, dynamic>>? projects}) {
    return HomeownerProjectsState(
      isLoading: isLoading ?? this.isLoading,
      error: error,
      projects: projects ?? this.projects,
    );
  }

  @override
  List<Object?> get props => [isLoading, error, projects];
}

class HomeownerProjectsCubit extends Cubit<HomeownerProjectsState> {
  HomeownerProjectsCubit() : super(const HomeownerProjectsState());

  void setLoading() => emit(const HomeownerProjectsState(isLoading: true));
  void setLoaded(List<Map<String, dynamic>> projects) => emit(HomeownerProjectsState(isLoading: false, projects: projects));
  void setError(String message) => emit(HomeownerProjectsState(isLoading: false, error: message));
}
