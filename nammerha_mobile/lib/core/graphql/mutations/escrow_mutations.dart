/// Mutations for Escrow & Payment Integration
class EscrowMutations {
  static const String createDonation = r'''
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
