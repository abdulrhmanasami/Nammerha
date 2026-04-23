import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/services/api_services.dart';
import '../../../core/network/api_client.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Project Map Screen — Geographic Project Visualization
/// ═══════════════════════════════════════════════════════════════════════════
/// Displays projects as location cards with simulated map markers.
/// When flutter_map is integrated (Wave 4), this will use MapLibre tiles.
/// For now: geographic list view with region clustering.
/// ═══════════════════════════════════════════════════════════════════════════
class ProjectMapScreen extends StatefulWidget {
  const ProjectMapScreen({super.key});

  @override
  State<ProjectMapScreen> createState() => _ProjectMapScreenState();
}

class _ProjectMapScreenState extends State<ProjectMapScreen> {
  final MarketplaceApi _api = MarketplaceApi();
  List<Map<String, dynamic>> _projects = [];
  bool _isLoading = true;
  String? _selectedRegion;

  @override
  void initState() {
    super.initState();
    _loadProjects();
  }

  Future<void> _loadProjects() async {
    setState(() => _isLoading = true);
    try {
      _projects = await _api.getProjects();
    } on ApiException catch (_) {} catch (_) {}
    if (mounted) setState(() => _isLoading = false);
  }

  Map<String, List<Map<String, dynamic>>> get _regionGroups {
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final p in _projects) {
      final region = p['region']?.toString() ?? 'غير محدد';
      groups.putIfAbsent(region, () => []).add(p);
    }
    return groups;
  }

  List<Map<String, dynamic>> get _filteredProjects {
    if (_selectedRegion == null) return _projects;
    return _projects.where((p) => p['region']?.toString() == _selectedRegion).toList();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final regions = _regionGroups;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(title: const Text('خريطة المشاريع')),
      body: _isLoading
          ? Center(child: CircularProgressIndicator(color: colors.primaryBrand))
          : Column(
              children: [
                // Map placeholder with region stats
                Container(
                  height: 200,
                  margin: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    gradient: NammerhaGradients.brandPrimary,
                    borderRadius: BorderRadius.circular(NammerhaTheme.radiusXl),
                    boxShadow: const [NammerhaShadows.cta],
                  ),
                  child: Stack(
                    children: [
                      // Grid pattern (simulated map)
                      Positioned.fill(
                        child: CustomPaint(painter: _GridPainter(colors)),
                      ),
                      // Stats overlay
                      Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.map_rounded, size: 36, color: Colors.white),
                            const SizedBox(height: 8),
                            Text('${_projects.length} مشروع', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Colors.white)),
                            Text('${regions.length} مناطق', style: TextStyle(fontSize: 14, color: Colors.white.withAlpha(180))),
                          ],
                        ),
                      ),
                    ],
                  ),
                ).animate().fadeIn(duration: 500.ms),

                // Region filter chips
                SizedBox(
                  height: 44,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    children: [
                      _regionChip('الكل', null, _projects.length, colors),
                      ...regions.entries.map((e) => _regionChip(e.key, e.key, e.value.length, colors)),
                    ],
                  ),
                ),
                const SizedBox(height: 8),

                // Project list
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: _loadProjects,
                    color: colors.primaryBrand,
                    child: _filteredProjects.isEmpty
                        ? Center(child: Text('لا توجد مشاريع في هذه المنطقة', style: TextStyle(color: colors.textSecondary)))
                        : ListView.builder(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemCount: _filteredProjects.length,
                            itemBuilder: (_, i) => _projectLocationCard(_filteredProjects[i], colors, i),
                          ),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _regionChip(String label, String? value, int count, SemanticColors colors) {
    final isActive = _selectedRegion == value;
    return GestureDetector(
      onTap: () => setState(() => _selectedRegion = value),
      child: AnimatedContainer(
        duration: NammerhaAnimations.fast,
        margin: const EdgeInsetsDirectional.only(end: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isActive ? colors.primaryBrand : colors.surfaceElevated,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: isActive ? colors.primaryBrand : colors.strokeSubtle),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: isActive ? Colors.white : colors.textSecondary)),
            const SizedBox(width: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(
                color: isActive ? Colors.white.withAlpha(30) : colors.backgroundSecondary,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text('$count', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: isActive ? Colors.white : colors.textSubtle)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _projectLocationCard(Map<String, dynamic> p, SemanticColors colors, int index) {
    return GestureDetector(
      onTap: () => Navigator.pushNamed(context, '/project/${p['project_id']}'),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: colors.surfaceElevated,
          borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
          border: Border.all(color: colors.strokeSubtle),
        ),
        child: Row(
          children: [
            Container(
              width: 48, height: 48,
              decoration: BoxDecoration(
                color: colors.primaryBrand.withAlpha(12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(Icons.location_on_rounded, color: colors.primaryBrand),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(p['title']?.toString() ?? '', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary), maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Row(children: [
                    Icon(Icons.location_on_rounded, size: 12, color: colors.textSubtle),
                    const SizedBox(width: 3),
                    Text(p['region']?.toString() ?? '', style: TextStyle(fontSize: 12, color: colors.textSecondary)),
                    const SizedBox(width: 10),
                    Text(p['damage_type']?.toString() ?? '', style: TextStyle(fontSize: 12, color: colors.textSubtle)),
                  ]),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: colors.textSubtle),
          ],
        ),
      ),
    ).animate(delay: (index * 50).ms).fadeIn();
  }
}

/// Draws a subtle grid pattern simulating a map
class _GridPainter extends CustomPainter {
  final SemanticColors colors;
  _GridPainter(this.colors);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withAlpha(15)
      ..strokeWidth = 0.5;

    const spacing = 30.0;
    for (double x = 0; x < size.width; x += spacing) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = 0; y < size.height; y += spacing) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
