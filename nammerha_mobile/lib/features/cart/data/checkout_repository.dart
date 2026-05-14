import '../../../core/network/api_client.dart';

class CheckoutRepository {
  final NammerhaApiClient _apiClient;

  CheckoutRepository({NammerhaApiClient? apiClient})
      : _apiClient = apiClient ?? NammerhaApiClient.instance;

  Future<Map<String, dynamic>> submitEscrowCheckout({
    required List<Map<String, dynamic>> items,
    required String paymentMethod,
  }) async {
    final response = await _apiClient.request<Map<String, dynamic>>(
      '/donations', // Backend contract path — DO NOT rename
      method: 'POST',
      idempotent: true,
      body: {
        'items': items,
        'payment_method': paymentMethod,
      },
      fromData: (d) => d as Map<String, dynamic>,
    );

    if (response.success && response.data != null) {
      return response.data!;
    } else {
      throw ApiException(response.error ?? 'تعذر معالجة عملية الإيداع في الضمان');
    }
  }
}
