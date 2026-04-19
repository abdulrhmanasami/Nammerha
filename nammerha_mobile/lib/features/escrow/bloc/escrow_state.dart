import 'package:equatable/equatable.dart';

abstract class EscrowState extends Equatable {
  const EscrowState();

  @override
  List<Object?> get props => [];
}

class EscrowInitial extends EscrowState {}

class EscrowLoading extends EscrowState {}

class EscrowCheckoutReady extends EscrowState {
  final String? checkoutUrl;
  final String intentId;
  final String? clientSecret;

  const EscrowCheckoutReady({this.checkoutUrl, required this.intentId, this.clientSecret});

  @override
  List<Object?> get props => [checkoutUrl, intentId, clientSecret];
}

class EscrowSummaryLoaded extends EscrowState {
  final Map<String, dynamic> summary;

  const EscrowSummaryLoaded({required this.summary});

  @override
  List<Object?> get props => [summary];
}

class EscrowError extends EscrowState {
  final String message;

  const EscrowError(this.message);

  @override
  List<Object?> get props => [message];
}
