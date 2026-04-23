import '../../../core/network/api_client.dart';
import '../../../core/graphql/queries/escrow_queries.dart';

/// Escrow Repository — Hybrid Transport Layer
///
/// P2-1 FIX (C-2 Remediation): Uses the new `graphql()` method for donor
/// donation history (aggregated query with pagination). Falls back to REST
/// for endpoints not yet covered by GraphQL resolvers.
///
/// Architecture:
///   - `fetchDonorDonations()` → GraphQL `donorDonations` query (H-3 resolved)
///   - `fetchDonorEscrowSummary()` → REST `/donations/my/summary` (no GQL resolver)
///
/// Error Handling:
///   - GraphQL errors are extracted into [GraphQLException] with typed error codes
///   - REST fallback fires only if GraphQL is structurally unavailable (502/503)
///   - Network errors surface as [ApiException] with Arabic user-facing messages
class EscrowRepository {
  final NammerhaApiClient _apiClient;

  EscrowRepository({NammerhaApiClient? apiClient})
      : _apiClient = apiClient ?? NammerhaApiClient.instance;

  /// Fetch donor's donation/escrow history via GraphQL.
  ///
  /// Uses the `donorDonations` query (H-3 fix added this to the schema).
  /// Returns a list of donation entries with project context.
  ///
  /// Fallback: If GraphQL endpoint is unreachable (502/503/504), falls back
  /// to REST `/donations/my/history` to ensure offline-degraded UX.
  Future<List<Map<String, dynamic>>> fetchDonorDonations({
    int limit = 20,
    int offset = 0,
  }) async {
    try {
      // Primary: GraphQL query with pagination
      final data = await _apiClient.graphql(
        query: EscrowQueries.getDonorDonations,
        variables: {'limit': limit, 'offset': offset},
        operationName: 'GetDonorDonations',
      );

      final donations = data['donorDonations'] as List<dynamic>?;
      if (donations != null) {
        return List<Map<String, dynamic>>.from(
          donations.map((d) => d as Map<String, dynamic>),
        );
      }
      return [];
    } on ApiException catch (e) {
      // Fallback: If GraphQL endpoint is unreachable (infrastructure error),
      // try the REST endpoint which covers the same data.
      if (e.statusCode == 502 || e.statusCode == 503 || e.statusCode == 504) {
        return _fetchDonorDonationsRest();
      }
      rethrow;
    }
  }

  /// REST fallback for donor donations (used when GraphQL is unavailable).
  Future<List<Map<String, dynamic>>> _fetchDonorDonationsRest() async {
    final response = await _apiClient.request<List<dynamic>>(
      '/donations/my/history',
      method: 'GET',
      fromData: (d) => d as List<dynamic>,
    );

    if (response.success && response.data != null) {
      return List<Map<String, dynamic>>.from(
        response.data!.map((d) => d as Map<String, dynamic>),
      );
    }

    throw ApiException(
      response.error ?? 'فشل في جلب سجل التبرعات',
    );
  }

  /// Fetch donor's escrow summary via REST.
  ///
  /// No GraphQL resolver exists for this endpoint yet.
  /// Uses REST `/donations/my/summary` directly.
  Future<Map<String, dynamic>> fetchDonorEscrowSummary() async {
    final response = await _apiClient.request<Map<String, dynamic>>(
      '/donations/my/summary',
      method: 'GET',
      fromData: (d) => d as Map<String, dynamic>,
    );

    if (response.success && response.data != null) {
      return response.data!;
    } else {
      throw ApiException(response.error ?? 'فشل في جلب ملخص الضمان');
    }
  }
}
