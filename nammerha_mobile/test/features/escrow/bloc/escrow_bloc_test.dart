import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:nammerha_mobile/core/network/api_client.dart';
import 'package:nammerha_mobile/features/escrow/bloc/escrow_bloc.dart';
import 'package:nammerha_mobile/features/escrow/bloc/escrow_event.dart';
import 'package:nammerha_mobile/features/escrow/bloc/escrow_state.dart';
import 'package:nammerha_mobile/features/escrow/data/escrow_repository.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Escrow BLoC Tests — P0 Financial Integrity (Platinum Certification)
// Covers: escrow summary loading, donor donation history (GraphQL+REST),
//         pagination, error handling, empty data resilience
// ═══════════════════════════════════════════════════════════════════════════

class MockEscrowRepository extends Mock implements EscrowRepository {}

void main() {
  late MockEscrowRepository mockRepo;

  setUp(() {
    mockRepo = MockEscrowRepository();
  });

  EscrowBloc buildBloc() => EscrowBloc(repository: mockRepo);

  group('EscrowBloc — Summary', () {
    test('initial state is EscrowInitial', () {
      final bloc = buildBloc();
      expect(bloc.state, isA<EscrowInitial>());
      bloc.close();
    });

    blocTest<EscrowBloc, EscrowState>(
      'emits [Loading, SummaryLoaded] with correct amounts',
      build: () {
        when(() => mockRepo.fetchDonorEscrowSummary())
            .thenAnswer((_) async => {
                  'total_escrowed': 5000000,
                  'total_released': 2000000,
                  'pending_release': 3000000,
                });
        return buildBloc();
      },
      act: (bloc) => bloc.add(FetchEscrowSummaryEvent()),
      expect: () => [
        isA<EscrowLoading>(),
        isA<EscrowSummaryLoaded>(),
      ],
      verify: (bloc) {
        verify(() => mockRepo.fetchDonorEscrowSummary()).called(1);
        final loaded = bloc.state as EscrowSummaryLoaded;
        expect(loaded.summary['total_escrowed'], 5000000);
        expect(loaded.summary['pending_release'], 3000000);
      },
    );

    blocTest<EscrowBloc, EscrowState>(
      'emits [Loading, Error] on network failure',
      build: () {
        when(() => mockRepo.fetchDonorEscrowSummary())
            .thenThrow(const ApiException('فشل في جلب ملخص الضمان'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(FetchEscrowSummaryEvent()),
      expect: () => [
        isA<EscrowLoading>(),
        isA<EscrowError>(),
      ],
    );
  });

  group('EscrowBloc — Donor Donations', () {
    blocTest<EscrowBloc, EscrowState>(
      'emits [Loading, DonationsLoaded] with donation list',
      build: () {
        when(() => mockRepo.fetchDonorDonations(
              limit: any(named: 'limit'),
              offset: any(named: 'offset'),
            )).thenAnswer((_) async => [
              {
                'transaction_id': 'tx-001',
                'amount_cents': 250000,
                'project_title': 'إعادة بناء مدرسة',
                'status': 'confirmed',
              },
              {
                'transaction_id': 'tx-002',
                'amount_cents': 100000,
                'project_title': 'ترميم منزل',
                'status': 'pending',
              },
            ]);
        return buildBloc();
      },
      act: (bloc) => bloc.add(const FetchDonorDonationsEvent(limit: 20, offset: 0)),
      expect: () => [
        isA<EscrowLoading>(),
        isA<DonorDonationsLoaded>(),
      ],
      verify: (bloc) {
        final loaded = bloc.state as DonorDonationsLoaded;
        expect(loaded.donations.length, 2);
        expect(loaded.donations[0]['transaction_id'], 'tx-001');
      },
    );

    blocTest<EscrowBloc, EscrowState>(
      'emits [Loading, DonationsLoaded] with empty list',
      build: () {
        when(() => mockRepo.fetchDonorDonations(
              limit: any(named: 'limit'),
              offset: any(named: 'offset'),
            )).thenAnswer((_) async => []);
        return buildBloc();
      },
      act: (bloc) => bloc.add(const FetchDonorDonationsEvent()),
      expect: () => [
        isA<EscrowLoading>(),
        isA<DonorDonationsLoaded>(),
      ],
      verify: (bloc) {
        final loaded = bloc.state as DonorDonationsLoaded;
        expect(loaded.donations, isEmpty);
      },
    );

    blocTest<EscrowBloc, EscrowState>(
      'emits [Loading, Error] on GraphQL + REST double failure',
      build: () {
        when(() => mockRepo.fetchDonorDonations(
              limit: any(named: 'limit'),
              offset: any(named: 'offset'),
            )).thenThrow(const ApiException('فشل في جلب سجل التبرعات'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(const FetchDonorDonationsEvent()),
      expect: () => [
        isA<EscrowLoading>(),
        isA<EscrowError>(),
      ],
    );

    blocTest<EscrowBloc, EscrowState>(
      'pagination offset is respected',
      build: () {
        when(() => mockRepo.fetchDonorDonations(
              limit: 10,
              offset: 20,
            )).thenAnswer((_) async => [
              {'transaction_id': 'tx-page-3', 'amount_cents': 50000},
            ]);
        return buildBloc();
      },
      act: (bloc) => bloc.add(const FetchDonorDonationsEvent(limit: 10, offset: 20)),
      expect: () => [
        isA<EscrowLoading>(),
        isA<DonorDonationsLoaded>(),
      ],
      verify: (_) {
        verify(() => mockRepo.fetchDonorDonations(limit: 10, offset: 20)).called(1);
      },
    );
  });
}
