import 'package:flutter/material.dart';
import 'package:graphql_flutter/graphql_flutter.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/semantic_colors.dart';

const String queryProjectDetails = r'''
  query ProjectDetails($id: ID!) {
    project(projectId: $id) {
      projectId
      title
      description
      totalEstimatedCost
      fundedPercentage
      addressText
      homeowner {
        fullName
      }
    }
    projectBOQ(projectId: $id) {
      itemId
      materialName
      requiredQuantity
      unit
      unitPrice
      fundedPercentage
      status
    }
  }
''';

class ProjectDetailScreen extends StatefulWidget {
  final String projectId;
  const ProjectDetailScreen({super.key, required this.projectId});

  @override
  State<ProjectDetailScreen> createState() => _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends State<ProjectDetailScreen> {
  final Map<String, int> _selectedQuantities = {};

  void _toggleItem(Map item) {
    setState(() {
      final id = item['itemId'] as String;
      if (_selectedQuantities.containsKey(id)) {
        _selectedQuantities.remove(id);
      } else {
        // Automatically select the remaining unfunded amount or 1
        _selectedQuantities[id] = 1; // Simplification
      }
    });
  }

  void _checkout() {
    if (_selectedQuantities.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select at least one item to fund.')),
      );
      return;
    }

    final basketItems = _selectedQuantities.entries.map((e) => {
      'itemId': e.key,
      'amount': e.value * 1000, // Assuming unit price * quantity logic (simplified)
    }).toList();

    context.push('/checkout', extra: basketItems);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.colors.backgroundPrimary,
      appBar: AppBar(
        title: const Text('Project Details'),
        backgroundColor: context.colors.backgroundPrimary,
        elevation: 0,
        leading: const BackButton(),
      ),
      body: Query(
        options: QueryOptions(
          document: gql(queryProjectDetails),
          fetchPolicy: FetchPolicy.networkOnly,
          variables: {'id': widget.projectId},
        ),
        builder: (QueryResult result, {VoidCallback? refetch, FetchMore? fetchMore}) {
          if (result.hasException) {
            return Center(child: Text('Error: \${result.exception.toString()}', style: TextStyle(color: context.colors.error)));
          }
          if (result.isLoading && result.data == null) {
            return Center(child: CircularProgressIndicator(color: context.colors.primaryBrand));
          }

          final project = result.data?['project'];
          final List boqItems = result.data?['projectBOQ'] ?? [];

          if (project == null) {
            return Center(child: Text('Project not found.', style: TextStyle(color: context.colors.textSecondary)));
          }

          return Column(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Container(
                        height: 200,
                        decoration: BoxDecoration(
                          color: context.colors.primaryBrand.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Center(child: Icon(Icons.architecture, size: 64, color: context.colors.primaryBrand.withOpacity(0.5))),
                      ),
                      const SizedBox(height: 24),
                      Text(
                        project['title'] ?? 'Untitled',
                        style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: context.colors.textPrimary),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        project['addressText'] ?? 'Unknown location',
                        style: TextStyle(fontSize: 14, color: context.colors.textSecondary),
                      ),
                      const SizedBox(height: 24),
                      Text(
                        'Project Description',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: context.colors.textPrimary),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        project['description'] ?? 'No description provided.',
                        style: TextStyle(fontSize: 14, color: context.colors.textSecondary, height: 1.5),
                      ),
                      const SizedBox(height: 32),
                      Text(
                        'Bill of Quantities (BOQ)',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: context.colors.textPrimary),
                      ),
                      const SizedBox(height: 16),
                      if (boqItems.isEmpty)
                        Text('No items found.', style: TextStyle(color: context.colors.textSecondary))
                      else
                        ...boqItems.map((item) {
                          final id = item['itemId'];
                          final isSelected = _selectedQuantities.containsKey(id);
                          final fundedPct = (item['fundedPercentage'] as num?)?.toDouble() ?? 0.0;
                          final isFullyFunded = fundedPct >= 100.0;

                          return Card(
                            color: isSelected ? context.colors.primaryBrand.withOpacity(0.1) : context.colors.backgroundSecondary,
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              leading: Icon(
                                isSelected ? Icons.check_circle : Icons.circle_outlined,
                                color: isFullyFunded ? Colors.grey : (isSelected ? context.colors.primaryBrand : context.colors.textSecondary),
                              ),
                              title: Text(item['materialName'] ?? 'Item', style: TextStyle(color: context.colors.textPrimary)),
                              subtitle: Text(
                                '\${item['requiredQuantity']} \${item['unit']} • \${fundedPct.toStringAsFixed(0)}% Funded',
                                style: TextStyle(color: context.colors.textSecondary),
                              ),
                              enabled: !isFullyFunded,
                              onTap: isFullyFunded ? null : () => _toggleItem(item),
                            ),
                          );
                        }),
                    ],
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: context.colors.backgroundSecondary,
                  boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 10, offset: Offset(0, -5))],
                ),
                child: SafeArea(
                  child: ElevatedButton(
                    onPressed: _selectedQuantities.isEmpty ? null : _checkout,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: context.colors.primaryBrand,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: Text(
                      'Fund Securely (\${_selectedQuantities.length} Items)',
                      style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
