import 'package:equatable/equatable.dart';

class TradespersonDashboardModel extends Equatable {
  final Map<String, dynamic> stats;
  final Map<String, dynamic> profile;
  final List<Map<String, dynamic>> requests;
  final List<Map<String, dynamic>> assignments;
  final List<Map<String, dynamic>> earnings;
  final String availability;

  const TradespersonDashboardModel({
    this.stats = const {},
    this.profile = const {},
    this.requests = const [],
    this.assignments = const [],
    this.earnings = const [],
    this.availability = 'offline',
  });

  TradespersonDashboardModel copyWith({
    Map<String, dynamic>? stats,
    Map<String, dynamic>? profile,
    List<Map<String, dynamic>>? requests,
    List<Map<String, dynamic>>? assignments,
    List<Map<String, dynamic>>? earnings,
    String? availability,
  }) {
    return TradespersonDashboardModel(
      stats: stats ?? this.stats,
      profile: profile ?? this.profile,
      requests: requests ?? this.requests,
      assignments: assignments ?? this.assignments,
      earnings: earnings ?? this.earnings,
      availability: availability ?? this.availability,
    );
  }

  @override
  List<Object?> get props => [stats, profile, requests, assignments, earnings, availability];
}
