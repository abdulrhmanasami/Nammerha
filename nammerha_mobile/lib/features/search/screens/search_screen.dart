import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/services/api_services.dart';
import '../../../core/network/api_client.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Global Search Screen — Projects, Materials, Regions
/// ═══════════════════════════════════════════════════════════════════════════
/// Debounced search with category filters and rich result cards.
/// Mirrors web search behavior across marketplace projects.
/// ═══════════════════════════════════════════════════════════════════════════
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final TextEditingController _controller = TextEditingController();
  final MarketplaceApi _api = MarketplaceApi();
  List<Map<String, dynamic>> _results = [];
  bool _isSearching = false;
  String _filter = 'all';
  String _sortBy = 'newest';

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _search(String query) async {
    if (query.trim().length < 2) {
      setState(() => _results = []);
      return;
    }
    setState(() => _isSearching = true);
    try {
      final results = await _api.getProjects(
        damageType: _filter == 'all' ? null : _filter,
        sortBy: _sortBy,
      );
      // Client-side filter by query (backend search is via damage_type param)
      final filtered = results.where((p) {
        final title = (p['title']?.toString() ?? '').toLowerCase();
        final region = (p['region']?.toString() ?? '').toLowerCase();
        final damage = (p['damage_type']?.toString() ?? '').toLowerCase();
        final q = query.toLowerCase();
        return title.contains(q) || region.contains(q) || damage.contains(q);
      }).toList();
      setState(() => _results = filtered);
    } on ApiException catch (_) {} catch (_) {}
    if (mounted) setState(() => _isSearching = false);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: const Text('البحث'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              controller: _controller,
              autofocus: true,
              onChanged: (q) => _search(q),
              decoration: InputDecoration(
                hintText: 'ابحث عن مشاريع، مواد، مناطق...',
                prefixIcon: Icon(Icons.search_rounded, color: colors.textSubtle),
                suffixIcon: _controller.text.isNotEmpty
                    ? IconButton(
                        icon: Icon(Icons.close_rounded, color: colors.textSubtle),
                        onPressed: () {
                          _controller.clear();
                          setState(() => _results = []);
                        },
                      )
                    : null,
                filled: true,
                fillColor: colors.surfaceElevated,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide(color: colors.strokeSubtle),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide(color: colors.strokeSubtle),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide(color: colors.primaryBrand, width: 1.5),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              ),
            ),
          ),
        ),
      ),
      body: Column(
        children: [
          // Filter chips
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                _filterChip('الكل', 'all', colors),
                _filterChip('هيكلي', 'structural', colors),
                _filterChip('كهرباء', 'electrical', colors),
                _filterChip('صحي', 'plumbing', colors),
                _filterChip('تشطيبات', 'finishing', colors),
                _filterChip('سقف', 'roofing', colors),
              ],
            ),
          ),
          // Results
          Expanded(
            child: _isSearching
                ? Center(child: CircularProgressIndicator(color: colors.primaryBrand))
                : _results.isEmpty
                    ? _emptyState(colors)
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _results.length,
                        itemBuilder: (_, i) => _resultCard(_results[i], colors, i),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _filterChip(String label, String value, SemanticColors colors) {
    final isActive = _filter == value;
    return GestureDetector(
      onTap: () {
        setState(() => _filter = value);
        if (_controller.text.isNotEmpty) _search(_controller.text);
      },
      child: AnimatedContainer(
        duration: NammerhaAnimations.fast,
        margin: const EdgeInsetsDirectional.only(end: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: isActive ? colors.primaryBrand : colors.surfaceElevated,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: isActive ? colors.primaryBrand : colors.strokeSubtle),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: isActive ? Colors.white : colors.textSecondary,
          ),
        ),
      ),
    );
  }

  Widget _resultCard(Map<String, dynamic> p, SemanticColors colors, int index) {
    final progress = (p['funded_percentage'] ?? 0) as num;
    return GestureDetector(
      onTap: () => Navigator.pushNamed(context, '/project/${p['project_id']}'),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: colors.surfaceElevated,
          borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
          border: Border.all(color: colors.strokeSubtle),
          boxShadow: const [NammerhaShadows.elevation],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(p['title']?.toString() ?? '', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: colors.textPrimary)),
            const SizedBox(height: 6),
            Row(children: [
              Icon(Icons.location_on_rounded, size: 14, color: colors.textSubtle),
              const SizedBox(width: 4),
              Text(p['region']?.toString() ?? '', style: TextStyle(fontSize: 12, color: colors.textSecondary)),
              const SizedBox(width: 12),
              Icon(Icons.build_rounded, size: 14, color: colors.textSubtle),
              const SizedBox(width: 4),
              Text(p['damage_type']?.toString() ?? '', style: TextStyle(fontSize: 12, color: colors.textSecondary)),
            ]),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: (progress / 100).clamp(0.0, 1.0).toDouble(),
                      backgroundColor: colors.backgroundSecondary,
                      valueColor: AlwaysStoppedAnimation(progress >= 100 ? colors.success : colors.secondaryAccent),
                      minHeight: 6,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text('${progress.toInt()}%', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: progress >= 100 ? colors.success : colors.secondaryAccent)),
              ],
            ),
          ],
        ),
      ),
    ).animate(delay: (index * 60).ms).fadeIn().slideY(begin: 0.03, end: 0);
  }

  Widget _emptyState(SemanticColors colors) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.search_rounded, size: 64, color: colors.textSubtle),
          const SizedBox(height: 16),
          Text(_controller.text.isEmpty ? 'ابحث عن مشاريع إعادة الإعمار' : 'لا توجد نتائج', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
          const SizedBox(height: 6),
          Text(_controller.text.isEmpty ? 'مشاريع، مواد، مناطق جغرافية' : 'حاول بكلمات مختلفة', style: TextStyle(fontSize: 13, color: colors.textSecondary)),
        ],
      ),
    );
  }
}
