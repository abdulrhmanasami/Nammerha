import 'package:equatable/equatable.dart';

abstract class WalletEvent extends Equatable {
  const WalletEvent();

  @override
  List<Object?> get props => [];
}

class LoadWalletEvent extends WalletEvent {}

/// Wave 4: Infinite scroll — loads next page of transactions
class LoadMoreTransactionsEvent extends WalletEvent {
  const LoadMoreTransactionsEvent();
}
