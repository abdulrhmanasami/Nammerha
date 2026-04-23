import 'package:equatable/equatable.dart';

class WalletTransactionModel extends Equatable {
  final String id;
  final String materialName;
  final num amount;
  final String status;
  final String createdAt;

  const WalletTransactionModel({
    required this.id,
    required this.materialName,
    required this.amount,
    required this.status,
    required this.createdAt,
  });

  factory WalletTransactionModel.fromJson(Map<String, dynamic> json) {
    return WalletTransactionModel(
      id: (json['id'] ?? '').toString(),
      materialName: json['material_name']?.toString() ?? json['description']?.toString() ?? 'معاملة',
      amount: json['amount'] ?? json['amount_locked'] ?? 0,
      status: json['payment_status']?.toString() ?? json['status']?.toString() ?? 'pending',
      createdAt: json['created_at']?.toString() ?? json['createdAt']?.toString() ?? '',
    );
  }

  @override
  List<Object?> get props => [id, materialName, amount, status, createdAt];
}

class WalletSummaryModel extends Equatable {
  final num totalLocked;
  final int lockedCount;
  final int releasedCount;
  final int refundedCount;
  final List<WalletTransactionModel> transactions;

  const WalletSummaryModel({
    required this.totalLocked,
    required this.lockedCount,
    required this.releasedCount,
    required this.refundedCount,
    required this.transactions,
  });

  @override
  List<Object?> get props => [
        totalLocked,
        lockedCount,
        releasedCount,
        refundedCount,
        transactions,
      ];
}
