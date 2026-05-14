import '../../../core/services/api_services.dart';
import '../models/wallet_model.dart';

class WalletRepository {
  final PaymentsApi _paymentsApi;

  WalletRepository({PaymentsApi? paymentsApi})
      : _paymentsApi = paymentsApi ?? PaymentsApi();

  Future<WalletSummaryModel> loadWallet() async {
    List<Map<String, dynamic>> transactionsMap = [];

    try {
      transactionsMap = await _paymentsApi
          .getMyPayments(limit: 50)
          .catchError((_) => <Map<String, dynamic>>[]);
    } catch (_) {}

    final transactions = transactionsMap
        .map((tx) => WalletTransactionModel.fromJson(tx))
        .toList();

    // Escrow summary: derived from transaction data (PaymentsApi).
    // was removed. Payment transactions contain escrow metadata.
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
}
