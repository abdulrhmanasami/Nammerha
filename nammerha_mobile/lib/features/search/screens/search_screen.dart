import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/shimmer_loader.dart';
import '../../../core/widgets/bottom_sheet_grabber.dart';
import '../../project/data/models/project_model.dart';
import '../bloc/search_bloc.dart';
import '../bloc/search_event.dart';
import '../bloc/search_state.dart';
import '../models/marketplace_filter_model.dart';
import '../../../core/i18n/t.dart'; // FRIC-2026-F14 FIX: i18n import

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
    final colors = context.colors;
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: TextField(
          controller: _searchController,
          onChanged: (val) {
            context.read<SearchBloc>().add(SearchQueryChanged(val));
          },
          decoration: InputDecoration(
            // FRIC-2026-F14 FIX: Was hardcoded Arabic — now uses i18n key.
            hintText: context.tr('str_f0f1855c'),
            hintStyle: textTheme.bodyMedium?.copyWith(color: colors.textSubtle),
            border: InputBorder.none,
            prefixIcon: Icon(PhosphorIconsRegular.magnifyingGlass, color: colors.primaryBrand),
          ),
          style: textTheme.bodyMedium?.copyWith(
            color: colors.textPrimary,
            fontWeight: FontWeight.w600,
          ),
        ),
        actions: [
          IconButton(
            icon: Icon(PhosphorIconsRegular.faders, color: colors.primaryBrand),
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
                  Icon(PhosphorIconsRegular.magnifyingGlass, size: 80, color: colors.textSubtle),
                  const SizedBox(height: 16),
                  Text(
                  // FRIC-2026-F14 FIX: Was hardcoded Arabic — now uses i18n key.
                  context.tr('str_a4b6a448'),
                    style: textTheme.titleMedium?.copyWith(
                      color: colors.textSecondary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            );
          } else if (state is SearchLoading) {
            return NammerhaShimmerLoader(colors: colors, itemCount: 4);
          } else if (state is SearchLoaded) {
            if (state.projects.isEmpty) {
              return Center(
                child: Text(
                  // FRIC-2026-F14 FIX: Was hardcoded Arabic — now uses i18n key.
                  context.tr('str_22b9ada9'),
                  style: textTheme.titleMedium?.copyWith(
                    color: colors.textSecondary,
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
                return _buildProjectCard(project, colors, textTheme);
              },
            );
          } else if (state is SearchError) {
            return Center(
              child: Text(
                state.message,
                style: textTheme.bodyMedium?.copyWith(color: colors.error),
              ),
            );
          }
          return const SizedBox.shrink();
        },
      ),
    );
  }

  Widget _buildProjectCard(ProjectModel project, SemanticColors colors, TextTheme textTheme) {
    return Container(
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.strokeSubtle),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            project.title,
            style: textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.bold,
              color: colors.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(
                  color: colors.primaryBrandLight,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '\${project.totalEstimatedCost} USD',
                  style: textTheme.bodySmall?.copyWith(
                    color: colors.primaryBrand,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const Spacer(),
              Text(
                'مُنجز \${project.fundedPercentage}%',
                style: textTheme.bodySmall?.copyWith(
                  color: colors.secondaryAccent,
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
    final colors = context.colors;
    final textTheme = Theme.of(context).textTheme;

    showModalBottomSheet(
      context: context,
      backgroundColor: colors.surfaceElevated,
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
              Center(child: BottomSheetGrabber(colors: colors)),
              const SizedBox(height: 16),
              Text(
                // FRIC-2026-F14 FIX: Was hardcoded Arabic — now uses i18n key.
                context.tr('str_29f48a6c'),
                style: textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: colors.textPrimary,
                ),
              ),
              const SizedBox(height: 20),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(context.tr('str_1c6d11f6'), style: textTheme.bodyMedium),
                trailing: Icon(PhosphorIconsRegular.sealCheck, color: colors.primaryBrand),
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
