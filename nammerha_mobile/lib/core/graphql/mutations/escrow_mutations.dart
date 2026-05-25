/// Mutations for Escrow & Payment Integration
class EscrowMutations {
  /// Escrow checkout mutation — creates payment intent via escrow system.
  static const String createEscrowCheckout = r'''
    mutation CreatePaymentIntent($input: CreatePaymentIntentInput!) {
      createPaymentIntent(input: $input) {
        transactionId
        amountLocked
        paymentStatus
        currency
      }
    }
  ''';

  static const String releaseEscrow = r'''
    mutation ReleaseEscrow($input: ReleaseEscrowInput!) {
      releaseEscrow(input: $input) {
        transactionId
        amountLocked
        paymentStatus
        releasedAt
      }
    }
  ''';
}
