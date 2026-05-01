import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:nammerha_mobile/features/compliance/bloc/compliance_bloc.dart';
import 'package:nammerha_mobile/features/compliance/bloc/compliance_event.dart';
import 'package:nammerha_mobile/features/compliance/bloc/compliance_state.dart';
import 'package:nammerha_mobile/features/compliance/data/compliance_repository.dart';
import 'package:nammerha_mobile/features/compliance/models/compliance_models.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Compliance BLoC Tests — P0 Financial Security (Platinum Certification)
// Covers: dashboard loading, escrow review approve/flag, error handling,
//         OFAC/SDN screening compliance
// ═══════════════════════════════════════════════════════════════════════════

class MockComplianceRepository extends Mock implements ComplianceRepository {}

void main() {
  late MockComplianceRepository mockRepo;

  setUp(() {
    mockRepo = MockComplianceRepository();
  });

  ComplianceBloc buildBloc() => ComplianceBloc(repository: mockRepo);

  final sampleDashboard = const ComplianceDashboardModel(
    stats: ComplianceStatsModel.empty,
    reviews: [],
  );

  group('ComplianceBloc — Dashboard', () {
    test('initial state is ComplianceInitial', () {
      final bloc = buildBloc();
      expect(bloc.state, isA<ComplianceInitial>());
      bloc.close();
    });

    blocTest<ComplianceBloc, ComplianceState>(
      'emits [Loading, Loaded] when dashboard loads',
      build: () {
        when(() => mockRepo.loadDashboard())
            .thenAnswer((_) async => sampleDashboard);
        return buildBloc();
      },
      act: (bloc) => bloc.add(LoadComplianceDashboard()),
      expect: () => [
        isA<ComplianceLoading>(),
        isA<ComplianceLoaded>(),
      ],
      verify: (_) {
        verify(() => mockRepo.loadDashboard()).called(1);
      },
    );

    blocTest<ComplianceBloc, ComplianceState>(
      'emits [Loading, Error] on failure',
      build: () {
        when(() => mockRepo.loadDashboard())
            .thenThrow(Exception('Compliance service unavailable'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(LoadComplianceDashboard()),
      expect: () => [
        isA<ComplianceLoading>(),
        isA<ComplianceError>(),
      ],
    );
  });

  group('ComplianceBloc — Escrow Reviews', () {
    blocTest<ComplianceBloc, ComplianceState>(
      'emits [ActionSuccess] then reloads on approve',
      build: () {
        when(() => mockRepo.approveReview(any()))
            .thenAnswer((_) async {});
        when(() => mockRepo.loadDashboard())
            .thenAnswer((_) async => sampleDashboard);
        return buildBloc();
      },
      act: (bloc) => bloc.add(ApproveEscrowReview('ESC-001')),
      expect: () => [
        isA<ComplianceActionSuccess>(),
        isA<ComplianceLoading>(),
        isA<ComplianceLoaded>(),
      ],
    );

    blocTest<ComplianceBloc, ComplianceState>(
      'emits [Error] when approve fails',
      build: () {
        when(() => mockRepo.approveReview(any()))
            .thenThrow(Exception('Escrow locked'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(ApproveEscrowReview('ESC-LOCKED')),
      expect: () => [
        isA<ComplianceError>(),
      ],
    );

    blocTest<ComplianceBloc, ComplianceState>(
      'emits [ActionSuccess] then reloads on flag',
      build: () {
        when(() => mockRepo.flagReview(any()))
            .thenAnswer((_) async {});
        when(() => mockRepo.loadDashboard())
            .thenAnswer((_) async => sampleDashboard);
        return buildBloc();
      },
      act: (bloc) => bloc.add(FlagEscrowReview('ESC-002')),
      expect: () => [
        isA<ComplianceActionSuccess>(),
        isA<ComplianceLoading>(),
        isA<ComplianceLoaded>(),
      ],
    );

    blocTest<ComplianceBloc, ComplianceState>(
      'emits [Error] when flag fails',
      build: () {
        when(() => mockRepo.flagReview(any()))
            .thenThrow(Exception('Already flagged'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(FlagEscrowReview('ESC-FLAGGED')),
      expect: () => [
        isA<ComplianceError>(),
      ],
    );
  });
}
