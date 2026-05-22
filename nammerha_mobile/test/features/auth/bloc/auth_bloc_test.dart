import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:nammerha_mobile/core/network/api_client.dart';
import 'package:nammerha_mobile/features/auth/bloc/auth_bloc.dart';
import 'package:nammerha_mobile/features/auth/repositories/auth_repository.dart';
// P1-W15-FIX: Import LoginResult for login() mock stubs.
// PREVIOUS: Tests returned raw NammerhaUser from login() mocks, but login()
// was changed (P1-W14-001) to return Future<LoginResult> for MFA support.

// ═══════════════════════════════════════════════════════════════════════════
// Auth BLoC Tests — P0 Platinum Certification
// Covers: login, register, logout, session, forgot password, change password,
//         reset password, error handling, unverified email guard
// UNIFIED CITIZEN: Role switch tests removed — no longer supported.
// ═══════════════════════════════════════════════════════════════════════════

class MockAuthRepository extends Mock implements AuthRepository {}

const _testUser = NammerhaUser(
  userId: 'user-001',
  email: 'test@nammerha.com',
  fullName: 'أحمد محمد',
  role: 'donor',
  roles: ['homeowner', 'engineer', 'contractor', 'supplier', 'tradesperson', 'donor'],
  isActive: true,
  isEmailVerified: true,
);

const _unverifiedUser = NammerhaUser(
  userId: 'user-002',
  email: 'unverified@nammerha.com',
  fullName: 'سارة خالد',
  role: 'donor',
  roles: ['donor'],
  isActive: true,
  isEmailVerified: false,
);

void main() {
  late MockAuthRepository mockRepo;

  setUp(() {
    mockRepo = MockAuthRepository();
  });

  AuthBloc buildBloc() => AuthBloc(authRepository: mockRepo);

  group('AuthBloc — Session Check', () {
    test('initial state is AuthInitial', () {
      final bloc = buildBloc();
      expect(bloc.state, isA<AuthInitial>());
      bloc.close();
    });

    blocTest<AuthBloc, AuthState>(
      'emits [Loading, Authenticated] when session is valid',
      build: () {
        when(() => mockRepo.getCurrentUser())
            .thenAnswer((_) async => _testUser);
        return buildBloc();
      },
      act: (bloc) => bloc.add(AuthCheckSession()),
      expect: () => [
        isA<AuthLoading>(),
        isA<AuthAuthenticated>(),
      ],
      verify: (_) {
        verify(() => mockRepo.getCurrentUser()).called(1);
      },
    );

    blocTest<AuthBloc, AuthState>(
      'emits [Loading, Unauthenticated] when no session',
      build: () {
        when(() => mockRepo.getCurrentUser())
            .thenAnswer((_) async => null);
        return buildBloc();
      },
      act: (bloc) => bloc.add(AuthCheckSession()),
      expect: () => [
        isA<AuthLoading>(),
        isA<AuthUnauthenticated>(),
      ],
    );

    blocTest<AuthBloc, AuthState>(
      'emits [Loading, Unauthenticated] on session check failure',
      build: () {
        when(() => mockRepo.getCurrentUser())
            .thenThrow(Exception('Network error'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(AuthCheckSession()),
      expect: () => [
        isA<AuthLoading>(),
        isA<AuthUnauthenticated>(),
      ],
    );
  });

  group('AuthBloc — Login', () {
    blocTest<AuthBloc, AuthState>(
      'emits [Loading, Authenticated] on successful login',
      build: () {
        when(() => mockRepo.login(
              email: any(named: 'email'),
              password: any(named: 'password'),
            )).thenAnswer((_) async => LoginResult.authenticated(_testUser));
        return buildBloc();
      },
      act: (bloc) => bloc.add(const AuthLoginRequested(
        email: 'test@nammerha.com',
        password: 'SecurePass123!',
      )),
      expect: () => [
        isA<AuthLoading>(),
        isA<AuthAuthenticated>(),
      ],
    );

    blocTest<AuthBloc, AuthState>(
      'emits [Loading, EmailNotVerified] when email is unverified',
      build: () {
        when(() => mockRepo.login(
              email: any(named: 'email'),
              password: any(named: 'password'),
            )).thenAnswer((_) async => LoginResult.authenticated(_unverifiedUser));
        return buildBloc();
      },
      act: (bloc) => bloc.add(const AuthLoginRequested(
        email: 'unverified@nammerha.com',
        password: 'SecurePass123!',
      )),
      expect: () => [
        isA<AuthLoading>(),
        isA<AuthEmailNotVerified>(),
      ],
    );

    blocTest<AuthBloc, AuthState>(
      'emits [Loading, Error] on ApiException',
      build: () {
        when(() => mockRepo.login(
              email: any(named: 'email'),
              password: any(named: 'password'),
            )).thenThrow(const ApiException('Invalid credentials'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(const AuthLoginRequested(
        email: 'wrong@nammerha.com',
        password: 'WrongPass',
      )),
      expect: () => [
        isA<AuthLoading>(),
        isA<AuthError>(),
      ],
    );

    blocTest<AuthBloc, AuthState>(
      'emits [Loading, EmailNotVerified] when backend returns verify email error',
      build: () {
        when(() => mockRepo.login(
              email: any(named: 'email'),
              password: any(named: 'password'),
            )).thenThrow(const ApiException(
          'Please verify your email before signing in.',
          statusCode: 403,
        ));
        return buildBloc();
      },
      act: (bloc) => bloc.add(const AuthLoginRequested(
        email: 'm.building2026@gmail.com',
        password: 'Building.2026',
      )),
      expect: () => [
        isA<AuthLoading>(),
        isA<AuthEmailNotVerified>(),
      ],
    );
  });

  group('AuthBloc — Register', () {
    blocTest<AuthBloc, AuthState>(
      'emits [Loading, RegistrationSuccess] on successful register',
      build: () {
        when(() => mockRepo.register(
              email: any(named: 'email'),
              password: any(named: 'password'),
              fullName: any(named: 'fullName'),
            )).thenAnswer((_) async => 'تم إرسال رابط التحقق');
        return buildBloc();
      },
      act: (bloc) => bloc.add(const AuthRegisterRequested(
        email: 'new@nammerha.com',
        password: 'SecurePass123!',
        fullName: 'خالد أحمد',
      )),
      expect: () => [
        isA<AuthLoading>(),
        isA<AuthRegistrationSuccess>(),
      ],
    );

    blocTest<AuthBloc, AuthState>(
      'emits [Loading, Error] on duplicate email',
      build: () {
        when(() => mockRepo.register(
              email: any(named: 'email'),
              password: any(named: 'password'),
              fullName: any(named: 'fullName'),
            )).thenThrow(const ApiException('Email already registered'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(const AuthRegisterRequested(
        email: 'existing@nammerha.com',
        password: 'SecurePass123!',
        fullName: 'مكرر',
      )),
      expect: () => [
        isA<AuthLoading>(),
        isA<AuthError>(),
      ],
    );
  });

  group('AuthBloc — Logout', () {
    blocTest<AuthBloc, AuthState>(
      'emits [Unauthenticated] on logout',
      build: () {
        when(() => mockRepo.logout()).thenAnswer((_) async {});
        return buildBloc();
      },
      act: (bloc) => bloc.add(AuthLogoutRequested()),
      expect: () => [
        isA<AuthUnauthenticated>(),
      ],
      verify: (_) {
        verify(() => mockRepo.logout()).called(1);
      },
    );
  });

  group('AuthBloc — Forgot Password', () {
    blocTest<AuthBloc, AuthState>(
      'emits [Loading, PasswordResetSent] on success',
      build: () {
        when(() => mockRepo.forgotPassword(email: any(named: 'email')))
            .thenAnswer((_) async => 'تم إرسال رابط إعادة التعيين');
        return buildBloc();
      },
      act: (bloc) => bloc.add(const AuthForgotPassword('test@nammerha.com')),
      expect: () => [
        isA<AuthLoading>(),
        isA<AuthPasswordResetSent>(),
      ],
    );

    blocTest<AuthBloc, AuthState>(
      'emits [Loading, Error] on failure',
      build: () {
        when(() => mockRepo.forgotPassword(email: any(named: 'email')))
            .thenThrow(const ApiException('User not found'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(const AuthForgotPassword('unknown@email.com')),
      expect: () => [
        isA<AuthLoading>(),
        isA<AuthError>(),
      ],
    );
  });

  group('AuthBloc — Change Password', () {
    blocTest<AuthBloc, AuthState>(
      'emits [Loading, PasswordChanged, Authenticated] on success',
      build: () {
        when(() => mockRepo.changePassword(
              currentPassword: any(named: 'currentPassword'),
              newPassword: any(named: 'newPassword'),
            )).thenAnswer((_) async => 'تم تغيير كلمة المرور');
        when(() => mockRepo.getCurrentUser())
            .thenAnswer((_) async => _testUser);
        return buildBloc();
      },
      act: (bloc) => bloc.add(const AuthChangePasswordRequested(
        currentPassword: 'OldPass123!',
        newPassword: 'NewPass456!',
      )),
      expect: () => [
        isA<AuthLoading>(),
        isA<AuthPasswordChanged>(),
        isA<AuthAuthenticated>(),
      ],
    );
  });

  group('AuthBloc — Reset Password (Deep Link)', () {
    blocTest<AuthBloc, AuthState>(
      'emits [Loading, PasswordResetSuccess] on token-based reset',
      build: () {
        when(() => mockRepo.resetPassword(
              token: any(named: 'token'),
              newPassword: any(named: 'newPassword'),
            )).thenAnswer((_) async => 'تم إعادة تعيين كلمة المرور');
        return buildBloc();
      },
      act: (bloc) => bloc.add(const AuthResetPassword(
        token: 'valid-token-xyz',
        newPassword: 'NewSecure789!',
      )),
      expect: () => [
        isA<AuthLoading>(),
        isA<AuthPasswordResetSuccess>(),
      ],
    );

    blocTest<AuthBloc, AuthState>(
      'emits [Loading, Error] on invalid/expired token',
      build: () {
        when(() => mockRepo.resetPassword(
              token: any(named: 'token'),
              newPassword: any(named: 'newPassword'),
            )).thenThrow(const ApiException('Token expired'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(const AuthResetPassword(
        token: 'expired-token',
        newPassword: 'NewSecure789!',
      )),
      expect: () => [
        isA<AuthLoading>(),
        isA<AuthError>(),
      ],
    );
  });

  // UNIFIED CITIZEN: Role switch tests removed — no longer supported.
}
