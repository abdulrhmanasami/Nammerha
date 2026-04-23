import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/services/api_services.dart';
import '../../../core/network/api_client.dart';

class HomeownerProjectsScreen extends StatefulWidget {
  const HomeownerProjectsScreen({super.key});

  @override
  State<HomeownerProjectsScreen> createState() => _HomeownerProjectsScreenState();
}

class _HomeownerProjectsScreenState extends State<HomeownerProjectsScreen> {
  final HomeownerApi _api = HomeownerApi();
  List<Map<String, dynamic>> _projects = [];
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadProjects();
  }

  Future<void> _loadProjects() async {
    setState(() { _isLoading = true; _error = null; });
    try {
      _projects = await _api.getProjects();
      setState(() => _isLoading = false);
    } on ApiException catch (e) {
      setState(() { _error = e.message; _isLoading = false; });
    } catch (e) {
      setState(() { _error = 'حدث خطأ في تحميل مشاريعك'; _isLoading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: const Text('مشاريعي'),
        actions: [
          IconButton(
            icon: Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(color: colors.primaryBrand, borderRadius: BorderRadius.circular(10)),
              child: const Icon(Icons.add_rounded, color: Colors.white, size: 20),
            ),
            onPressed: () => _showCreateProjectSheet(context),
          ),
        ],
      ),
      body: _buildBody(colors),
    );
  }

  Widget _buildBody(SemanticColors colors) {
    if (_isLoading) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(color: colors.primaryBrand),
            const SizedBox(height: 16),
            Text('جارٍ تحميل مشاريعك...', style: TextStyle(color: colors.textSecondary)),
          ],
        ),
      );
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.cloud_off_rounded, size: 64, color: colors.textSecondary),
              const SizedBox(height: 16),
              Text(_error!, style: TextStyle(color: colors.error), textAlign: TextAlign.center),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                onPressed: _loadProjects,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('إعادة المحاولة'),
                style: ElevatedButton.styleFrom(backgroundColor: colors.primaryBrand),
              ),
            ],
          ),
        ),
      );
    }

    if (_projects.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.home_work_rounded, size: 64, color: colors.textSecondary),
            const SizedBox(height: 16),
            Text('لم تقم بإنشاء أي مشروع بعد', style: TextStyle(color: colors.textSecondary, fontSize: 16)),
            const SizedBox(height: 12),
            ElevatedButton.icon(
              onPressed: () => _showCreateProjectSheet(context),
              icon: const Icon(Icons.add_rounded),
              label: const Text('إنشاء مشروع جديد'),
              style: ElevatedButton.styleFrom(backgroundColor: colors.primaryBrand, foregroundColor: Colors.white),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadProjects,
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _projects.length,
        itemBuilder: (context, index) {
          final p = _projects[index];
          final status = p['status'] ?? '';
          final funded = (p['funded_percentage'] ?? p['fundedPercentage'] ?? 0.0 as num).toDouble();
          final cost = p['total_estimated_cost'] ?? p['totalEstimatedCost'] ?? 0;
          final title = p['title'] ?? '';

          Color statusColor;
          String statusLabel;
          switch (status.toString().toUpperCase()) {
            case 'ACTIVE':
              statusColor = colors.success;
              statusLabel = 'نشط';
              break;
            case 'PENDING':
              statusColor = colors.warning;
              statusLabel = 'قيد المراجعة';
              break;
            case 'COMPLETED':
              statusColor = colors.primaryBrand;
              statusLabel = 'مكتمل';
              break;
            default:
              statusColor = colors.textSecondary;
              statusLabel = status.toString();
          }

          return Container(
            margin: const EdgeInsets.only(bottom: 14),
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: colors.surfaceElevated,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: colors.strokeSubtle),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(title.toString(), style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(color: statusColor.withAlpha(15), borderRadius: BorderRadius.circular(8)),
                      child: Text(statusLabel, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: statusColor)),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(formatCurrency(cost as num), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: colors.primaryBrand)),
                    Text('${funded.toStringAsFixed(1)}%', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.success)),
                  ],
                ),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: (funded / 100).clamp(0.0, 1.0),
                    minHeight: 6,
                    backgroundColor: colors.strokeSubtle,
                    color: funded > 75 ? colors.success : colors.primaryBrand,
                  ),
                ),
              ],
            ),
          ).animate(delay: (index * 100).ms).fadeIn().slideY(begin: 0.05);
        },
      ),
    );
  }

  void _showCreateProjectSheet(BuildContext context) {
    final colors = context.colors;
    final titleCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final addressCtrl = TextEditingController();
    String selectedDamage = 'هيكلي جزئي';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: colors.surfaceElevated,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(width: 40, height: 4, decoration: BoxDecoration(color: colors.strokeSubtle, borderRadius: BorderRadius.circular(2))),
              ),
              const SizedBox(height: 16),
              Text('إنشاء مشروع جديد', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: colors.textPrimary)),
              const SizedBox(height: 20),
              _sheetField(colors, titleCtrl, 'عنوان المشروع', Icons.title_rounded),
              const SizedBox(height: 12),
              _sheetField(colors, descCtrl, 'وصف المشروع', Icons.description_rounded, maxLines: 3),
              const SizedBox(height: 12),
              _sheetField(colors, addressCtrl, 'العنوان', Icons.location_on_rounded),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: selectedDamage,
                decoration: InputDecoration(
                  labelText: 'نوع الضرر',
                  prefixIcon: Icon(Icons.warning_rounded, color: colors.textSecondary),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                  filled: true,
                  fillColor: colors.backgroundSecondary,
                ),
                items: ['هيكلي جزئي', 'تدمير كامل', 'أضرار سطحية', 'بناء جديد', 'تراثي']
                    .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                    .toList(),
                onChanged: (v) => selectedDamage = v ?? selectedDamage,
              ),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                onPressed: () async {
                  if (titleCtrl.text.trim().isEmpty) return;
                  Navigator.pop(ctx);
                  try {
                    await _api.createProject(
                      title: titleCtrl.text.trim(),
                      damageType: selectedDamage,
                      description: descCtrl.text.trim().isEmpty ? null : descCtrl.text.trim(),
                      addressText: addressCtrl.text.trim().isEmpty ? null : addressCtrl.text.trim(),
                      gpsLat: 0, // TODO: get from device GPS
                      gpsLng: 0,
                    );
                    await _loadProjects();
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: const Text('✅ تم إنشاء المشروع بنجاح'), backgroundColor: colors.success),
                      );
                    }
                  } on ApiException catch (e) {
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(e.message), backgroundColor: colors.error),
                      );
                    }
                  }
                },
                icon: const Icon(Icons.add_rounded),
                label: const Text('إنشاء المشروع'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: colors.primaryBrand,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sheetField(SemanticColors colors, TextEditingController ctrl, String label, IconData icon, {int maxLines = 1}) {
    return TextField(
      controller: ctrl,
      maxLines: maxLines,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, color: colors.textSecondary),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
        filled: true,
        fillColor: colors.backgroundSecondary,
      ),
    );
  }
}
