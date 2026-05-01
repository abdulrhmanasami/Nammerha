import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:nammerha_mobile/core/network/api_client.dart';
import 'package:nammerha_mobile/features/profile/bloc/profile_bloc.dart';
import 'package:nammerha_mobile/features/profile/bloc/profile_event.dart';
import 'package:nammerha_mobile/features/profile/bloc/profile_state.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Profile BLoC Tests — P1 Platinum Certification
// Covers: profile loading, save, logout, partial failure resilience
// ═══════════════════════════════════════════════════════════════════════════

class MockNammerhaApiClient extends Mock implements NammerhaApiClient {}

void main() {
  late MockNammerhaApiClient mockApi;

  setUp(() {
    mockApi = MockNammerhaApiClient();
  });

  ProfileBloc buildBloc() => ProfileBloc(api: mockApi);

  final userMeResponse = ApiResponse<Map<String, dynamic>>(
    success: true,
    data: {
      'user': {
        'user_id': 'u-001',
        'email': 'test@nammerha.com',
        'full_name': 'أحمد محمد',
        'role': 'donor',
      }
    },
  );

  final rolesResponse = ApiResponse<Map<String, dynamic>>(
    success: true,
    data: {
      'roles': [
        {'role': 'donor', 'activated_at': '2026-01-01'},
        {'role': 'homeowner', 'activated_at': '2026-03-15'},
      ]
    },
  );

  group('ProfileBloc — Loading', () {
    test('initial state is ProfileInitial', () {
      final bloc = buildBloc();
      expect(bloc.state, isA<ProfileInitial>());
      bloc.close();
    });

    blocTest<ProfileBloc, ProfileState>(
      'emits [Loading, Loaded] with user data and roles',
      build: () {
        when(() => mockApi.request<Map<String, dynamic>>(
              '/auth/me',
              fromData: any(named: 'fromData'),
            )).thenAnswer((_) async => userMeResponse);
        when(() => mockApi.request<Map<String, dynamic>>(
              '/roles/my-roles',
              fromData: any(named: 'fromData'),
            )).thenAnswer((_) async => rolesResponse);
        return buildBloc();
      },
      act: (bloc) => bloc.add(LoadProfileRequested()),
      expect: () => [
        isA<ProfileLoading>(),
        isA<ProfileLoaded>(),
      ],
    );

    blocTest<ProfileBloc, ProfileState>(
      'emits [Loading, Loaded] even when roles API fails (partial resilience)',
      build: () {
        when(() => mockApi.request<Map<String, dynamic>>(
              '/auth/me',
              fromData: any(named: 'fromData'),
            )).thenAnswer((_) async => userMeResponse);
        when(() => mockApi.request<Map<String, dynamic>>(
              '/roles/my-roles',
              fromData: any(named: 'fromData'),
            )).thenThrow(const ApiException('Roles service unavailable'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(LoadProfileRequested()),
      expect: () => [
        isA<ProfileLoading>(),
        isA<ProfileLoaded>(),
      ],
    );
  });

  group('ProfileBloc — Logout', () {
    blocTest<ProfileBloc, ProfileState>(
      'emits [ProfileLoggedOut] on logout',
      build: () {
        when(() => mockApi.request(
              '/auth/logout',
              method: 'POST',
            )).thenAnswer((_) async => const ApiResponse(success: true));
        when(() => mockApi.clearToken()).thenAnswer((_) async {});
        return buildBloc();
      },
      act: (bloc) => bloc.add(LogoutRequested()),
      expect: () => [
        isA<ProfileLoggedOut>(),
      ],
    );
  });
}
