import 'package:equatable/equatable.dart';

class HomeownerDashboardModel extends Equatable {
  final Map<String, dynamic> stats;
  final List<Map<String, dynamic>> projects;
  final List<Map<String, dynamic>> serviceRequests;
  final List<Map<String, dynamic>> approvals;
  final Map<String, dynamic> escrow;

  const HomeownerDashboardModel({
    this.stats = const {},
    this.projects = const [],
    this.serviceRequests = const [],
    this.approvals = const [],
    this.escrow = const {},
  });

  HomeownerDashboardModel copyWith({
    Map<String, dynamic>? stats,
    List<Map<String, dynamic>>? projects,
    List<Map<String, dynamic>>? serviceRequests,
    List<Map<String, dynamic>>? approvals,
    Map<String, dynamic>? escrow,
  }) {
    return HomeownerDashboardModel(
      stats: stats ?? this.stats,
      projects: projects ?? this.projects,
      serviceRequests: serviceRequests ?? this.serviceRequests,
      approvals: approvals ?? this.approvals,
      escrow: escrow ?? this.escrow,
    );
  }

  @override
  List<Object?> get props => [stats, projects, serviceRequests, approvals, escrow];
}
