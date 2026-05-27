import '../../../core/i18n/t.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:cached_network_image/cached_network_image.dart';

import '../../../core/services/reality_capture_api.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/shimmer_loader.dart';
import '../../../core/widgets/bottom_sheet_grabber.dart';
import '../../../core/widgets/error_state.dart';
import '../bloc/reality_capture_bloc.dart';
import '../bloc/capture_form_cubit.dart';
import '../../../core/utils/animation_budget.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Reality Capture 360° Screen
/// ═══════════════════════════════════════════════════════════════════════════
/// GAP-H2 FIX: Full 360° panoramic capture for construction documentation.
///
/// Flow:
///   1. User selects construction phase
///   2. Opens native camera (panorama mode for 360°, or standard)
///   3. GPS coordinates captured automatically
///   4. SHA-256 hash computed in Isolate
///   5. Direct S3 upload via pre-signed URL
///   6. Backend registration with all metadata
///
/// View Mode:
///   - Gesture-based panorama viewer for 360° images
///   - Phase-based timeline of all captures
///   - Hidden Works reveal mode (pre-concrete evidence)
/// ═══════════════════════════════════════════════════════════════════════════
class RealityCaptureScreen extends StatelessWidget {
  final String projectId;
  final String projectTitle;

  const RealityCaptureScreen({
    super.key,
    required this.projectId,
    required this.projectTitle,
  });

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => RealityCaptureBloc()..add(LoadCaptures(projectId: projectId)),
      child: _RealityCaptureView(projectId: projectId, projectTitle: projectTitle),
    );
  }
}

class _RealityCaptureView extends StatefulWidget {
  final String projectId;
  final String projectTitle;

  const _RealityCaptureView({required this.projectId, required this.projectTitle});

  @override
  State<_RealityCaptureView> createState() => _RealityCaptureViewState();
}

class _RealityCaptureViewState extends State<_RealityCaptureView>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ImagePicker _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text(context.tr('capture_360'), style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: colors.textPrimary)),
        backgroundColor: colors.backgroundPrimary,
        elevation: 0,
        iconTheme: IconThemeData(color: colors.textPrimary),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: colors.primaryBrand,
          labelColor: colors.primaryBrand,
          unselectedLabelColor: colors.textSecondary,
          labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
          tabs: [
            Tab(text: context.tr('rc_tab_captures'), icon: const Icon(PhosphorIconsRegular.cube, size: 20)),
            Tab(text: context.tr('rc_tab_hidden_works'), icon: const Icon(PhosphorIconsRegular.eye, size: 20)),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showCaptureSheet(context),
        backgroundColor: colors.primaryBrand,
        icon: Icon(PhosphorIconsRegular.camera, color: Colors.white),
        label: Text(context.tr('new_capture'), style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
      ),
      body: BlocConsumer<RealityCaptureBloc, RealityCaptureState>(
        buildWhen: (previous, current) {
          if (current is CaptureSubmitted) return false;
          if (current is RealityCaptureError && previous is CapturesLoaded) return false;
          return true;
        },
        listener: (ctx, state) {
          if (state is CaptureSubmitted) {
            ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text(state.message), backgroundColor: colors.success));
          } else if (state is RealityCaptureError) {
            ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text(state.message), backgroundColor: colors.error));
          }
        },
        builder: (ctx, state) {
          if (state is CaptureUploading) {
            return _uploadingView(state.stage, colors);
          }
          if (state is RealityCaptureError) {
            return NammerhaErrorState(
              message: state.message,
              onRetry: () => ctx.read<RealityCaptureBloc>().add(LoadCaptures(projectId: widget.projectId)),
            );
          }
          return TabBarView(
            controller: _tabController,
            children: [
              _capturesTab(ctx, state, colors),
              _hiddenWorksTab(ctx, state, colors),
            ],
          );
        },
      ),
    );
  }

  Widget _uploadingView(String stage, SemanticColors colors) {
    return Center(
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Container(
          width: 80, height: 80,
          decoration: BoxDecoration(
            color: colors.primaryBrand.withAlpha(15),
            shape: BoxShape.circle,
          ),
          child: NammerhaShimmerLoader(colors: colors, isList: false),
        ).animate(onComplete: (c) => c.repeat()).shimmer(duration: 1500.ms),
        const SizedBox(height: 24),
        Text(stage, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: colors.textPrimary)),
        const SizedBox(height: 8),
        Text(context.tr('rc_do_not_close_app'), style: TextStyle(fontSize: 12, color: colors.textSubtle)),
      ]),
    );
  }

  Widget _capturesTab(BuildContext ctx, RealityCaptureState state, SemanticColors colors) {
    if (state is RealityCaptureLoading) {
      return NammerhaShimmerLoader(colors: colors, itemCount: 3);
    }
    final captures = state is CapturesLoaded ? state.captures : <Map<String, dynamic>>[];

    if (captures.isEmpty) {
      return _emptyState(colors, PhosphorIconsRegular.cube, context.tr('no_captures_yet'), context.tr('capture_start_hint'));
    }

    return RefreshIndicator(
      onRefresh: () async {
        ctx.read<RealityCaptureBloc>().add(LoadCaptures(projectId: widget.projectId));
      },
      color: colors.primaryBrand,
      child: ListView(
        padding: const EdgeInsetsDirectional.fromSTEB(16, 16, 16, 100),
        children: [
          // Phase filter chips
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: ConstructionPhase.values.map((phase) {
                final count = captures.where((c) => c['construction_phase'] == phase.value).length;
                if (count == 0) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsetsDirectional.only(end: 8),
                  child: FilterChip(
                    label: Text('${phase.i18nLabel(context)} ($count)'),
                    selected: false,
                    onSelected: (_) {},
                    labelStyle: TextStyle(fontSize: 11, color: colors.textPrimary),
                    backgroundColor: colors.surfaceElevated,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 12),
          // Captures grid
          ...captures.asMap().entries.map((e) => _captureCard(e.value, colors, e.key)),
        ],
      ),
    );
  }

  Widget _hiddenWorksTab(BuildContext ctx, RealityCaptureState state, SemanticColors colors) {
    if (state is! HiddenWorksLoaded) {
      // Trigger load on first visit
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (ctx.mounted) {
          ctx.read<RealityCaptureBloc>().add(LoadHiddenWorks(widget.projectId));
        }
      });
      return NammerhaShimmerLoader(colors: colors, itemCount: 3);
    }

    final works = state.works;
    if (works.isEmpty) {
      return _emptyState(colors, PhosphorIconsRegular.eyeSlash, context.tr('no_hidden_work'), context.tr('hidden_work_hint'));
    }

    return ListView(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 16, 16, 100),
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: colors.warning.withAlpha(15),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: colors.warning.withAlpha(40)),
          ),
          child: Row(children: [
            Icon(PhosphorIconsRegular.info, color: colors.warning, size: 20),
            const SizedBox(width: 10),
            Expanded(child: Text(
              context.tr('rc_hidden_work_info'),
              style: TextStyle(fontSize: 12, color: colors.textPrimary, height: 1.5),
            )),
          ]),
        ),
        const SizedBox(height: 12),
        ...works.asMap().entries.map((e) => _captureCard(e.value, colors, e.key, isHiddenWork: true)),
      ],
    );
  }

  Widget _captureCard(Map<String, dynamic> c, SemanticColors colors, int index, {bool isHiddenWork = false}) {
    final title = c['title']?.toString() ?? '';
    final phase = c['construction_phase']?.toString() ?? '';
    final captureType = c['capture_type']?.toString() ?? 'photo_360';
    final fileUrl = c['file_url']?.toString() ?? '';
    final thumbnailUrl = c['thumbnail_url']?.toString() ?? fileUrl;
    final is360 = captureType.contains('360');
    final isVerified = c['is_verified'] as bool? ?? false;

    // Find phase label
    String phaseLabel = phase;
    for (final p in ConstructionPhase.values) {
      if (p.value == phase) { phaseLabel = p.i18nLabel(context); break; }
    }

    return Semantics(
      // P3-002: WCAG 4.1.2 — screen reader announces capture title, phase, GPS, verification
      label: '${title.isNotEmpty ? title : context.tr('capture_360')}, $phaseLabel${isVerified ? ', ${context.tr('rc_verified_badge')}' : ''}${isHiddenWork ? ', Hidden Work' : ''}',
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: colors.surfaceElevated,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: isHiddenWork ? colors.warning.withAlpha(40) : colors.strokeSubtle),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // Image preview
          ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
            child: Stack(children: [
              if (thumbnailUrl.isNotEmpty)
                CachedNetworkImage(
                  imageUrl: thumbnailUrl,
                  height: 180,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  placeholder: (context, url) => Container(
                    height: 180,
                    color: colors.backgroundSecondary,
                    child: NammerhaShimmerLoader(colors: colors),
                  ),
                  errorWidget: (context, url, error) => Container(
                    height: 180,
                    color: colors.backgroundSecondary,
                    child: Icon(PhosphorIconsRegular.imageBroken, size: 40, color: colors.textSubtle),
                  ),
                )
              else
                Container(
                  height: 180,
                  color: colors.backgroundSecondary,
                  child: Icon(is360 ? PhosphorIconsRegular.cube : PhosphorIconsRegular.image, size: 40, color: colors.textSubtle),
                ),
              // 360 badge
              if (is360)
                PositionedDirectional(
                  top: 10, start: 10,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.black.withAlpha(180),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(PhosphorIconsRegular.globeHemisphereEast, size: 14, color: Colors.white),
                      SizedBox(width: 4),
                      Text('360°', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white)),
                    ]),
                  ),
                ),
              // Verified badge
              if (isVerified)
                PositionedDirectional(
                  top: 10, end: 10,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: colors.success.withAlpha(230),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(PhosphorIconsRegular.sealCheck, size: 14, color: Colors.white),
                      const SizedBox(width: 4),
                      Text(context.tr('rc_verified_badge'), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white)),
                    ]),
                  ),
                ),
            ]),
          ),
          // Metadata
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (title.isNotEmpty) ...[
                Text(title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary)),
                const SizedBox(height: 6),
              ],
              Row(children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: colors.primaryBrand.withAlpha(15), borderRadius: BorderRadius.circular(6)),
                  child: Text(phaseLabel, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: colors.primaryBrand)),
                ),
                const SizedBox(width: 8),
                Icon(PhosphorIconsRegular.crosshair, size: 12, color: colors.textSubtle),
                const SizedBox(width: 3),
                Text(
                  '${(c['gps_lat'] as num?)?.toStringAsFixed(4) ?? '—'}, ${(c['gps_lng'] as num?)?.toStringAsFixed(4) ?? '—'}',
                  style: TextStyle(fontSize: 10, color: colors.textSubtle, fontFamily: 'monospace'),
                ),
              ]),
            ]),
          ),
        ]),
      ),
    ).nmAnimate(context, delay: (index * 80).ms).fadeIn().slideY(begin: 0.03);
  }

  Widget _emptyState(SemanticColors colors, IconData icon, String title, String subtitle) {
    return Center(child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(icon, size: 56, color: colors.textSubtle),
        const SizedBox(height: 16),
        Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary), textAlign: TextAlign.center),
        const SizedBox(height: 6),
        Text(subtitle, style: TextStyle(fontSize: 13, color: colors.textSecondary), textAlign: TextAlign.center),
      ]),
    ));
  }

  // ─── Capture Sheet ─────────────────────────────────────────────────────
  // P1-003 FIX: Replaced StatefulBuilder + setModalState with
  // BlocProvider<CaptureFormCubit> + BlocBuilder (Absolute Zero setState).

  void _showCaptureSheet(BuildContext context) {
    final colors = context.colors;
    final titleCtrl = TextEditingController();
    final descCtrl = TextEditingController();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: colors.surfaceElevated,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (sheetCtx) => BlocProvider(
        create: (_) => CaptureFormCubit(),
        child: BlocBuilder<CaptureFormCubit, CaptureFormState>(
          builder: (formCtx, formState) => Padding(
            padding: EdgeInsetsDirectional.fromSTEB(20, 20, 20, MediaQuery.of(formCtx).viewInsets.bottom + 20),
            child: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Center(child: BottomSheetGrabber(colors: colors)),
                const SizedBox(height: 16),
                Text(context.tr('rc_new_capture_title'), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.textPrimary), textAlign: TextAlign.center),
                const SizedBox(height: 6),
                Text(context.tr('rc_new_capture_desc'), style: TextStyle(fontSize: 12, color: colors.textSubtle), textAlign: TextAlign.center),
                const SizedBox(height: 20),

                // Capture type selector
                Text(context.tr('rc_capture_type_label'), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.textPrimary)),
                const SizedBox(height: 8),
                Row(children: [
                  _typeChip(formCtx, formState.captureType, CaptureType.photo360, PhosphorIconsRegular.circlesFour, colors),
                  const SizedBox(width: 8),
                  _typeChip(formCtx, formState.captureType, CaptureType.photoStandard, PhosphorIconsRegular.camera, colors),
                ]),
                const SizedBox(height: 16),

                // Phase dropdown
                Text(context.tr('rc_phase_label'), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.textPrimary)),
                const SizedBox(height: 8),
                DropdownButtonFormField<ConstructionPhase>(
                  initialValue: formState.phase,
                  dropdownColor: colors.surfaceElevated,
                  style: TextStyle(color: colors.textPrimary, fontSize: 14),
                  decoration: InputDecoration(
                    filled: true, fillColor: colors.backgroundSecondary,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: colors.strokeSubtle)),
                  ),
                  items: ConstructionPhase.values.map((p) => DropdownMenuItem(value: p, child: Text(p.i18nLabel(context)))).toList(),
                  onChanged: (v) {
                    if (v != null) formCtx.read<CaptureFormCubit>().selectPhase(v);
                  },
                ),
                const SizedBox(height: 14),

                TextField(controller: titleCtrl, style: TextStyle(color: colors.textPrimary),
                  decoration: InputDecoration(labelText: context.tr('rc_title_optional'), filled: true, fillColor: colors.backgroundSecondary,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)))),
                const SizedBox(height: 12),
                TextField(controller: descCtrl, maxLines: 2, style: TextStyle(color: colors.textPrimary),
                  decoration: InputDecoration(labelText: context.tr('rc_desc_optional'), filled: true, fillColor: colors.backgroundSecondary,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)))),
                const SizedBox(height: 20),

                ElevatedButton.icon(
                  onPressed: () => _captureAndSubmit(formCtx, formState.phase, formState.captureType, titleCtrl.text, descCtrl.text),
                  icon: Icon(PhosphorIconsRegular.camera, color: Colors.white),
                  label: Text(
                    formState.captureType == CaptureType.photo360 ? context.tr('rc_open_camera_360') : context.tr('rc_open_camera'),
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: colors.primaryBrand,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }

  Widget _typeChip(BuildContext formCtx, CaptureType current, CaptureType target,
      IconData icon, SemanticColors colors) {
    final isActive = current == target;
    return Expanded(
      child: Semantics(
        // P3-002: WCAG 4.1.2 — GestureDetector has no implicit semantics
        button: true,
        selected: isActive,
        label: target.i18nLabel(formCtx),
        child: GestureDetector(
          onTap: () => formCtx.read<CaptureFormCubit>().selectCaptureType(target),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: isActive ? colors.primaryBrand : colors.backgroundSecondary,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: isActive ? colors.primaryBrand : colors.strokeSubtle),
            ),
            child: Column(children: [
              Icon(icon, size: 24, color: isActive ? Colors.white : colors.textSecondary),
              const SizedBox(height: 4),
              Text(target.i18nLabel(formCtx), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: isActive ? Colors.white : colors.textSecondary)),
            ]),
          ),
        ),
      ),
    );
  }

  Future<void> _captureAndSubmit(BuildContext ctx, ConstructionPhase phase, CaptureType type, String title, String desc) async {
    Navigator.pop(ctx); // Close bottom sheet

    try {
      // Step 1: Capture with native camera
      final XFile? image = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 95,
        maxWidth: 4096,
        maxHeight: 4096,
        preferredCameraDevice: CameraDevice.rear,
      );

      if (image == null) return; // User cancelled

      // Step 2: Get GPS
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );

      if (position.isMocked) {
        throw Exception('Mock location detected. Please disable fake GPS.');
      }

      // Step 3: Read bytes
      final Uint8List bytes = await image.readAsBytes();

      if (!mounted) return;

      // Step 4: Submit via BLoC
      context.read<RealityCaptureBloc>().add(SubmitCapture(
        projectId: widget.projectId,
        imageBytes: bytes,
        phase: phase,
        captureType: type,
        title: title.isNotEmpty ? title : null,
        description: desc.isNotEmpty ? desc : null,
        gpsLat: position.latitude,
        gpsLng: position.longitude,
        gpsAccuracy: position.accuracy,
      ));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${context.tr('rc_error_prefix')}: $e'), backgroundColor: context.colors.error),
        );
      }
    }
  }
}
