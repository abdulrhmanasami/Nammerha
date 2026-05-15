import 'package:equatable/equatable.dart';
import '../models/wallet_model.dart';

abstract class WalletState extends Equatable {
  const WalletState();

  @override
  List<Object?> get props => [];
}

class WalletInitial extends WalletState {}

class WalletLoading extends WalletState {}

class WalletLoaded extends WalletState {
  final WalletSummaryModel walletData;
  final bool hasMore;
  final bool isLoadingMore;

  const WalletLoaded({
    required this.walletData,
    this.hasMore = true,
    this.isLoadingMore = false,
  });

  WalletLoaded copyWith({
    WalletSummaryModel? walletData,
    bool? hasMore,
    bool? isLoadingMore,
  }) {
    return WalletLoaded(
      walletData: walletData ?? this.walletData,
      hasMore: hasMore ?? this.hasMore,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
    );
  }

  @override
  List<Object?> get props => [walletData, hasMore, isLoadingMore];
}

class WalletError extends WalletState {
  final String message;

  const WalletError(this.message);

  @override
  List<Object?> get props => [message];
}
