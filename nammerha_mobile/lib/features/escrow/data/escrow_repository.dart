import 'package:graphql_flutter/graphql_flutter.dart';
import '../../../core/graphql/mutations/escrow_mutations.dart';
import '../../../core/graphql/queries/escrow_queries.dart';

class EscrowRepository {
  final GraphQLClient _client;

  EscrowRepository({required GraphQLClient client}) : _client = client;

  Future<Map<String, dynamic>> createDonation({
    required List<Map<String, dynamic>> items,
    required String paymentMethod,
    String? returnUrl,
  }) async {
    final MutationOptions options = MutationOptions(
      document: gql(EscrowMutations.createDonation),
      variables: {
        'input': {
          'items': items.map((item) => {
            'itemId': item['itemId'],
            'amount': item['amount'],
          }).toList(),
          'paymentMethod': paymentMethod,
          if (returnUrl != null) 'returnUrl': returnUrl,
        },
      },
    );

    final QueryResult result = await _client.mutate(options);

    if (result.hasException) {
      throw Exception(result.exception.toString());
    }

    if (result.data == null || result.data!['createDonation'] == null) {
      throw Exception('Failed to receive checkout URL from backend');
    }

    return result.data!['createDonation'];
  }

  Future<Map<String, dynamic>> getDonorEscrowSummary() async {
    final QueryOptions options = QueryOptions(
      document: gql(EscrowQueries.getDonorEscrowHistory),
      fetchPolicy: FetchPolicy.networkOnly,
    );

    final QueryResult result = await _client.query(options);

    if (result.hasException) {
      throw Exception(result.exception.toString());
    }

    final List<dynamic> history = result.data?['donorEscrowHistory'] ?? [];
    
    int totalLocked = 0;
    int totalReleased = 0;
    int totalRefunded = 0;
    int activeEscrows = 0;

    for (final entry in history) {
      final status = entry['paymentStatus'] as String?;
      final amount = (entry['amountLocked'] as num?)?.toInt() ?? 0;
      
      // Assume "SUCCESS" means locked in escrow, "ESCROW_RELEASED" means released.
      if (status == 'SUCCESS') {
        totalLocked += amount;
        activeEscrows += 1;
      } else if (status == 'ESCROW_RELEASED') {
        totalReleased += amount;
      } else if (status == 'REFUNDED') {
        totalRefunded += amount;
      }
    }

    return {
      'totalLocked': totalLocked,
      'totalReleased': totalReleased,
      'totalRefunded': totalRefunded,
      'activeEscrows': activeEscrows,
    };
  }
}
