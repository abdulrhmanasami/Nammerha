import '../../../core/network/api_client.dart';
import '../../../core/i18n/error_keys.dart';

class BidsRepository {
  final NammerhaApiClient _apiClient;

  BidsRepository({NammerhaApiClient? apiClient})
      : _apiClient = apiClient ?? NammerhaApiClient.instance;

  static const String _projectBOQQuery = '''
    query ProjectBOQ(\$projectId: ID!) {
      projectBOQ(projectId: \$projectId) {
        id
        name
        description
        unit
        quantity
        estimatedUnitPrice
        currentMarketPrice
      }
    }
  ''';

  Future<List<dynamic>> getProjectBOQ(String projectId) async {
    try {
      final data = await _apiClient.graphql(
        query: _projectBOQQuery,
        variables: {'projectId': projectId},
        operationName: 'ProjectBOQ',
      );
      return data['projectBOQ'] as List<dynamic>;
    } catch (e) {
      throw ApiException(ErrorKeys.loadBids);
    }
  }

  static const String _submitBidMutation = '''
    mutation SubmitBid(\$input: SubmitBidInput!) {
      submitBid(input: \$input) {
        id
        status
        totalAmount
        submittedAt
      }
    }
  ''';

  /// Submits a competitive bid for a project.
  ///
  /// Idempotent: if the device is offline, the request is enqueued and
  /// replayed automatically when connectivity is restored (GAP-C2 standard).
  /// Client-side validation runs first to avoid unnecessary network round-trips.
  Future<void> submitBid({
    required String projectId,
    required double totalAmount,
    required String notes,
  }) async {
    if (totalAmount <= 0) {
      throw const ApiException(
        ErrorKeys.bidFailed,
        statusCode: 400,
      );
    }
    try {
      await _apiClient.graphql(
        query: _submitBidMutation,
        variables: {
          'input': {
            'projectId': projectId,
            'totalAmount': totalAmount,
            'notes': notes,
          },
        },
        operationName: 'SubmitBid',
        idempotent: true,
      );
    } on ApiException {
      rethrow;
    } catch (e) {
      throw ApiException(ErrorKeys.bidFailed);
    }
  }
}
