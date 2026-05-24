import 'api_client.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Offline Interceptor — Financial Lock Policy (Pessimistic UI)
/// ═══════════════════════════════════════════════════════════════════════════
/// Enforces the absolute prohibition of offline financial mutations.
/// Any API request containing financial payloads (cents) or hitting escrow
/// endpoints will immediately throw an ApiException and will NOT be queued.
/// ═══════════════════════════════════════════════════════════════════════════

class OfflineInterceptor {
  static const List<String> _financialKeywords = [
    'cents',
    'amount',
    'escrow',
    'payment',
    'deposit',
    'release',
    'wallet',
    'transfer',
    'bid',
    'price',
  ];

  static const List<String> _financialEndpoints = [
    '/escrow',
    '/wallet',
    '/bids',
    '/checkout',
    '/payments',
  ];

  /// Checks if a request is considered a financial operation.
  static bool isFinancialOperation(String endpoint, Map<String, dynamic>? body) {
    // Check endpoint
    for (final kw in _financialEndpoints) {
      if (endpoint.toLowerCase().contains(kw)) {
        return true;
      }
    }

    // Check payload keys and values deeply
    if (body != null) {
      final bodyStr = body.toString().toLowerCase();
      for (final kw in _financialKeywords) {
        if (bodyStr.contains(kw)) {
          return true;
        }
      }
    }

    return false;
  }

  /// Throws an exception if the operation is financial and the user is offline.
  static void validateOfflineRequest(String endpoint, Map<String, dynamic>? body) {
    if (isFinancialOperation(endpoint, body)) {
      throw const ApiException(
        'إقفال مالي: لا يمكن إتمام العمليات المالية أو التسعير أثناء انقطاع الإنترنت لحمايتك من تقلبات الأسعار.',
        statusCode: 0,
      );
    }
  }
}
