import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'package:nammerha_mobile/core/theme/app_theme.dart';
import 'package:nammerha_mobile/core/theme/theme_cubit.dart';
import 'package:nammerha_mobile/core/i18n/locale_cubit.dart';
import 'package:nammerha_mobile/features/auth/bloc/auth_bloc.dart';
import 'package:nammerha_mobile/features/auth/repositories/auth_repository.dart';
import 'package:nammerha_mobile/features/project/screens/project_details_screen.dart';

// ─── Mocks ───
class MockAuthBloc extends AuthBloc {
  MockAuthBloc() : super(authRepository: AuthRepository()) {
    // Inject fake Contractor state immediately
    emit(const AuthAuthenticated(
      NammerhaUser(
        userId: '123',
        email: 'test@test.com',
        fullName: 'Test Contractor',
        role: 'contractor',
        roles: ['contractor'],
        activeRole: 'CONTRACTOR',
        isActive: true,
        isEmailVerified: true,
      ),
    ));
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  Widget buildTestApp() {
    return MultiBlocProvider(
      providers: [
        BlocProvider<ThemeCubit>(create: (_) => ThemeCubit()),
        BlocProvider<LocaleCubit>(create: (_) => LocaleCubit()),
        BlocProvider<AuthBloc>(create: (_) => MockAuthBloc()),
      ],
      child: BlocBuilder<ThemeCubit, ThemeMode>(
        builder: (context, themeMode) {
          return MaterialApp(
            title: 'Nammerha Contractor Test',
            theme: NammerhaTheme.light(),
            darkTheme: NammerhaTheme.dark(),
            themeMode: themeMode,
            localizationsDelegates: const [
              DefaultMaterialLocalizations.delegate,
              DefaultWidgetsLocalizations.delegate,
            ],
            locale: const Locale('ar', 'SY'), // Force RTL
            home: const ProjectDetailsScreen(projectId: 'test_proj_1'),
          );
        },
      ),
    );
  }

  group('Contractor Platinum Journey', () {
    testWidgets('1. View Project and Open BOQ Bidding', (tester) async {
      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      // Ensure we are on the Project Details Screen
      expect(find.text('تفاصيل المشروع'), findsWidgets);

      // Scroll down to find the BOQ button (if necessary)
      final boqButton = find.text('تقديم عطاء وتسعير (BOQ)');
      expect(boqButton, findsOneWidget);

      // Tap the BOQ button
      await tester.ensureVisible(boqButton);
      await tester.tap(boqButton);
      await tester.pumpAndSettle();

      // Verify we navigated to BOQ Screen
      expect(find.text('جدول الكميات والعطاءات'), findsWidgets);
    });

    testWidgets('2. Navigate through BOQ to Submit Bid', (tester) async {
      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      // Go to BOQ
      await tester.ensureVisible(find.text('تقديم عطاء وتسعير (BOQ)'));
      await tester.tap(find.text('تقديم عطاء وتسعير (BOQ)'));
      await tester.pumpAndSettle();

      // Tap 'تقديم عرض السعر النهائي'
      final submitBidNavBtn = find.text('تقديم عرض السعر النهائي');
      expect(submitBidNavBtn, findsOneWidget);
      await tester.tap(submitBidNavBtn);
      await tester.pumpAndSettle();

      // Verify we are on Submit Bid Screen
      expect(find.text('تقديم عرض السعر'), findsWidgets);

      // Fill Bid form
      await tester.enterText(find.widgetWithText(TextField, 'مبلغ العطاء الإجمالي (ل.س)'), '5000000');
      await tester.enterText(find.widgetWithText(TextField, 'ملاحظات فنية أو شروط الدفع'), 'جاهز للتنفيذ فوراً');
      
      // Tap Submit
      await tester.tap(find.widgetWithText(ElevatedButton, 'إرسال العطاء النهائي'));
      
      // Wait for 2s mock delay
      await tester.pump(const Duration(seconds: 1));
      await tester.pump(const Duration(seconds: 1));
      await tester.pumpAndSettle();

      // Expect to be popped back or see success snackbar
      expect(find.text('✅ تم إرسال عطائك بنجاح. سيتم مراجعته من قبل المالك.'), findsWidgets);
    });
  });
}
