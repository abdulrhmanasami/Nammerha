import '../../../core/services/api_services.dart';
import '../models/wallet_model.dart';

class WalletRepository {
  final PaymentsApi _paymentsApi;
  static const int pageSize = 20;

  WalletRepository({PaymentsApi? paymentsApi})
      : _paymentsApi = paymentsApi ?? PaymentsApi();

  /// Wave 4: Pagination-aware wallet load.
  /// Initial load fetches summary + first page of transactions.
  Future<WalletSummaryModel> loadWallet({int limit = 20, int offset = 0}) async {
    List<Map<String, dynamic>> transactionsMap = [];

    try {
      transactionsMap = await _paymentsApi
          .getMyPayments(limit: limit, offset: offset)
          .catchError((_) => <Map<String, dynamic>>[]);
    } catch (_) {}

    final transactions = transactionsMap
        .map((tx) => WalletTransactionModel.fromJson(tx))
        .toList();

    // Escrow summary: derived from transaction data (PaymentsApi).
    // Payment transactions contain escrow metadata.
    int totalLocked = 0;
    int lockedCount = 0;
    int releasedCount = 0;
    int refundedCount = 0;

    for (final tx in transactions) {
      final status = tx.status.toLowerCase();
      if (status == 'locked' || status == 'pending') {
        totalLocked += tx.amount.toInt();
        lockedCount++;
      } else if (status == 'released' || status == 'completed') {
        releasedCount++;
      } else if (status == 'refunded') {
        refundedCount++;
      }
    }

    return WalletSummaryModel(
      totalLocked: totalLocked,
      lockedCount: lockedCount,
      releasedCount: releasedCount,
      refundedCount: refundedCount,
      transactions: transactions,
    );
  }

  /// Wave 4: Loads additional transaction pages for infinite scroll.
  /// Returns raw transactions only (summary unchanged).
  Future<List<WalletTransactionModel>> loadMoreTransactions({
    required int offset,
    int limit = 20,
  }) async {
    try {
      final raw = await _paymentsApi.getMyPayments(limit: limit, offset: offset);
      return raw.map((tx) => WalletTransactionModel.fromJson(tx)).toList();
    } catch (_) {
      return [];
    }
  }
}
