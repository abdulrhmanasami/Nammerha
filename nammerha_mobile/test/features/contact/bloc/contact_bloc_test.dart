import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:nammerha_mobile/features/contact/bloc/contact_bloc.dart';
import 'package:nammerha_mobile/core/services/api_services.dart';

class MockContactApi extends Mock implements ContactApi {}

void main() {
  late MockContactApi mockApi;

  setUp(() {
    mockApi = MockContactApi();
  });

  ContactBloc buildBloc() => ContactBloc(contactApi: mockApi);

  group('ContactBloc', () {
    test('initial state is correct', () {
      final bloc = buildBloc();
      expect(bloc.state.isSubmitting, isFalse);
      expect(bloc.state.isSuccess, isFalse);
      expect(bloc.state.error, isNull);
      bloc.close();
    });

    blocTest<ContactBloc, ContactState>(
      'emits [isSubmitting=true, isSuccess=true] when submission is successful',
      build: () {
        when(() => mockApi.submitContactForm(
              name: any(named: 'name'),
              email: any(named: 'email'),
              subject: any(named: 'subject'),
              message: any(named: 'message'),
            )).thenAnswer((_) async {});
        return buildBloc();
      },
      act: (bloc) => bloc.add(SubmitContactForm(
        name: 'Test',
        email: 'test@example.com',
        subject: 'General Inquiry',
        message: 'Hello, world!',
      )),
      expect: () => [
        isA<ContactState>().having((s) => s.isSubmitting, 'isSubmitting', true),
        isA<ContactState>()
            .having((s) => s.isSubmitting, 'isSubmitting', false)
            .having((s) => s.isSuccess, 'isSuccess', true),
      ],
    );

    blocTest<ContactBloc, ContactState>(
      'emits [isSubmitting=true, error] when submission fails',
      build: () {
        when(() => mockApi.submitContactForm(
              name: any(named: 'name'),
              email: any(named: 'email'),
              subject: any(named: 'subject'),
              message: any(named: 'message'),
            )).thenThrow(Exception('Failed'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(SubmitContactForm(
        name: 'Test',
        email: 'test@example.com',
        subject: 'General Inquiry',
        message: 'Hello, world!',
      )),
      expect: () => [
        isA<ContactState>().having((s) => s.isSubmitting, 'isSubmitting', true),
        isA<ContactState>()
            .having((s) => s.isSubmitting, 'isSubmitting', false)
            .having((s) => s.error, 'error', isNotNull),
      ],
    );

    blocTest<ContactBloc, ContactState>(
      'emits initial state on ResetContactForm',
      build: () => buildBloc(),
      seed: () => const ContactState(isSubmitting: false, isSuccess: true),
      act: (bloc) => bloc.add(ResetContactForm()),
      expect: () => [
        isA<ContactState>()
            .having((s) => s.isSubmitting, 'isSubmitting', false)
            .having((s) => s.isSuccess, 'isSuccess', false)
            .having((s) => s.error, 'error', isNull),
      ],
    );
  });
}
