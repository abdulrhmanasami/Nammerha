import 'package:flutter/material.dart';
import 'package:graphql_flutter/graphql_flutter.dart';
import '../../../core/theme/semantic_colors.dart';

const String queryProjects = r'''
  query GetEngineerProjects {
    activeEngineerProjects {
      projectId
      title
      totalEstimatedCost
      fundedPercentage
      status
    }
  }
''';

class ProjectListScreen extends StatelessWidget {
  const ProjectListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Assigned Projects'),
        backgroundColor: context.colors.backgroundPrimary,
        elevation: 0,
      ),
      body: Query(
        options: QueryOptions(
          document: gql(queryProjects),
          // Offline-First strategy: Use cache if available, fetch network silently
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

          final List projects = result.data?['activeEngineerProjects'] ?? [];

          if (projects.isEmpty) {
            return Center(
              child: Text(
                'No active projects assigned.',
                style: TextStyle(color: context.colors.textSecondary),
              ),
            );
          }

          return ListView.builder(
            itemCount: projects.length,
            padding: const EdgeInsets.all(16),
            itemBuilder: (context, index) {
              final project = projects[index];
              return Card(
                color: context.colors.backgroundSecondary,
                margin: const EdgeInsets.only(bottom: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(color: context.colors.strokeBorder),
                ),
                child: ListTile(
                  title: Text(
                    project['title'] ?? 'Unknown Project',
                    style: TextStyle(fontWeight: FontWeight.bold, color: context.colors.textPrimary),
                  ),
                  subtitle: Text(
                    'Status: \${project["status"]}',
                    style: TextStyle(color: context.colors.textSecondary),
                  ),
                  trailing: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: context.colors.primaryBrand.withAlpha(25),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      '\${project["fundedPercentage"]}% Funded',
                      style: TextStyle(
                        color: context.colors.primaryBrand,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
