import 'package:equatable/equatable.dart';

abstract class EscrowEvent extends Equatable {
  const EscrowEvent();

  @override
  List<Object> get props => [];
}

class FetchEscrowSummaryEvent extends EscrowEvent {}

class FetchDonorDonationsEvent extends EscrowEvent {
  final int limit;
  final int offset;

  const FetchDonorDonationsEvent({this.limit = 20, this.offset = 0});

  @override
  List<Object> get props => [limit, offset];
}
