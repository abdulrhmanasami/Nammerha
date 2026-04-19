import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:graphql_flutter/graphql_flutter.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// App GraphQL Client setup
/// Conforms to Sovereign Platform Standards for Offline-First and CORS Device Id injection
class NammerhaGraphQLClient {
  static const String endpoint = 'https://api.nammerha.com/graphql';
  static const String wsEndpoint = 'wss://api.nammerha.com/graphql';

  static ValueNotifier<GraphQLClient>? _client;
  static const _secureStorage = FlutterSecureStorage();

  static Future<ValueNotifier<GraphQLClient>> init() async {
    // We're using hive_store for offline-first caching capabilities.
    await initHiveForFlutter();

    // Fetch device and package info
    String deviceId = 'unknown';
    String appVersion = '1.0.0';
    
    try {
      final packageInfo = await PackageInfo.fromPlatform();
      appVersion = '${packageInfo.version}+${packageInfo.buildNumber}';
      
      final deviceInfo = DeviceInfoPlugin();
      if (kIsWeb) {
        deviceId = (await deviceInfo.webBrowserInfo).userAgent ?? 'web';
      } else if (Platform.isAndroid) {
        deviceId = (await deviceInfo.androidInfo).id;
      } else if (Platform.isIOS) {
        deviceId = (await deviceInfo.iosInfo).identifierForVendor ?? 'ios_unknown';
      }
    } catch (e) {
      debugPrint('Error fetching device info: $e');
    }

    // 1. Establish normal HTTP Link
    final HttpLink httpLink = HttpLink(
      endpoint,
      defaultHeaders: {
        'X-Platform': kIsWeb ? 'web' : Platform.operatingSystem,
        'X-Device-Id': deviceId,
        'X-App-Version': appVersion,
      },
    );

    // 2. Establish Auth Link (Inject JWT from secure storage)
    final AuthLink authLink = AuthLink(
      getToken: () async {
        final token = await _secureStorage.read(key: 'nammerha_jwt');
        return token != null ? 'Bearer $token' : null;
      },
    );

    // 3. Establish WebSocket Link for Subscriptions (Phase 1 Backend Requirement)
    final WebSocketLink websocketLink = WebSocketLink(
      wsEndpoint,
      config: SocketClientConfig(
        autoReconnect: true,
        inactivityTimeout: const Duration(seconds: 30),
        initialPayload: () async {
          final token = await _secureStorage.read(key: 'nammerha_jwt');
          return {
            'token': token,
          };
        },
      ),
    );

    // 4. Combine links (Route subscriptions to WS, mutations/queries to HTTP)
    Link link = authLink.concat(httpLink);
    
    // Split request based on type
    link = Link.split(
      (request) => request.isSubscription,
      websocketLink,
      link,
    );

    // 5. Initialize Client with HiveStore
    final GraphQLClient client = GraphQLClient(
      link: link,
      cache: GraphQLCache(store: HiveStore()),
      defaultPolicies: DefaultPolicies(
        query: Policies(
          fetch: FetchPolicy.cacheAndNetwork,
          error: ErrorPolicy.all,
        ),
        mutate: Policies(
          fetch: FetchPolicy.networkOnly,
          error: ErrorPolicy.none,
        ),
      ),
    );

    _client = ValueNotifier(client);
    return _client!;
  }

  static ValueNotifier<GraphQLClient> get client {
    if (_client == null) {
      throw Exception("GraphQLClient not initialized. Call init() first.");
    }
    return _client!;
  }
}
