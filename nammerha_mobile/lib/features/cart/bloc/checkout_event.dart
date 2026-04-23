import 'package:equatable/equatable.dart';

abstract class CheckoutEvent extends Equatable {
  const CheckoutEvent();

  @override
  List<Object?> get props => [];
}

class InitiateCheckoutEvent extends CheckoutEvent {
  final List<Map<String, dynamic>> basketItems;
  final int tipAmount; // Not standard currency formatting; purely raw item values
  final String paymentGateway;

  const InitiateCheckoutEvent({
    required this.basketItems,
    required this.tipAmount,
    required this.paymentGateway,
  });

  @override
  List<Object?> get props => [basketItems, tipAmount, paymentGateway];
}
