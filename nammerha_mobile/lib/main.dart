import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:graphql_flutter/graphql_flutter.dart';
import 'package:flutter_web_plugins/url_strategy.dart';

import 'core/network/graphql_client.dart';
import 'core/routes/app_router.dart';
import 'core/theme/semantic_colors.dart';
import 'features/auth/repositories/auth_repository.dart';
import 'features/auth/bloc/auth_bloc.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  usePathUrlStrategy();
  
  // Initialize Offline-First GraphQL Client
  await NammerhaGraphQLClient.init();
  
  runApp(const NammerhaMobileApp());
}

class NammerhaMobileApp extends StatelessWidget {
  const NammerhaMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiRepositoryProvider(
      providers: [
        RepositoryProvider<AuthRepository>(
          create: (context) => AuthRepository(),
        ),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider<AuthBloc>(
            create: (context) => AuthBloc(
              context.read<AuthRepository>(),
            )..add(CheckAuthStatus()),
          ),
        ],
        child: GraphQLProvider(
          client: NammerhaGraphQLClient.client,
          child: Builder(
            builder: (context) {
              final router = AppRouter.createRouter(context.read<AuthBloc>());
              return MaterialApp.router(
                title: 'Nammerha Mobile Phase 2',
            localizationsDelegates: const [
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            // Platinum Mandate: Full RTL support starting with Arabic (Syria-specific focus)
            supportedLocales: const [
              Locale('ar', 'SY'), // Primary
              Locale('ar'),       // Fallback Arabic
              Locale('en'),       // Fallback English
            ],
            localeResolutionCallback: (locale, supportedLocales) {
              if (locale != null) {
                for (var supportedLocale in supportedLocales) {
                  if (supportedLocale.languageCode == locale.languageCode) {
                    return supportedLocale;
                  }
                }
              }
              // Force RTL default if unresolvable
              return const Locale('ar', 'SY');
            },
            themeMode: ThemeMode.system,
            theme: ThemeData(
              scaffoldBackgroundColor: SemanticColors.light().backgroundPrimary,
              colorScheme: ColorScheme.fromSeed(seedColor: SemanticColors.light().primaryBrand),
              useMaterial3: true,
              extensions: [SemanticColors.light()],
            ),
            darkTheme: ThemeData(
              scaffoldBackgroundColor: SemanticColors.dark().backgroundPrimary,
              colorScheme: ColorScheme.fromSeed(
                seedColor: SemanticColors.dark().primaryBrand,
                brightness: Brightness.dark,
              ),
              useMaterial3: true,
              extensions: [SemanticColors.dark()],
            ),
            routerConfig: router,
          );
        }),
        ),
      ),
    );
  }
}
