import 'package:equatable/equatable.dart';

abstract class EscrowEvent extends Equatable {
  const EscrowEvent();

  @override
  List<Object> get props => [];
}

class FetchEscrowSummaryEvent extends EscrowEvent {}

class FetchEscrowTransactionsEvent extends EscrowEvent {
  final int limit;
  final int offset;

  const FetchEscrowTransactionsEvent({this.limit = 20, this.offset = 0});

  @override
  List<Object> get props => [limit, offset];
}
