import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:nammerha_mobile/features/oracle/bloc/oracle_bloc.dart';
import 'package:nammerha_mobile/core/services/api_services.dart';

class MockEpaOracleApi extends Mock implements EpaOracleApi {}

void main() {
  late MockEpaOracleApi mockApi;

  setUp(() {
    mockApi = MockEpaOracleApi();
  });

  OracleBloc buildBloc() => OracleBloc(api: mockApi);

  group('OracleBloc', () {
    test('initial state is correct', () {
      final bloc = buildBloc();
      expect(bloc.state.isLoading, isFalse);
      expect(bloc.state.error, isNull);
      expect(bloc.state.prices, isEmpty);
      expect(bloc.state.history, isEmpty);
      bloc.close();
    });

    blocTest<OracleBloc, OracleState>(
      'emits [isLoading=true, prices] when LoadOraclePrices is successful',
      build: () {
        when(() => mockApi.getPrices(materialCode: any(named: 'materialCode')))
            .thenAnswer((_) async => [{'material_name': 'Steel', 'current_price': 100}]);
        return buildBloc();
      },
      act: (bloc) => bloc.add(LoadOraclePrices()),
      expect: () => [
        isA<OracleState>().having((s) => s.isLoading, 'isLoading', true),
        isA<OracleState>()
            .having((s) => s.isLoading, 'isLoading', false)
            .having((s) => s.prices.length, 'prices', 1),
      ],
    );

    blocTest<OracleBloc, OracleState>(
      'emits [isLoading=true, calculationResult] when CalculateEPAAdjustment is successful',
      build: () {
        when(() => mockApi.calculateAdjustment(
              projectId: any(named: 'projectId'),
              milestoneId: any(named: 'milestoneId'),
              fidicParams: any(named: 'fidicParams'),
              originalAmount: any(named: 'originalAmount'),
            )).thenAnswer((_) async => {'adjusted_amount': 150});
        return buildBloc();
      },
      act: (bloc) => bloc.add(CalculateEPAAdjustment(
        projectId: 'proj_1',
        fidicParams: {'a': 0.35},
        originalAmount: 100,
      )),
      expect: () => [
        isA<OracleState>().having((s) => s.isLoading, 'isLoading', true),
        isA<OracleState>()
            .having((s) => s.isLoading, 'isLoading', false)
            .having((s) => s.calculationResult, 'calculationResult', isNotNull),
      ],
    );

    blocTest<OracleBloc, OracleState>(
      'emits [isLoading=true, history] when LoadAdjustmentHistory is successful',
      build: () {
        when(() => mockApi.getHistory(any()))
            .thenAnswer((_) async => [{'adjusted_amount': 150}]);
        return buildBloc();
      },
      act: (bloc) => bloc.add(LoadAdjustmentHistory('proj_1')),
      expect: () => [
        isA<OracleState>().having((s) => s.isLoading, 'isLoading', true),
        isA<OracleState>()
            .having((s) => s.isLoading, 'isLoading', false)
            .having((s) => s.history.length, 'history', 1),
      ],
    );
  });
}
