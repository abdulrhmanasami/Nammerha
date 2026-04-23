import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/wallet_repository.dart';
import 'wallet_event.dart';
import 'wallet_state.dart';

class WalletBloc extends Bloc<WalletEvent, WalletState> {
  final WalletRepository repository;

  WalletBloc({required this.repository}) : super(WalletInitial()) {
    on<LoadWalletEvent>(_onLoadWallet);
  }

  Future<void> _onLoadWallet(LoadWalletEvent event, Emitter<WalletState> emit) async {
    emit(WalletLoading());
    try {
      final data = await repository.loadWallet();
      emit(WalletLoaded(walletData: data));
    } catch (e) {
      emit(WalletError(e.toString()));
    }
  }
}
