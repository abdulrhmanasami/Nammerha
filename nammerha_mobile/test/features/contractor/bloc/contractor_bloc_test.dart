import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:nammerha_mobile/features/contractor/bloc/contractor_bloc.dart';
import 'package:nammerha_mobile/features/contractor/bloc/contractor_event.dart';
import 'package:nammerha_mobile/features/contractor/bloc/contractor_state.dart';
import 'package:nammerha_mobile/features/contractor/data/contractor_repository.dart';
import 'package:nammerha_mobile/features/contractor/models/contractor_models.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Contractor BLoC Tests — P1 Platinum Certification
// Covers: dashboard loading, bid submission, error handling,
//         action success states, concurrent API loading
// ═══════════════════════════════════════════════════════════════════════════

class MockContractorRepository extends Mock implements ContractorRepository {}

void main() {
  late MockContractorRepository mockRepo;

  setUp(() {
    mockRepo = MockContractorRepository();
  });

  ContractorBloc buildBloc() => ContractorBloc(repository: mockRepo);

  final sampleDashboard = ContractorDashboardModel(
    stats: ContractorStatsModel.empty,
    projects: [],
    marketplace: [],
    bids: [],
    payments: [],
  );

  group('ContractorBloc — Dashboard', () {
    test('initial state is ContractorInitial', () {
      final bloc = buildBloc();
      expect(bloc.state, isA<ContractorInitial>());
      bloc.close();
    });

    blocTest<ContractorBloc, ContractorState>(
      'emits [Loading, Loaded] when dashboard loads successfully',
      build: () {
        when(() => mockRepo.loadFullDashboard())
            .thenAnswer((_) async => sampleDashboard);
        return buildBloc();
      },
      act: (bloc) => bloc.add(LoadContractorDashboard()),
      expect: () => [
        isA<ContractorLoading>(),
        isA<ContractorLoaded>(),
      ],
      verify: (_) {
        verify(() => mockRepo.loadFullDashboard()).called(1);
      },
    );

    blocTest<ContractorBloc, ContractorState>(
      'emits [Loading, Error] when dashboard loading fails',
      build: () {
        when(() => mockRepo.loadFullDashboard())
            .thenThrow(Exception('Network timeout'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(LoadContractorDashboard()),
      expect: () => [
        isA<ContractorLoading>(),
        isA<ContractorError>(),
      ],
    );
  });

  group('ContractorBloc — Bid Submission', () {
    blocTest<ContractorBloc, ContractorState>(
      'emits [ActionSuccess] then reloads on bid submission',
      build: () {
        when(() => mockRepo.submitBid(
              projectId: any(named: 'projectId'),
              proposedCost: any(named: 'proposedCost'),
              estimatedDays: any(named: 'estimatedDays'),
              coverLetter: any(named: 'coverLetter'),
            )).thenAnswer((_) async {});
        when(() => mockRepo.loadFullDashboard())
            .thenAnswer((_) async => sampleDashboard);
        return buildBloc();
      },
      act: (bloc) => bloc.add(const SubmitContractorBid(
        projectId: 'proj-001',
        proposedCost: 5000000,
        estimatedDays: 90,
        coverLetter: 'شركة البناء المتحدة - عرض مقاولات',
      )),
      expect: () => [
        isA<ContractorActionSuccess>(),
        isA<ContractorLoading>(),
        isA<ContractorLoaded>(),
      ],
    );

    blocTest<ContractorBloc, ContractorState>(
      'emits [Error] when bid submission fails',
      build: () {
        when(() => mockRepo.submitBid(
              projectId: any(named: 'projectId'),
              proposedCost: any(named: 'proposedCost'),
              estimatedDays: any(named: 'estimatedDays'),
              coverLetter: any(named: 'coverLetter'),
            )).thenThrow(Exception('Project already awarded'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(const SubmitContractorBid(
        projectId: 'proj-awarded',
        proposedCost: 3000000,
        estimatedDays: 60,
      )),
      expect: () => [
        isA<ContractorError>(),
      ],
    );
  });
}
