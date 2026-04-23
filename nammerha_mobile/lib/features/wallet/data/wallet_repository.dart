import '../../../core/services/api_services.dart';
import '../models/wallet_model.dart';

class WalletRepository {
  final DonationsApi _donationsApi;
  final PaymentsApi _paymentsApi;

  WalletRepository({DonationsApi? donationsApi, PaymentsApi? paymentsApi})
      : _donationsApi = donationsApi ?? DonationsApi(),
        _paymentsApi = paymentsApi ?? PaymentsApi();

  Future<WalletSummaryModel> loadWallet() async {
    final results = await Future.wait([
      _donationsApi.getMyEscrow(),
      _paymentsApi.getMyPayments(limit: 50),
    ]);

    final escrowSummary = results[0] as Map<String, dynamic>;
    final transactionsMap = (results[1] as List).cast<Map<String, dynamic>>();

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
