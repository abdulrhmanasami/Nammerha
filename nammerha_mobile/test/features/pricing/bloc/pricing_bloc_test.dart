import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:nammerha_mobile/features/pricing/bloc/pricing_bloc.dart';
import 'package:nammerha_mobile/core/services/api_services.dart';

class MockSubscriptionsApi extends Mock implements SubscriptionsApi {}

void main() {
  late MockSubscriptionsApi mockApi;

  setUp(() {
    mockApi = MockSubscriptionsApi();
  });

  PricingBloc buildBloc() => PricingBloc(subscriptionsApi: mockApi);

  group('PricingBloc', () {
    test('initial state is correct', () {
      final bloc = buildBloc();
      expect(bloc.state.isLoading, isFalse);
      expect(bloc.state.isSubscribing, isFalse);
      expect(bloc.state.error, isNull);
      bloc.close();
    });

    blocTest<PricingBloc, PricingState>(
      'emits [isSubscribing=true, successMessage] when subscription is successful',
      build: () {
        when(() => mockApi.subscribe(any()))
            .thenAnswer((_) async => {'status': 'active'});
        return buildBloc();
      },
      act: (bloc) => bloc.add(SubscribeToPlan('pro')),
      expect: () => [
        isA<PricingState>().having((s) => s.isSubscribing, 'isSubscribing', true),
        isA<PricingState>()
            .having((s) => s.isSubscribing, 'isSubscribing', false)
            .having((s) => s.successMessage, 'successMessage', isNotNull)
            .having((s) => s.subscriptionResult, 'subscriptionResult', isNotNull),
      ],
    );

    blocTest<PricingBloc, PricingState>(
      'emits [isSubscribing=true, error] when subscription fails',
      build: () {
        when(() => mockApi.subscribe(any()))
            .thenThrow(Exception('Failed to subscribe'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(SubscribeToPlan('pro')),
      expect: () => [
        isA<PricingState>().having((s) => s.isSubscribing, 'isSubscribing', true),
        isA<PricingState>()
            .having((s) => s.isSubscribing, 'isSubscribing', false)
            .having((s) => s.error, 'error', isNotNull),
      ],
    );
  });
}
