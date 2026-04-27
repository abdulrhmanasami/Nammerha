import '../../../core/services/api_services.dart';
import '../models/wallet_model.dart';

class WalletRepository {
  final DonationsApi _donationsApi;
  final PaymentsApi _paymentsApi;

  WalletRepository({DonationsApi? donationsApi, PaymentsApi? paymentsApi})
      : _donationsApi = donationsApi ?? DonationsApi(),
        _paymentsApi = paymentsApi ?? PaymentsApi();

  Future<WalletSummaryModel> loadWallet() async {
    Map<String, dynamic> escrowSummary = {};
    List<Map<String, dynamic>> transactionsMap = [];

    try {
      // Platinum Standard: Batch operations using Future.wait to avoid N+1 latency
      final results = await Future.wait([
        _donationsApi.getMyEscrow().catchError((_) => <String, dynamic>{}),
        _paymentsApi.getMyPayments(limit: 50).catchError((_) => <Map<String, dynamic>>[]),
      ]);
      escrowSummary = results[0] as Map<String, dynamic>;
      
      final rawTx = results[1];
      if (rawTx is List) {
        transactionsMap = List<Map<String, dynamic>>.from(rawTx.map((x) => x as Map<String, dynamic>));
      }
    } catch (_) {}

    final transactions = transactionsMap.map((tx) => WalletTransactionModel.fromJson(tx)).toList();

    return WalletSummaryModel(
      totalLocked: escrowSummary['total_locked'] ?? 0,
      lockedCount: escrowSummary['locked_count'] ?? 0,
      releasedCount: escrowSummary['released_count'] ?? 0,
      refundedCount: escrowSummary['refunded_count'] ?? 0,
      transactions: transactions,
    );
  }
}
