import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:nammerha_mobile/features/wallet/bloc/wallet_bloc.dart';
import 'package:nammerha_mobile/features/wallet/bloc/wallet_event.dart';
import 'package:nammerha_mobile/features/wallet/bloc/wallet_state.dart';
import 'package:nammerha_mobile/features/wallet/data/wallet_repository.dart';
import 'package:nammerha_mobile/features/wallet/models/wallet_model.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Wallet BLoC Tests — REM-003 Financial Integrity
// ═══════════════════════════════════════════════════════════════════════════

class MockWalletRepository extends Mock implements WalletRepository {}

void main() {
  late MockWalletRepository mockRepo;

  setUp(() {
    mockRepo = MockWalletRepository();
  });

  WalletBloc buildBloc() => WalletBloc(repository: mockRepo);

  group('WalletBloc', () {
    test('initial state is WalletInitial', () {
      final bloc = buildBloc();
      expect(bloc.state, isA<WalletInitial>());
      bloc.close();
    });

    blocTest<WalletBloc, WalletState>(
      'emits [Loading, Loaded] on successful wallet load',
      build: () {
        when(() => mockRepo.loadWallet()).thenAnswer(
          (_) async => const WalletSummaryModel(
            totalLocked: 50000,
            lockedCount: 3,
            releasedCount: 1,
            refundedCount: 0,
            transactions: [],
          ),
        );
        return buildBloc();
      },
      act: (bloc) => bloc.add(LoadWalletEvent()),
      expect: () => [
        isA<WalletLoading>(),
        isA<WalletLoaded>(),
      ],
      verify: (_) {
        verify(() => mockRepo.loadWallet()).called(1);
      },
    );

    blocTest<WalletBloc, WalletState>(
      'loaded state contains correct wallet data',
      build: () {
        when(() => mockRepo.loadWallet()).thenAnswer(
          (_) async => const WalletSummaryModel(
            totalLocked: 100000,
            lockedCount: 5,
            releasedCount: 2,
            refundedCount: 1,
            transactions: [],
          ),
        );
        return buildBloc();
      },
      act: (bloc) => bloc.add(LoadWalletEvent()),
      expect: () => [
        isA<WalletLoading>(),
        predicate<WalletState>((state) {
          if (state is! WalletLoaded) return false;
          return state.walletData.totalLocked == 100000 &&
              state.walletData.lockedCount == 5 &&
              state.walletData.releasedCount == 2 &&
              state.walletData.refundedCount == 1;
        }),
      ],
    );

    blocTest<WalletBloc, WalletState>(
      'emits [Loading, Error] on repository failure',
      build: () {
        when(() => mockRepo.loadWallet()).thenThrow(Exception('Network error'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(LoadWalletEvent()),
      expect: () => [
        isA<WalletLoading>(),
        isA<WalletError>(),
      ],
    );

    blocTest<WalletBloc, WalletState>(
      'error state contains error message',
      build: () {
        when(() => mockRepo.loadWallet())
            .thenThrow(Exception('Connection refused'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(LoadWalletEvent()),
      expect: () => [
        isA<WalletLoading>(),
        predicate<WalletState>((state) {
          if (state is! WalletError) return false;
          return state.message.contains('Connection refused');
        }),
      ],
    );
  });
}
