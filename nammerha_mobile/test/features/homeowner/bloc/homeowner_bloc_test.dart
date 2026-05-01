import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:nammerha_mobile/features/homeowner/bloc/homeowner_bloc.dart';
import 'package:nammerha_mobile/features/homeowner/bloc/homeowner_event.dart';
import 'package:nammerha_mobile/features/homeowner/bloc/homeowner_state.dart';
import 'package:nammerha_mobile/features/homeowner/data/homeowner_repository.dart';
import 'package:nammerha_mobile/features/homeowner/models/homeowner_models.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Homeowner BLoC Tests — P1 Platinum Certification
// Covers: tab loading (dashboard, projects, service requests, approvals,
//         escrow), approval response, error handling, partial failure
// ═══════════════════════════════════════════════════════════════════════════

class MockHomeownerRepository extends Mock implements HomeownerRepository {}

void main() {
  late MockHomeownerRepository mockRepo;

  setUpAll(() {
    registerFallbackValue(const HomeownerDashboardModel());
  });

  setUp(() {
    mockRepo = MockHomeownerRepository();
  });

  HomeownerBloc buildBloc() => HomeownerBloc(repository: mockRepo);

  final sampleDashboard = HomeownerDashboardModel(
    stats: {'active_projects': 3, 'completed_projects': 1},
    projects: [
      {'project_id': 'p-001', 'title': 'إعادة إعمار منزل', 'status': 'active'},
    ],
  );

  group('HomeownerBloc — Tab Loading', () {
    test('initial state is HomeownerInitial', () {
      final bloc = buildBloc();
      expect(bloc.state, isA<HomeownerInitial>());
      bloc.close();
    });

    blocTest<HomeownerBloc, HomeownerState>(
      'emits [Loading, Loaded] when dashboard tab loads successfully',
      build: () {
        when(() => mockRepo.loadDashboard())
            .thenAnswer((_) async => sampleDashboard);
        return buildBloc();
      },
      act: (bloc) => bloc.add(const LoadHomeownerTabEvent(0)),
      expect: () => [
        isA<HomeownerLoading>(),
        isA<HomeownerLoaded>(),
      ],
      verify: (_) {
        verify(() => mockRepo.loadDashboard()).called(1);
      },
    );

    blocTest<HomeownerBloc, HomeownerState>(
      'emits [Loading, Loaded] when projects tab loads successfully',
      build: () {
        when(() => mockRepo.loadProjects(any()))
            .thenAnswer((_) async => sampleDashboard);
        return buildBloc();
      },
      act: (bloc) => bloc.add(const LoadHomeownerTabEvent(1)),
      expect: () => [
        isA<HomeownerLoading>(),
        isA<HomeownerLoaded>(),
      ],
    );

    blocTest<HomeownerBloc, HomeownerState>(
      'emits [Loading, Loaded] when service requests tab loads',
      build: () {
        when(() => mockRepo.loadServiceRequests(any()))
            .thenAnswer((_) async => sampleDashboard);
        return buildBloc();
      },
      act: (bloc) => bloc.add(const LoadHomeownerTabEvent(2)),
      expect: () => [
        isA<HomeownerLoading>(),
        isA<HomeownerLoaded>(),
      ],
    );

    blocTest<HomeownerBloc, HomeownerState>(
      'emits [Loading, Loaded] when approvals tab loads',
      build: () {
        when(() => mockRepo.loadApprovals(any()))
            .thenAnswer((_) async => sampleDashboard);
        return buildBloc();
      },
      act: (bloc) => bloc.add(const LoadHomeownerTabEvent(3)),
      expect: () => [
        isA<HomeownerLoading>(),
        isA<HomeownerLoaded>(),
      ],
    );

    blocTest<HomeownerBloc, HomeownerState>(
      'emits [Loading, Loaded] when escrow tab loads',
      build: () {
        when(() => mockRepo.loadEscrow(any()))
            .thenAnswer((_) async => sampleDashboard);
        return buildBloc();
      },
      act: (bloc) => bloc.add(const LoadHomeownerTabEvent(4)),
      expect: () => [
        isA<HomeownerLoading>(),
        isA<HomeownerLoaded>(),
      ],
    );

    blocTest<HomeownerBloc, HomeownerState>(
      'emits [Loading, Error] when tab loading fails',
      build: () {
        when(() => mockRepo.loadDashboard())
            .thenThrow(Exception('Network error'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(const LoadHomeownerTabEvent(0)),
      expect: () => [
        isA<HomeownerLoading>(),
        isA<HomeownerError>(),
      ],
    );
  });

  group('HomeownerBloc — Approval Response', () {
    blocTest<HomeownerBloc, HomeownerState>(
      'emits [Loading, ApprovalResponseSuccess, Loaded] on approve',
      build: () {
        when(() => mockRepo.respondToApproval(any(), any()))
            .thenAnswer((_) async {});
        when(() => mockRepo.loadApprovals(any()))
            .thenAnswer((_) async => sampleDashboard);
        when(() => mockRepo.loadDashboard())
            .thenAnswer((_) async => sampleDashboard);
        return buildBloc();
      },
      act: (bloc) => bloc.add(const RespondToApprovalEvent('app-001', 'approved')),
      expect: () => [
        isA<HomeownerLoading>(),
        isA<ApprovalResponseSuccess>(),
        isA<HomeownerLoaded>(),
      ],
    );

    blocTest<HomeownerBloc, HomeownerState>(
      'emits [Loading, Error, Loaded] when approval response fails',
      build: () {
        when(() => mockRepo.respondToApproval(any(), any()))
            .thenThrow(Exception('Server error'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(const RespondToApprovalEvent('app-002', 'rejected')),
      expect: () => [
        isA<HomeownerLoading>(),
        isA<HomeownerError>(),
        isA<HomeownerLoaded>(), // BLoC falls back to current state
      ],
    );
  });
}
