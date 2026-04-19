/// Queries for Escrow Ledger Integration
class EscrowQueries {
  static const String getDonorEscrowHistory = r'''
    query GetDonorEscrowHistory {
      donorEscrowHistory {
        transactionId
        amountLocked
        paymentStatus
        currency
      }
    }
  ''';

  static const String getDonorDonations = r'''
    query GetDonorDonations($limit: Int, $offset: Int) {
      donorDonations(limit: $limit, offset: $offset) {
        transactionId
        itemId
        projectTitle
        materialName
        amountLocked
        currency
        paymentStatus
        paymentMethod
        lockedAt
      }
    }
  ''';
}
