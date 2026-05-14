import 'package:equatable/equatable.dart';

abstract class CheckoutState extends Equatable {
  const CheckoutState();

  @override
  List<Object?> get props => [];
}

class CheckoutInitial extends CheckoutState {}

class CheckoutLoading extends CheckoutState {}

/// H-4 FIX: Extended with PaymentIntent metadata from GraphQL response.
/// The `checkoutUrl` is now reliably returned from the escrow checkout mutation,
/// unlike the REST endpoint which returned `{ escrow_entries, total_locked }`.
class CheckoutSuccess extends CheckoutState {
  /// Fatora/Visa checkout redirect URL (null if REST fallback)
  final String? checkoutUrl;

  /// Payment intent ID for tracking (null if REST fallback)
  final String? intentId;

  /// Amount in cents (null if REST fallback)
  final int? amount;

  /// Currency code (null if REST fallback)
  final String? currency;

  const CheckoutSuccess({
    this.checkoutUrl,
    this.intentId,
    this.amount,
    this.currency,
  });

  /// True if the checkout resulted in a valid redirect URL
  bool get hasRedirect => checkoutUrl != null && checkoutUrl!.isNotEmpty;

  @override
  List<Object?> get props => [checkoutUrl, intentId, amount, currency];
}

class CheckoutError extends CheckoutState {
  final String message;

  const CheckoutError(this.message);

  @override
  List<Object?> get props => [message];
}
