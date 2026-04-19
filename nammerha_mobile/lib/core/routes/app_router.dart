import 'dart:async' as dart_async;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

// Screens
import '../../features/auth/screens/login_screen.dart';
import '../../features/dashboard/screens/dashboard_screen.dart';
import '../../features/spatial_proof/screens/spatial_camera_screen.dart';
import '../../features/project/screens/marketplace_screen.dart';
import '../../features/project/screens/project_detail_screen.dart';
import '../../features/escrow/screens/escrow_checkout_screen.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../features/escrow/bloc/escrow_bloc.dart';
import '../../features/escrow/data/escrow_repository.dart';

import '../../features/auth/bloc/auth_bloc.dart';
import '../../features/spatial_proof/bloc/spatial_proof_bloc.dart';
import '../../features/spatial_proof/data/spatial_proof_repository.dart';

class AppRouter {
  static GoRouter createRouter(AuthBloc authBloc) {
    return GoRouter(
      initialLocation: '/login',
      refreshListenable: GoRouterRefreshStream(authBloc.stream),
      routes: [
        GoRoute(
          path: '/login',
          builder: (context, state) => const LoginScreen(),
        ),
        GoRoute(
          path: '/dashboard',
          builder: (context, state) => const DashboardScreen(),
        ),
        GoRoute(
          path: '/spatial_proof',
          builder: (context, state) => BlocProvider(
            create: (context) => SpatialProofBloc(SpatialProofRepository()),
            child: const SpatialCameraScreen(),
          ),
        ),
        GoRoute(
          path: '/marketplace',
          builder: (context, state) => const MarketplaceScreen(),
        ),
        GoRoute(
          path: '/project/:id',
          builder: (context, state) {
            final id = state.pathParameters['id']!;
            return ProjectDetailScreen(projectId: id);
          },
        ),
        GoRoute(
          path: '/checkout',
          builder: (context, state) {
            final basketItems = state.extra as List<Map<String, dynamic>>? ?? [];
            final totalAmount = basketItems.fold<double>(0, (sum, item) => sum + (item['amount'] as num));
            return BlocProvider(
              create: (context) => EscrowBloc(EscrowRepository()),
              child: EscrowCheckoutScreen(
                basketItems: basketItems,
                totalAmount: totalAmount,
              ),
            );
          },
        ),
      ],
      // Platinum Standard Auth Guard
      redirect: (BuildContext context, GoRouterState state) {
        final authState = authBloc.state;
        final isLoggingIn = state.matchedLocation == '/login';

        if (authState is AuthInitial || authState is AuthLoading) {
          return null; // Awaiting initial resolution
        }

        if (authState is AuthUnauthenticated) {
          return isLoggingIn ? null : '/login';
        }

        if (authState is AuthAuthenticated) {
          return isLoggingIn ? '/dashboard' : null;
        }

        return null;
      },
    );
  }
}

// Helper to provide a stream as a Listenable for GoRouter
class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(Stream<dynamic> stream) {
    notifyListeners();
    _subscription = stream.asBroadcastStream().listen(
      (dynamic _) => notifyListeners(),
    );
  }

  late final dart_async.StreamSubscription<dynamic> _subscription;

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}
