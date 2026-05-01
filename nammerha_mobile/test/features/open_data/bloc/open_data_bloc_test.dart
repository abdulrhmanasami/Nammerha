import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:nammerha_mobile/features/open_data/bloc/open_data_bloc.dart';
import 'package:nammerha_mobile/core/services/api_services.dart';

class MockOpenDataApi extends Mock implements OpenDataApi {}

void main() {
  late MockOpenDataApi mockApi;

  setUp(() {
    mockApi = MockOpenDataApi();
  });

  OpenDataBloc buildBloc() => OpenDataBloc(openDataApi: mockApi);

  group('OpenDataBloc', () {
    test('initial state is correct', () {
      final bloc = buildBloc();
      expect(bloc.state.isLoading, isFalse);
      expect(bloc.state.error, isNull);
      expect(bloc.state.stats, isEmpty);
      expect(bloc.state.projects, isEmpty);
      bloc.close();
    });

    blocTest<OpenDataBloc, OpenDataState>(
      'emits [isLoading=true, stats, projects] when LoadOpenDataDashboard is successful',
      build: () {
        when(() => mockApi.getStats())
            .thenAnswer((_) async => {'total_projects': 100});
        when(() => mockApi.getProjectListings(
              limit: any(named: 'limit'),
              offset: any(named: 'offset'),
            )).thenAnswer((_) async => [{'title': 'Project A'}]);
        return buildBloc();
      },
      act: (bloc) => bloc.add(LoadOpenDataDashboard()),
      expect: () => [
        isA<OpenDataState>().having((s) => s.isLoading, 'isLoading', true),
        isA<OpenDataState>()
            .having((s) => s.isLoading, 'isLoading', false)
            .having((s) => s.stats['total_projects'], 'stats', 100)
            .having((s) => s.projects.length, 'projects', 1),
      ],
    );

    blocTest<OpenDataBloc, OpenDataState>(
      'emits [isLoading=true, error] when LoadOpenDataDashboard fails',
      build: () {
        when(() => mockApi.getStats())
            .thenThrow(Exception('Failed to load stats'));
        when(() => mockApi.getProjectListings(
              limit: any(named: 'limit'),
              offset: any(named: 'offset'),
            )).thenAnswer((_) async => []);
        return buildBloc();
      },
      act: (bloc) => bloc.add(LoadOpenDataDashboard()),
      expect: () => [
        isA<OpenDataState>().having((s) => s.isLoading, 'isLoading', true),
        isA<OpenDataState>()
            .having((s) => s.isLoading, 'isLoading', false)
            .having((s) => s.error, 'error', isNotNull),
      ],
    );
  });
}
