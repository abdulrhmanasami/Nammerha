import '../../../core/network/api_client.dart';
import '../../../core/graphql/queries/escrow_queries.dart';

/// Escrow Repository — Hybrid Transport Layer
///
/// Uses GraphQL for escrow transaction history (with REST fallback)
/// and REST for escrow summary (no GraphQL resolver yet).
///
/// Architecture:
///   - `fetchEscrowTransactions()` → GraphQL `userPayments` query (backend contract name)
///   - `fetchEscrowSummary()` → REST `/payments/my/summary` (backend contract path)
///
/// Error Handling:
///   - GraphQL errors are extracted into [GraphQLException] with typed error codes
///   - REST fallback fires only if GraphQL is structurally unavailable (502/503)
///   - Network errors surface as [ApiException] with Arabic user-facing messages
class EscrowRepository {
  final NammerhaApiClient _apiClient;

  EscrowRepository({NammerhaApiClient? apiClient})
      : _apiClient = apiClient ?? NammerhaApiClient.instance;

  /// Fetch escrow transaction history via GraphQL.
  ///
  /// Uses the `userPayments` query (backend contract name — not renamed).
  /// Returns a list of escrow transaction entries with project context.
  ///
  /// Fallback: If GraphQL endpoint is unreachable (502/503/504), falls back
  /// to REST `/payments/my/history` to ensure offline-degraded UX.
  Future<List<Map<String, dynamic>>> fetchEscrowTransactions({
    int limit = 20,
    int offset = 0,
  }) async {
    try {
      // Primary: GraphQL query with pagination
      final data = await _apiClient.graphql(
        query: EscrowQueries.getEscrowTransactions,
        variables: {'limit': limit, 'offset': offset},
        operationName: 'GetUserPayments', // Backend contract — DO NOT rename
      );

      // Response key 'userPayments' is a backend contract
      final transactions = data['userPayments'] as List<dynamic>?;
      if (transactions != null) {
        return List<Map<String, dynamic>>.from(
          transactions.map((d) => d as Map<String, dynamic>),
        );
      }
      return [];
    } on ApiException catch (e) {
      // Fallback: If GraphQL endpoint is unreachable (infrastructure error),
      // try the REST endpoint which covers the same data.
      if (e.statusCode == 502 || e.statusCode == 503 || e.statusCode == 504) {
        return _fetchEscrowTransactionsRest();
      }
      rethrow;
    }
  }

  /// REST fallback for escrow transactions (used when GraphQL is unavailable).
  Future<List<Map<String, dynamic>>> _fetchEscrowTransactionsRest() async {
    final response = await _apiClient.request<List<dynamic>>(
      '/payments/my/history', // Backend contract path — DO NOT rename
      method: 'GET',
      fromData: (d) => d as List<dynamic>,
    );

    if (response.success && response.data != null) {
      return List<Map<String, dynamic>>.from(
        response.data!.map((d) => d as Map<String, dynamic>),
      );
    }

    throw ApiException(
      response.error ?? 'err_escrow_transactions',
    );
  }

  /// Fetch escrow summary via REST.
  ///
  /// No GraphQL resolver exists for this endpoint yet.
  Future<Map<String, dynamic>> fetchEscrowSummary() async {
    final response = await _apiClient.request<Map<String, dynamic>>(
      '/payments/my/summary', // Backend contract path — DO NOT rename
      method: 'GET',
      fromData: (d) => d as Map<String, dynamic>,
    );

    if (response.success && response.data != null) {
      return response.data!;
    } else {
      throw ApiException(response.error ?? 'err_escrow_summary');
    }
  }
}
