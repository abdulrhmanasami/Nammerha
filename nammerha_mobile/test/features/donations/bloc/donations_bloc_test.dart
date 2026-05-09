import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:nammerha_mobile/core/network/api_client.dart';
import 'package:nammerha_mobile/core/services/api_services.dart';
import 'package:nammerha_mobile/features/donations/bloc/donations_bloc.dart';
import 'package:nammerha_mobile/features/donations/bloc/donations_event.dart';
import 'package:nammerha_mobile/features/donations/bloc/donations_state.dart';
import 'package:nammerha_mobile/features/donor/models/donor_models.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Donations BLoC Tests — REM-003 Platinum Financial Testing
// ═══════════════════════════════════════════════════════════════════════════
// Tests cover: successful load, error handling, refresh behavior,
// push notification handling, and partial failure resilience.
// ═══════════════════════════════════════════════════════════════════════════

class MockDonorApi extends Mock implements DonorApi {}
class MockDonationsApi extends Mock implements DonationsApi {}

void main() {
  late MockDonorApi mockDonorApi;
  late MockDonationsApi mockDonationsApi;

  setUp(() {
    mockDonorApi = MockDonorApi();
    mockDonationsApi = MockDonationsApi();
  });

  DonationsBloc buildBloc() => DonationsBloc(
        donorApi: mockDonorApi,
        donationsApi: mockDonationsApi,
      );

  group('DonationsBloc', () {
    test('initial state is DonationsInitial', () {
      final bloc = buildBloc();
      expect(bloc.state, isA<DonationsInitial>());
      bloc.close();
    });

    blocTest<DonationsBloc, DonationsState>(
      'emits [Loading, Loaded] when data loads successfully',
      build: () {
        when(() => mockDonorApi.getDonations())
            .thenAnswer((_) async => [
                  const DonorDonationModel(
                    escrowId: 'tx-001',
                    projectTitle: 'Test Project',
                    materialName: 'Cement',
                    amountLocked: 5000,
                    status: 'LOCKED',
                    lockedAt: '2024-01-01T00:00:00Z',
                  ),
                ]);
        when(() => mockDonationsApi.getMyEscrow())
            .thenAnswer((_) async => {
                  'totalLocked': 5000,
                  'totalReleased': 2000,
                  'count': 1,
                });
        return buildBloc();
      },
      act: (bloc) => bloc.add(const DonationsLoadRequested()),
      expect: () => [
        isA<DonationsLoading>(),
        isA<DonationsLoaded>(),
      ],
      verify: (_) {
        verify(() => mockDonorApi.getDonations()).called(1);
        verify(() => mockDonationsApi.getMyEscrow()).called(1);
      },
    );

    blocTest<DonationsBloc, DonationsState>(
      'emits [Loading, Loaded] with empty data when both APIs return empty',
      build: () {
        when(() => mockDonorApi.getDonations())
            .thenAnswer((_) async => []);
        when(() => mockDonationsApi.getMyEscrow())
            .thenAnswer((_) async => {});
        return buildBloc();
      },
      act: (bloc) => bloc.add(const DonationsLoadRequested()),
      expect: () => [
        isA<DonationsLoading>(),
        isA<DonationsLoaded>(),
      ],
    );

    blocTest<DonationsBloc, DonationsState>(
      'emits [Loading, Loaded] even when donations API fails (partial resilience)',
      build: () {
        when(() => mockDonorApi.getDonations())
            .thenThrow(const ApiException('Network error'));
        when(() => mockDonationsApi.getMyEscrow())
            .thenAnswer((_) async => {'totalLocked': 1000});
        return buildBloc();
      },
      act: (bloc) => bloc.add(const DonationsLoadRequested()),
      expect: () => [
        isA<DonationsLoading>(),
        isA<DonationsLoaded>(), // Should still succeed with empty donations list
      ],
    );

    blocTest<DonationsBloc, DonationsState>(
      'emits [Loading, Loaded] even when escrow API fails (partial resilience)',
      build: () {
        when(() => mockDonorApi.getDonations())
            .thenAnswer((_) async => [
                  const DonorDonationModel(
                    escrowId: 'tx-002',
                    projectTitle: 'Test Project 2',
                    materialName: 'Steel',
                    amountLocked: 3000,
                    status: 'LOCKED',
                    lockedAt: '2024-01-02T00:00:00Z',
                  ),
                ]);
        when(() => mockDonationsApi.getMyEscrow())
            .thenThrow(const ApiException('Server error'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(const DonationsLoadRequested()),
      expect: () => [
        isA<DonationsLoading>(),
        isA<DonationsLoaded>(), // Should still succeed with empty summary
      ],
    );

    blocTest<DonationsBloc, DonationsState>(
      'refresh does NOT emit Loading state (keeps data visible)',
      build: () {
        when(() => mockDonorApi.getDonations())
            .thenAnswer((_) async => []);
        when(() => mockDonationsApi.getMyEscrow())
            .thenAnswer((_) async => {});
        return buildBloc();
      },
      act: (bloc) => bloc.add(const DonationsRefreshRequested()),
      expect: () => [
        // Should NOT contain DonationsLoading — only DonationsLoaded
        isA<DonationsLoaded>(),
      ],
    );

    blocTest<DonationsBloc, DonationsState>(
      'push notification triggers data refresh',
      build: () {
        when(() => mockDonorApi.getDonations())
            .thenAnswer((_) async => []);
        when(() => mockDonationsApi.getMyEscrow())
            .thenAnswer((_) async => {});
        return buildBloc();
      },
      act: (bloc) => bloc.add(const DonationUpdatedFromPush({'type': 'donation_confirmed'})),
      expect: () => [
        isA<DonationsLoaded>(),
      ],
    );
  });
}
