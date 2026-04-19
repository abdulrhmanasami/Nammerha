import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:graphql_flutter/graphql_flutter.dart';
import '../../auth/bloc/auth_bloc.dart';
import '../../../core/theme/semantic_colors.dart';

const String queryMe = r'''
  query ProfileMe {
    me {
      userId
      fullName
      email
      role
      kycVerificationStatus
    }
  }
''';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.colors.backgroundPrimary,
      appBar: AppBar(
        title: const Text('My Profile'),
        backgroundColor: context.colors.backgroundPrimary,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.redAccent),
            onPressed: () {
              context.read<AuthBloc>().add(LogoutRequested());
            },
          )
        ],
      ),
      body: Query(
        options: QueryOptions(
          document: gql(queryMe),
          fetchPolicy: FetchPolicy.cacheAndNetwork,
        ),
        builder: (QueryResult result, {VoidCallback? refetch, FetchMore? fetchMore}) {
          if (result.hasException) {
            return Center(
              child: Text(
                'Network Error: \${result.exception.toString()}',
                style: TextStyle(color: context.colors.error),
                textAlign: TextAlign.center,
              ),
            );
          }

          if (result.isLoading && result.data == null) {
            return Center(
              child: CircularProgressIndicator(color: context.colors.primaryBrand),
            );
          }

          final me = result.data?['me'];

          if (me == null) {
            return Center(
              child: Text(
                'Profile data not found.',
                style: TextStyle(color: context.colors.textSecondary),
              ),
            );
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              children: [
                CircleAvatar(
                  radius: 50,
                  backgroundColor: context.colors.primaryBrand.withOpacity(0.1),
                  child: Text(
                    (me['fullName'] as String?)?.substring(0, 1).toUpperCase() ?? 'U',
                    style: TextStyle(fontSize: 40, color: context.colors.primaryBrand),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  me['fullName'] ?? 'Unknown User',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: context.colors.textPrimary),
                ),
                const SizedBox(height: 8),
                Text(
                  me['email'] ?? 'No email',
                  style: TextStyle(fontSize: 16, color: context.colors.textSecondary),
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color: context.colors.backgroundSecondary,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: context.colors.strokeBorder),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.shield, color: context.colors.primaryBrand, size: 16),
                      const SizedBox(width: 8),
                      Text(
                        'Role: \${me["role"]}',
                        style: TextStyle(color: context.colors.textPrimary, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 32),
                const Divider(),
                ListTile(
                  leading: const Icon(Icons.language),
                  title: Text('Language Settings', style: TextStyle(color: context.colors.textPrimary)),
                  subtitle: Text('RTL Interface Activated (ar_SY)', style: TextStyle(color: context.colors.textSecondary)),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {},
                ),
                ListTile(
                  leading: const Icon(Icons.verified_user),
                  title: Text('KYC Status', style: TextStyle(color: context.colors.textPrimary)),
                  subtitle: Text('\${me["kycVerificationStatus"]}', style: TextStyle(color: context.colors.textSecondary)),
                  trailing: const Icon(Icons.chevron_right),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
