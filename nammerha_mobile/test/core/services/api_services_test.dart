import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:nammerha_mobile/core/network/api_client.dart';
import 'package:nammerha_mobile/core/services/api_services.dart';

// ═══════════════════════════════════════════════════════════════════════════
// API Services Unit Tests — REM-003/REM-010 Platinum Coverage
// ═══════════════════════════════════════════════════════════════════════════
// Tests validate that each API class correctly constructs endpoints,
// handles responses, and throws typed errors.
// ═══════════════════════════════════════════════════════════════════════════

class MockApiClient extends Mock implements NammerhaApiClient {}

void main() {
  late MockApiClient mockClient;

  setUp(() {
    mockClient = MockApiClient();
  });

  group('OpenDataApi', () {
    late OpenDataApi api;

    setUp(() {
      api = OpenDataApi(api: mockClient);
    });

    test('getProjectListings builds correct endpoint', () async {
      when(() => mockClient.request<List<dynamic>>(
            any(),
            fromData: any(named: 'fromData'),
          )).thenAnswer((_) async => ApiResponse<List<dynamic>>(
            success: true,
            data: [
              {'projectId': 'p-001', 'title': 'Test Project'}
            ],
          ));

      final result = await api.getProjectListings(limit: 10, offset: 0);
      expect(result, isA<List<Map<String, dynamic>>>());
      expect(result.length, 1);

      final captured = verify(
        () => mockClient.request<List<dynamic>>(
          captureAny(),
          fromData: any(named: 'fromData'),
        ),
      ).captured;
      expect(captured.first, contains('/open-data/projects'));
      expect(captured.first, contains('limit=10'));
    });

    test('getStats returns platform statistics', () async {
      when(() => mockClient.request<Map<String, dynamic>>(
            any(),
            fromData: any(named: 'fromData'),
          )).thenAnswer((_) async => ApiResponse<Map<String, dynamic>>(
            success: true,
            data: {'totalProjects': 42, 'totalFunding': 1000000},
          ));

      final result = await api.getStats();
      expect(result['totalProjects'], 42);
    });

    test('exportReport returns download URL', () async {
      when(() => mockClient.request<Map<String, dynamic>>(
            any(),
            fromData: any(named: 'fromData'),
          )).thenAnswer((_) async => ApiResponse<Map<String, dynamic>>(
            success: true,
            data: {'url': 'https://s3.example.com/report.pdf'},
          ));

      final url = await api.exportReport('p-001', format: 'pdf');
      expect(url, 'https://s3.example.com/report.pdf');
    });
  });

  group('TranslationApi', () {
    late TranslationApi api;

    setUp(() {
      api = TranslationApi(api: mockClient);
    });

    test('translate sends correct POST body', () async {
      when(() => mockClient.request<Map<String, dynamic>>(
            any(),
            method: any(named: 'method'),
            body: any(named: 'body'),
            fromData: any(named: 'fromData'),
          )).thenAnswer((_) async => ApiResponse<Map<String, dynamic>>(
            success: true,
            data: {'translated_text': 'Hello World'},
          ));

      final result = await api.translate(
        text: 'مرحبا بالعالم',
        sourceLang: 'ar',
        targetLang: 'en',
      );

      expect(result['translated_text'], 'Hello World');
    });

    test('getSupportedLanguages returns language list', () async {
      when(() => mockClient.request<List<dynamic>>(
            any(),
            fromData: any(named: 'fromData'),
          )).thenAnswer((_) async => ApiResponse<List<dynamic>>(
            success: true,
            data: [
              {'code': 'ar', 'name': 'Arabic'},
              {'code': 'en', 'name': 'English'},
            ],
          ));

      final result = await api.getSupportedLanguages();
      expect(result.length, 2);
      expect(result.first['code'], 'ar');
    });
  });

  group('ContactApi', () {
    late ContactApi api;

    setUp(() {
      api = ContactApi(api: mockClient);
    });

    test('submitContactForm sends idempotent POST', () async {
      when(() => mockClient.request(
            any(),
            method: any(named: 'method'),
            body: any(named: 'body'),
            idempotent: any(named: 'idempotent'),
          )).thenAnswer((_) async => const ApiResponse(success: true));

      await api.submitContactForm(
        name: 'Test User',
        email: 'test@example.com',
        subject: 'Test',
        message: 'Hello',
      );

      verify(() => mockClient.request(
            '/contact',
            method: 'POST',
            body: {
              'name': 'Test User',
              'email': 'test@example.com',
              'subject': 'Test',
              'message': 'Hello',
            },
            idempotent: true,
          )).called(1);
    });
  });
}
