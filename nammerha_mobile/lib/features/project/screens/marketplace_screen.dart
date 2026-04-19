import 'package:flutter/material.dart';
import 'package:graphql_flutter/graphql_flutter.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/semantic_colors.dart';

const String queryMarketplace = r'''
  query BrowseMarketplace($filters: MarketplaceFilters) {
    marketplace(filters: $filters) {
      items {
        projectId
        title
        description
        damageType
        status
        totalEstimatedCost
        fundedPercentage
        homeownerName
        coverImageUrl
      }
      total
    }
  }
''';

class MarketplaceScreen extends StatelessWidget {
  const MarketplaceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.colors.backgroundPrimary,
      appBar: AppBar(
        title: const Text('Rebuild Projects'),
        backgroundColor: context.colors.backgroundPrimary,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            color: context.colors.primaryBrand,
            onPressed: () {
              // Open filter dialog
            },
          )
        ],
      ),
      body: Query(
        options: QueryOptions(
          document: gql(queryMarketplace),
          fetchPolicy: FetchPolicy.cacheAndNetwork,
          variables: const {
            'filters': {},
          },
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

          final List projects = result.data?['marketplace']?['items'] ?? [];

          if (projects.isEmpty) {
            return Center(
              child: Text(
                'No projects available for funding right now.',
                style: TextStyle(color: context.colors.textSecondary),
              ),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: projects.length,
            itemBuilder: (context, index) {
              final project = projects[index];
              final fundedPercentage = (project['fundedPercentage'] as num?)?.toDouble() ?? 0.0;
              
              return GestureDetector(
                onTap: () {
                  context.push('/project/\${project["projectId"]}');
                },
                child: Card(
                  color: context.colors.backgroundSecondary,
                  margin: const EdgeInsets.only(bottom: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: BorderSide(color: context.colors.strokeBorder),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Cover Image Placeholder
                      Container(
                        height: 120,
                        color: context.colors.primaryBrand.withOpacity(0.1),
                        child: Icon(Icons.home_work, size: 48, color: context.colors.primaryBrand.withOpacity(0.5)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              project['title'] ?? 'Untitled Project',
                              style: TextStyle(
                                fontSize: 18, 
                                fontWeight: FontWeight.bold, 
                                color: context.colors.textPrimary
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'By \${project["homeownerName"]}',
                              style: TextStyle(color: context.colors.textSecondary, fontSize: 12),
                            ),
                            const SizedBox(height: 12),
                            // Progress Bar
                            LinearProgressIndicator(
                              value: fundedPercentage / 100,
                              backgroundColor: context.colors.strokeBorder,
                              valueColor: AlwaysStoppedAnimation<Color>(context.colors.primaryBrand),
                              minHeight: 8,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            const SizedBox(height: 8),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  '\${fundedPercentage.toStringAsFixed(1)}% Funded',
                                  style: TextStyle(color: context.colors.textSecondary, fontSize: 12),
                                ),
                                Text(
                                  'Cost: \${project["totalEstimatedCost"]}',
                                  style: TextStyle(color: context.colors.textPrimary, fontWeight: FontWeight.bold),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
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
