import 'package:equatable/equatable.dart';

class DonorDashboardModel extends Equatable {
  final Map<String, dynamic> stats;
  final List<Map<String, dynamic>> fundedProjects;
  final List<Map<String, dynamic>> marketplace;
  final List<Map<String, dynamic>> donations;
  final List<Map<String, dynamic>> impact;
  final List<Map<String, dynamic>> proofs;

  const DonorDashboardModel({
    this.stats = const {},
    this.fundedProjects = const [],
    this.marketplace = const [],
    this.donations = const [],
    this.impact = const [],
    this.proofs = const [],
  });

  DonorDashboardModel copyWith({
    Map<String, dynamic>? stats,
    List<Map<String, dynamic>>? fundedProjects,
    List<Map<String, dynamic>>? marketplace,
    List<Map<String, dynamic>>? donations,
    List<Map<String, dynamic>>? impact,
    List<Map<String, dynamic>>? proofs,
  }) {
    return DonorDashboardModel(
      stats: stats ?? this.stats,
      fundedProjects: fundedProjects ?? this.fundedProjects,
      marketplace: marketplace ?? this.marketplace,
      donations: donations ?? this.donations,
      impact: impact ?? this.impact,
      proofs: proofs ?? this.proofs,
    );
  }

  @override
  List<Object?> get props => [stats, fundedProjects, marketplace, donations, impact, proofs];
}
