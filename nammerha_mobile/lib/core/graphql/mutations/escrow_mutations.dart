/// Mutations for Escrow & Payment Integration
class EscrowMutations {
  /// Escrow checkout mutation — creates payment intent via escrow system.
  /// NOTE: The GraphQL operation name 'CreateDonation' is a backend contract
  /// and MUST NOT be renamed without a coordinated backend schema migration.
  static const String createEscrowCheckout = r'''
    mutation CreateDonation($input: CreateDonationInput!) {
      createDonation(input: $input) {
        intentId
        checkoutUrl
        clientSecret
        returnUrl
        amount
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
