import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'package:nammerha_mobile/core/theme/app_theme.dart';
import 'package:nammerha_mobile/core/theme/theme_cubit.dart';
import 'package:nammerha_mobile/core/i18n/locale_cubit.dart';
import 'package:nammerha_mobile/features/supplier/screens/supplier_portal_screen.dart';
import 'package:nammerha_mobile/features/supplier/screens/supplier_subscription_screen.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  Widget buildTestApp() {
    return MultiBlocProvider(
      providers: [
        BlocProvider<ThemeCubit>(create: (_) => ThemeCubit()),
        BlocProvider<LocaleCubit>(create: (_) => LocaleCubit()),
      ],
      child: BlocBuilder<ThemeCubit, ThemeMode>(
        builder: (context, themeMode) {
          return MaterialApp(
            title: 'Nammerha Supplier Test',
            theme: NammerhaTheme.light(),
            darkTheme: NammerhaTheme.dark(),
            themeMode: themeMode,
            localizationsDelegates: const [
              DefaultMaterialLocalizations.delegate,
              DefaultWidgetsLocalizations.delegate,
            ],
            locale: const Locale('ar', 'SY'), // Force RTL
            home: const SupplierPortalScreen(),
          );
        },
      ),
    );
  }

  group('Supplier Platinum Journey', () {
    testWidgets('1. Navigate to Catalog and Add Material', (tester) async {
      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      // Ensure we are on the Supplier Portal
      expect(find.text('بوابة المورّد'), findsWidgets);

      // Switch to Catalog Tab (Index 1)
      await tester.tap(find.text('الكتالوج'));
      await tester.pumpAndSettle();

      // Tap the Add Button in AppBar
      final addIcon = find.byIcon(Icons.add_circle_rounded);
      expect(addIcon, findsOneWidget);
      await tester.tap(addIcon);
      await tester.pumpAndSettle(); // Wait for bottom sheet

      // Fill the form
      await tester.enterText(find.widgetWithText(TextField, 'اسم المادة'), 'أسمنت بورتلاندي مقاوم');
      await tester.enterText(find.widgetWithText(TextField, 'السعر الاسترشادي (ل.س)'), '150000');
      
      // Submit
      await tester.tap(find.widgetWithText(ElevatedButton, 'إضافة'));
      await tester.pumpAndSettle(); // Wait for API mock and snackbar

      // Expect success snackbar or sheet close
      expect(find.text('أسمنت بورتلاندي مقاوم'), findsWidgets);
    });

    testWidgets('2. Upgrade to TaaS Subscription', (tester) async {
      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      // Tap the TaaS Icon in AppBar
      final taasIcon = find.byIcon(Icons.workspace_premium_rounded);
      expect(taasIcon, findsOneWidget);
      await tester.tap(taasIcon);
      await tester.pumpAndSettle();

      // Verify we are on Subscription Screen
      expect(find.byType(SupplierSubscriptionScreen), findsOneWidget);
      expect(find.text('إدارة الاشتراك (TaaS)'), findsWidgets);

      // Select Platinum Tier
      await tester.tap(find.text('البلاتينية (TaaS)'));
      await tester.pumpAndSettle();

      // Tap Upgrade Button
      final upgradeBtn = find.text('ترقية الحساب الآن');
      expect(upgradeBtn, findsOneWidget);
      
      await tester.tap(upgradeBtn);
      
      // Wait for processing simulation (2 seconds)
      await tester.pump(const Duration(seconds: 1));
      await tester.pump(const Duration(seconds: 1));
      await tester.pumpAndSettle();

      // Verify Success Snackbar
      expect(find.text('✅ تم ترقية اشتراكك بنجاح. أنت الآن مورد موثوق!'), findsWidgets);
    });
  });
}
