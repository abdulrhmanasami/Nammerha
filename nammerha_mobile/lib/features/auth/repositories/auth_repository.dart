import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:graphql_flutter/graphql_flutter.dart';

import '../../../core/network/graphql_client.dart';

/// Exceptions
class AuthException implements Exception {
  final String message;
  AuthException(this.message);
  @override
  String toString() => 'AuthException: \$message';
}

/// Authentication Repository matching Sovereign Platform "Single Source of Truth" standard.
/// Uses GraphQL for mutations and SecureStorage for JWT token persistence.
class AuthRepository {
  final _secureStorage = const FlutterSecureStorage();

  Future<void> loginWithEmail(String email, String password) async {
    final client = NammerhaGraphQLClient.client.value;
    const mutation = r'''
      mutation Login($email: String!, $password: String!) {
        login(email: $email, password: $password) {
          token
          user {
            userId
            role
          }
        }
      }
    ''';

    final result = await client.mutate(
      MutationOptions(
        document: gql(mutation),
        variables: {
          'email': email,
          'password': password,
        },
      ),
    );

    if (result.hasException) {
      throw AuthException(result.exception?.graphqlErrors.first.message ?? "Connection Error");
    }

    final data = result.data?['login'];
    if (data != null && data['token'] != null) {
      await _secureStorage.write(key: 'nammerha_jwt', value: data['token']);
      await _secureStorage.write(key: 'user_role', value: data['user']['role']);
    } else {
      throw AuthException("Invalid Credentials");
    }
  }

  Future<void> logout() async {
    await _secureStorage.delete(key: 'nammerha_jwt');
    await _secureStorage.delete(key: 'user_role');
    // Clear GraphQL Cache
    NammerhaGraphQLClient.client.value.cache.store.reset();
  }

  Future<bool> isAuthenticated() async {
    final token = await _secureStorage.read(key: 'nammerha_jwt');
    return token != null;
  }
}
