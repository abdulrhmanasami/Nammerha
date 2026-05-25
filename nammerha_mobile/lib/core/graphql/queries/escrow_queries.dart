/// Queries for Escrow Ledger Integration
class EscrowQueries {
  static const String getUserEscrowHistory = r'''
    query GetUserEscrowHistory {
      userEscrowHistory {
        transactionId
        amountLocked
        paymentStatus
        currency
      }
    }
  ''';

  /// Escrow transaction history query.
  static const String getEscrowTransactions = r'''
    query GetUserPayments($limit: Int, $offset: Int) {
      userPayments(limit: $limit, offset: $offset) {
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
