import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/network/api_client.dart';
import 'core/offline/offline_queue.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_cubit.dart';
import 'features/auth/bloc/auth_bloc.dart';
import 'features/auth/repositories/auth_repository.dart';
import 'features/auth/screens/login_screen.dart';
import 'features/dashboard/screens/dashboard_screen.dart';
import 'features/onboarding/screens/onboarding_screen.dart';
import 'features/onboarding/screens/splash_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize production API client
  await NammerhaApiClient.instance.init();

  // Initialize offline queue engine (loads persisted requests, starts connectivity monitor)
  await OfflineQueue.instance.init();

  runApp(const NammerhaMobileApp());
}

class NammerhaMobileApp extends StatelessWidget {
  const NammerhaMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiRepositoryProvider(
      providers: [
        RepositoryProvider<AuthRepository>(
          create: (_) => AuthRepository(),
        ),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider<ThemeCubit>(
            create: (_) => ThemeCubit()..loadSavedTheme(),
          ),
          BlocProvider<AuthBloc>(
            create: (ctx) => AuthBloc(
              authRepository: ctx.read<AuthRepository>(),
            ),
          ),
        ],
        child: BlocBuilder<ThemeCubit, ThemeMode>(
          builder: (context, themeMode) {
            return MaterialApp(
              title: 'نعمّرها',
              debugShowCheckedModeBanner: false,

              // Localization — Arabic First (Syria)
              localizationsDelegates: const [
                GlobalMaterialLocalizations.delegate,
                GlobalWidgetsLocalizations.delegate,
                GlobalCupertinoLocalizations.delegate,
              ],
              supportedLocales: const [
                Locale('ar', 'SY'),
                Locale('ar'),
                Locale('en'),
              ],
              locale: const Locale('ar', 'SY'),

              // Theme — controlled by ThemeCubit
              themeMode: themeMode,
              theme: NammerhaTheme.light(),
              darkTheme: NammerhaTheme.dark(),

              // Entry Point — Navigation Flow Controller
              home: const _AppFlowController(),
            );
          },
        ),
      ),
    );
  }
}

/// Controls the app navigation flow:
/// Splash → Onboarding → Auth Check → Login/Dashboard
class _AppFlowController extends StatefulWidget {
  const _AppFlowController();

  @override
  State<_AppFlowController> createState() => _AppFlowControllerState();
}

class _AppFlowControllerState extends State<_AppFlowController> {
  _AppScreen _currentScreen = _AppScreen.splash;

  void _navigateTo(_AppScreen screen) {
    setState(() => _currentScreen = screen);
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<AuthBloc, AuthState>(
      listener: (context, state) {
        if (state is AuthAuthenticated) {
          _navigateTo(_AppScreen.dashboard);
        } else if (state is AuthUnauthenticated) {
          if (_currentScreen == _AppScreen.dashboard) {
            _navigateTo(_AppScreen.login);
          }
        }
      },
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 400),
        transitionBuilder: (child, animation) {
          return FadeTransition(
            opacity: animation,
            child: child,
          );
        },
        child: _buildScreen(),
      ),
    );
  }

  Widget _buildScreen() {
    switch (_currentScreen) {
      case _AppScreen.splash:
        return SplashScreen(
          key: const ValueKey('splash'),
          onComplete: () {
            // Check if user has existing session
            context.read<AuthBloc>().add(AuthCheckSession());
            _navigateTo(_AppScreen.onboarding);
          },
        );
      case _AppScreen.onboarding:
        return BlocBuilder<AuthBloc, AuthState>(
          builder: (context, state) {
            // If already authenticated (from session check), skip to dashboard
            if (state is AuthAuthenticated) {
              // Using post-frame callback to avoid build-during-build
              WidgetsBinding.instance.addPostFrameCallback((_) {
                _navigateTo(_AppScreen.dashboard);
              });
            }
            return OnboardingScreen(
              key: const ValueKey('onboarding'),
              onComplete: () => _navigateTo(_AppScreen.login),
            );
          },
        );
      case _AppScreen.login:
        return LoginScreen(
          key: const ValueKey('login'),
          onLoginSuccess: () => _navigateTo(_AppScreen.dashboard),
        );
      case _AppScreen.dashboard:
        return BlocBuilder<AuthBloc, AuthState>(
          builder: (context, state) {
            if (state is AuthAuthenticated) {
              return DashboardScreen(
                key: const ValueKey('dashboard'),
                user: state.user,
                onLogout: () {
                  context.read<AuthBloc>().add(AuthLogoutRequested());
                },
              );
            }
            return const SizedBox.shrink();
          },
        );
    }
  }
}

enum _AppScreen {
  splash,
  onboarding,
  login,
  dashboard,
}
