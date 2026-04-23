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
      escrowSummary = await _donationsApi.getMyEscrow();
    } catch (_) {}

    try {
      final raw = await _paymentsApi.getMyPayments(limit: 50);
      transactionsMap = raw;
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
