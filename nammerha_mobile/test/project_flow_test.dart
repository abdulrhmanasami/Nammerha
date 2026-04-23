import 'package:flutter_test/flutter_test.dart';
import 'package:nammerha_mobile/core/data/mock_data.dart';

void main() {
  group('MockData', () {
    test('should return donor user by role', () {
      final user = MockData.getUserByRole('DONOR');
      expect(user['role'], equals('DONOR'));
    });

    test('should have marketplace projects', () {
      expect(MockData.marketplaceProjects.length, greaterThan(0));
    });

    test('should format currency correctly', () {
      expect(MockData.formatCurrency(1250000), contains('1,250,000'));
    });
  });
}
