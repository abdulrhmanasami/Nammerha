import 'package:phosphor_flutter/phosphor_flutter.dart';
import '../../../core/widgets/error_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:geolocator/geolocator.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/shimmer_loader.dart';
import '../../../core/widgets/bottom_sheet_grabber.dart';
import '../../../core/services/api_services.dart';
import '../../../core/network/api_client.dart';
import '../../../core/utils/error_localizer.dart';
import '../../../core/utils/haptics.dart';
import '../../../core/i18n/t.dart';
import '../bloc/homeowner_projects_cubit.dart';
import '../../../core/utils/animation_budget.dart';

class HomeownerProjectsScreen extends StatelessWidget {
  const HomeownerProjectsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => HomeownerProjectsCubit(),
      child: const _HomeownerProjectsContent(),
    );
  }
}

class _HomeownerProjectsContent extends StatefulWidget {
  const _HomeownerProjectsContent();

  @override
  State<_HomeownerProjectsContent> createState() => _HomeownerProjectsContentState();
}

class _HomeownerProjectsContentState extends State<_HomeownerProjectsContent> {
  final HomeownerApi _api = HomeownerApi();

  @override
  void initState() {
    super.initState();
    _loadProjects();
  }

  Future<void> _loadProjects() async {
    final cubit = context.read<HomeownerProjectsCubit>();
    cubit.setLoading();
    try {
      final projects = await _api.getProjects();
      // Convert typed models to Map for cubit (screen uses map-access pattern)
      final projectMaps = projects.map((p) => <String, dynamic>{
        'id': p.projectId,
        'title': p.title,
        'damage_type': p.damageType,
        'status': p.status,
        'region': p.region,
        'engineer_name': p.engineerName,
        'contractor_name': p.contractorName,
        'bid_count': p.bidCount,
        'total_estimated_cost': p.totalBoqCost,
        'totalEstimatedCost': p.totalBoqCost,
        'created_at': p.createdAt,
      }).toList();
      cubit.setLoaded(projectMaps);
    } on ApiException catch (e) {
      debugPrint('[Nammerha] screens/homeowner_projects_screen: $e');
      cubit.setError(localizeApiError(e.message));
    } catch (e) {
      debugPrint('[Nammerha] screens/homeowner_projects_screen: $e');
      if (!mounted) return;
      cubit.setError(context.tr('load_projects_error'));
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text(context.tr('my_projects')),
        actions: [
          IconButton(
            icon: Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(color: colors.primaryBrand, borderRadius: BorderRadius.circular(10)),
              child: Icon(PhosphorIconsRegular.plus, color: Colors.white, size: 20),
            ),
            onPressed: () => _showCreateProjectSheet(context),
          ),
        ],
      ),
      body: BlocBuilder<HomeownerProjectsCubit, HomeownerProjectsState>(
        builder: (context, state) => _buildBody(colors, state),
      ),
    );
  }

  Widget _buildBody(SemanticColors colors, HomeownerProjectsState state) {
    if (state.isLoading) {
      return NammerhaShimmerLoader(colors: colors, itemCount: 3);
    }

    if (state.error != null) {
      return NammerhaErrorState(
        message: state.error!,
        onRetry: _loadProjects,
      );
    }

    if (state.projects.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(PhosphorIconsRegular.buildings, size: 64, color: colors.textSecondary),
            const SizedBox(height: 16),
            Text(context.tr('no_projects_yet'), style: TextStyle(color: colors.textSecondary, fontSize: 16)),
            const SizedBox(height: 12),
            ElevatedButton.icon(
              onPressed: () => _showCreateProjectSheet(context),
              icon: Icon(PhosphorIconsRegular.plus),
              label: Text(context.tr('create_new_project')),
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
        itemCount: state.projects.length,
        itemBuilder: (context, index) {
          final p = state.projects[index];
          final status = p['status'] ?? '';
          final funded = (p['funded_percentage'] ?? p['fundedPercentage'] ?? 0.0 as num).toDouble();
          final cost = p['total_estimated_cost'] ?? p['totalEstimatedCost'] ?? 0;
          final title = p['title'] ?? '';

          Color statusColor;
          String statusLabel;
          switch (status.toString().toUpperCase()) {
            case 'ACTIVE':
              statusColor = colors.success;
              statusLabel = context.tr('active');
              break;
            case 'PENDING':
              statusColor = colors.warning;
              statusLabel = context.tr('pending_review');
              break;
            case 'COMPLETED':
              statusColor = colors.primaryBrand;
              statusLabel = context.tr('completed');
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
          ).nmAnimate(context, delay: (index * 100).ms).fadeIn().slideY(begin: 0.05);
        },
      ),
    );
  }

  void _showCreateProjectSheet(BuildContext context) {
    final colors = context.colors;
    
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: colors.surfaceElevated,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => _CreateProjectSheet(
        api: _api,
        onSuccess: _loadProjects,
      ),
    );
  }
}

class _CreateProjectSheet extends StatefulWidget {
  final HomeownerApi api;
  final Future<void> Function() onSuccess;

  const _CreateProjectSheet({required this.api, required this.onSuccess});

  @override
  State<_CreateProjectSheet> createState() => _CreateProjectSheetState();
}

class _CreateProjectSheetState extends State<_CreateProjectSheet> {
  final titleCtrl = TextEditingController();
  final descCtrl = TextEditingController();
  final addressCtrl = TextEditingController();
  String selectedDamage = 'partial_structural';

  // Damage type keys mapped to API values
  static const _damageKeys = [
    'partial_structural',
    'total_destruction',
    'surface_damage',
    'new_construction',
  ];
  static const _damageI18nKeys = [
    'damage_partial_structural',
    'damage_total_destruction',
    'damage_surface',
    'damage_new_construction',
  ];

  @override
  void dispose() {
    titleCtrl.dispose();
    descCtrl.dispose();
    addressCtrl.dispose();
    super.dispose();
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

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    
    return Padding(
      padding: EdgeInsetsDirectional.fromSTEB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(child: BottomSheetGrabber(colors: colors)),
            const SizedBox(height: 16),
            Text(context.tr('create_new_project'), style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: colors.textPrimary)),
            const SizedBox(height: 20),
            _sheetField(colors, titleCtrl, context.tr('project_title_label'), PhosphorIconsRegular.textAa),
            const SizedBox(height: 12),
            _sheetField(colors, descCtrl, context.tr('project_desc_label'), PhosphorIconsRegular.fileText, maxLines: 3),
            const SizedBox(height: 12),
            _sheetField(colors, addressCtrl, context.tr('title'), PhosphorIconsRegular.mapPin),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: selectedDamage,
              decoration: InputDecoration(
                labelText: context.tr('damage_type_label'),
                prefixIcon: Icon(PhosphorIconsRegular.warning, color: colors.textSecondary),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                filled: true,
                fillColor: colors.backgroundSecondary,
              ),
              items: List.generate(_damageKeys.length, (i) =>
                DropdownMenuItem(value: _damageKeys[i], child: Text(context.tr(_damageI18nKeys[i]))),
              ),
              onChanged: (v) {
                if (v != null) {
                  setState(() => selectedDamage = v);
                }
              },
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: () async {
                if (titleCtrl.text.trim().isEmpty) return;

                // Acquire GPS before closing sheet — show spinner
                showDialog(
                  context: context,
                  barrierDismissible: false,
                  builder: (_) => Center(
                    child: Container(
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: colors.surfaceElevated,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          NammerhaShimmerLoader(colors: colors, isList: false),
                          const SizedBox(height: 14),
                          Text(context.tr('locating_gps'), style: TextStyle(color: colors.textSecondary, fontSize: 13)),
                        ],
                      ),
                    ),
                  ),
                );

                double gpsLat = 0;
                double gpsLng = 0;

                try {
                  // Check & request location permission
                  LocationPermission permission = await Geolocator.checkPermission();
                  if (permission == LocationPermission.denied) {
                    permission = await Geolocator.requestPermission();
                  }
                  if (permission == LocationPermission.denied ||
                      permission == LocationPermission.deniedForever) {
                    if (context.mounted) Navigator.pop(context); // dismiss spinner
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(context.tr('location_permission_required')),
                          backgroundColor: colors.error,
                        ),
                      );
                    }
                    return;
                  }

                  final position = await Geolocator.getCurrentPosition(
                    locationSettings: const LocationSettings(
                      accuracy: LocationAccuracy.high,
                    ),
                  );
                  gpsLat = position.latitude;
                  gpsLng = position.longitude;
                } catch (e) {
                  debugPrint('[Nammerha] screens/homeowner_projects_screen: $e');
                  // Fallback: try last known position
                  try {
                    final last = await Geolocator.getLastKnownPosition();
                    if (last != null) {
                      gpsLat = last.latitude;
                      gpsLng = last.longitude;
                    }
                  } catch (e) {
      debugPrint('[Nammerha] screens/homeowner_projects_screen: $e');
    }
                }

                if (context.mounted) Navigator.pop(context); // dismiss spinner

                // Validate we got real coordinates (not 0,0)
                if (gpsLat == 0 && gpsLng == 0) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(context.tr('gps_failed')),
                        backgroundColor: colors.warning,
                      ),
                    );
                  }
                  return;
                }

                if (context.mounted) Navigator.pop(context); // close bottom sheet
                try {
                  Haptics.heavy();
                  await widget.api.createProject(
                    title: titleCtrl.text.trim(),
                    damageType: selectedDamage,
                    description: descCtrl.text.trim().isEmpty ? null : descCtrl.text.trim(),
                    addressText: addressCtrl.text.trim().isEmpty ? null : addressCtrl.text.trim(),
                    gpsLat: gpsLat,
                    gpsLng: gpsLng,
                  );
                  await widget.onSuccess();
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(context.tr('project_created_success')), backgroundColor: colors.success),
                    );
                  }
                } on ApiException catch (e) {
                  debugPrint('[Nammerha] screens/homeowner_projects_screen: $e');
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(localizeApiError(e.message)), backgroundColor: colors.error),
                    );
                  }
                }
              },
              icon: Icon(PhosphorIconsRegular.plus),
              label: Text(context.tr('create_project_btn')),
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
    );
  }
}
