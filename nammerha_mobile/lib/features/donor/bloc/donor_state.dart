import 'package:equatable/equatable.dart';
import '../models/donor_models.dart';

abstract class DonorState extends Equatable {
  const DonorState();

  @override
  List<Object?> get props => [];
}

class DonorInitial extends DonorState {}

class DonorLoading extends DonorState {
  final DonorDashboardModel? currentData;
  const DonorLoading({this.currentData});

  @override
  List<Object?> get props => [currentData];
}

class DonorLoaded extends DonorState {
  final DonorDashboardModel data;
  const DonorLoaded({required this.data});

  @override
  List<Object?> get props => [data];
}

class DonorStandaloneProofsLoaded extends DonorState {
  final List<Map<String, dynamic>> proofs;
  const DonorStandaloneProofsLoaded({required this.proofs});

  @override
  List<Object?> get props => [proofs];
}

class DonorError extends DonorState {
  final String message;
  final DonorDashboardModel? currentData;

  const DonorError({required this.message, this.currentData});

  @override
  List<Object?> get props => [message, currentData];
}
