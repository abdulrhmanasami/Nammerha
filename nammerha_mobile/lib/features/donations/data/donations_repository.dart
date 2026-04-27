import '../../../core/network/api_client.dart';

class DonationsRepository {
  final NammerhaApiClient _apiClient;

  DonationsRepository({NammerhaApiClient? apiClient})
      : _apiClient = apiClient ?? NammerhaApiClient.instance;

  static const String _createDonationMutation = '''
    mutation CreateDonation(\$input: CreateDonationInput!) {
      createDonation(input: \$input) {
        id
        amount
        currency
        checkoutUrl
        status
      }
    }
  ''';

  Future<String> createDonation({
    required String projectId,
    required double amount,
    bool isAnonymous = false,
  }) async {
    try {
      // Prevent floating point errors by ensuring integer cents in backend or strict double formatting
      final formattedAmount = double.parse(amount.toStringAsFixed(2));

      final data = await _apiClient.graphql(
        query: _createDonationMutation,
        variables: {
          'input': {
            'projectId': projectId,
            'amount': formattedAmount,
            'isAnonymous': isAnonymous,
          }
        },
        operationName: 'CreateDonation',
        idempotent: true, // Financial mutation MUST be idempotent
      );

      final checkoutUrl = data['createDonation']['checkoutUrl'] as String?;
      if (checkoutUrl == null || checkoutUrl.isEmpty) {
        throw const ApiException('فشل في استلام رابط الدفع (Fatora Checkout URL)');
      }
      
      return checkoutUrl;
    } catch (e) {
      throw ApiException('تعذر بدء عملية التبرع: \$e');
    }
  }
}
