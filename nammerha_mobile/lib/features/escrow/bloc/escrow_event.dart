import 'package:equatable/equatable.dart';

abstract class EscrowEvent extends Equatable {
  const EscrowEvent();

  @override
  List<Object?> get props => [];
}

class InitiateDonationEvent extends EscrowEvent {
  final List<Map<String, dynamic>> items;
  final String paymentMethod;
  final String? returnUrl;

  const InitiateDonationEvent({
    required this.items,
    required this.paymentMethod,
    this.returnUrl,
  });

  @override
  List<Object?> get props => [items, paymentMethod, returnUrl];
}

class LoadEscrowSummaryEvent extends EscrowEvent {}
