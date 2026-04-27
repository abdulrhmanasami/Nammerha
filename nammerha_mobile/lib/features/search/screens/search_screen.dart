import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';


import '../../project/data/models/project_model.dart';
import '../bloc/search_bloc.dart';
import '../bloc/search_event.dart';
import '../bloc/search_state.dart';
import '../models/marketplace_filter_model.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F6F8), // Cloud Dancer
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: TextField(
          controller: _searchController,
          onChanged: (val) {
            context.read<SearchBloc>().add(SearchQueryChanged(val));
          },
          decoration: InputDecoration(
            hintText: 'ابحث عن مشروع أو مقاول...',
            hintStyle: GoogleFonts.cairo(color: Colors.grey.shade500),
            border: InputBorder.none,
            // Assuming Phosphor is used in the app, using standard Icons as fallback if not imported
            prefixIcon: const Icon(Icons.search, color: Color(0xFF0D47A1)), 
          ),
          style: GoogleFonts.cairo(
            color: const Color(0xFF242424),
            fontWeight: FontWeight.w600,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list, color: Color(0xFF0D47A1)),
            onPressed: () => _showFilterBottomSheet(context),
          ),
        ],
      ),
      body: BlocBuilder<SearchBloc, SearchState>(
        builder: (context, state) {
          if (state is SearchInitial) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.search_rounded, size: 80, color: Colors.grey.shade300),
                  const SizedBox(height: 16),
                  Text(
                    'ابدأ البحث عن المشاريع',
                    style: GoogleFonts.cairo(
                      color: Colors.grey.shade600,
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            );
          } else if (state is SearchLoading) {
            return const Center(
              child: CircularProgressIndicator(color: Color(0xFF0D47A1)),
            );
          } else if (state is SearchLoaded) {
            if (state.projects.isEmpty) {
              return Center(
                child: Text(
                  'لم يتم العثور على نتائج',
                  style: GoogleFonts.cairo(
                    color: Colors.grey.shade600,
                    fontSize: 18,
                  ),
                ),
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: state.projects.length,
              separatorBuilder: (context, index) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final project = state.projects[index];
                return _buildProjectCard(project);
              },
            );
          } else if (state is SearchError) {
            return Center(
              child: Text(
                state.message,
                style: GoogleFonts.cairo(color: Colors.red),
              ),
            );
          }
          return const SizedBox.shrink();
        },
      ),
    );
  }

  Widget _buildProjectCard(ProjectModel project) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            project.title,
            style: GoogleFonts.cairo(
              fontWeight: FontWeight.bold,
              fontSize: 16,
              color: const Color(0xFF242424),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFE3F2FD),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '\${project.totalEstimatedCost} USD',
                  style: GoogleFonts.cairo(
                    color: const Color(0xFF0D47A1),
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const Spacer(),
              Text(
                'مُنجز \${project.fundedPercentage}%',
                style: GoogleFonts.cairo(
                  color: const Color(0xFF0A6E55),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _showFilterBottomSheet(BuildContext context) {
    // Basic bottom sheet for filters
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return Container(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'تصفية النتائج',
                style: GoogleFonts.cairo(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: const Color(0xFF242424),
                ),
              ),
              const SizedBox(height: 20),
              // Dummy filter option for UI completeness
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('المشاريع ذات الأولوية (وفاق)', style: GoogleFonts.cairo()),
                trailing: const Icon(Icons.verified, color: Color(0xFF0D47A1)),
                onTap: () {
                  Navigator.pop(ctx);
                  context.read<SearchBloc>().add(
                        const SearchFiltersApplied(MarketplaceFilters(ofacClearance: true)),
                      );
                },
              ),
            ],
          ),
        );
      },
    );
  }
}
