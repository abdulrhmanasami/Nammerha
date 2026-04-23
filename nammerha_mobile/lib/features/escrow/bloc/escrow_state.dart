import 'package:equatable/equatable.dart';

abstract class EscrowState extends Equatable {
  const EscrowState();

  @override
  List<Object> get props => [];
}

class EscrowInitial extends EscrowState {}

class EscrowLoading extends EscrowState {}

class EscrowSummaryLoaded extends EscrowState {
  final Map<String, dynamic> summary;

  const EscrowSummaryLoaded(this.summary);

  @override
  List<Object> get props => [summary];
}

class DonorDonationsLoaded extends EscrowState {
  final List<Map<String, dynamic>> donations;

  const DonorDonationsLoaded(this.donations);

  @override
  List<Object> get props => [donations];
}

class EscrowError extends EscrowState {
  final String message;

  const EscrowError(this.message);

  @override
  List<Object> get props => [message];
}
