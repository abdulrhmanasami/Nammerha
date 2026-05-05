import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:cached_network_image/cached_network_image.dart';

import '../../../core/services/reality_capture_api.dart';
import '../../../core/theme/semantic_colors.dart';
import '../bloc/reality_capture_bloc.dart';

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
        title: Text('التقاط 360°', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: colors.textPrimary)),
        backgroundColor: colors.backgroundPrimary,
        elevation: 0,
        iconTheme: IconThemeData(color: colors.textPrimary),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: colors.primaryBrand,
          labelColor: colors.primaryBrand,
          unselectedLabelColor: colors.textSecondary,
          labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
          tabs: const [
            Tab(text: 'الالتقاطات', icon: Icon(Icons.view_in_ar_rounded, size: 20)),
            Tab(text: 'أعمال مخفية', icon: Icon(Icons.visibility_rounded, size: 20)),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showCaptureSheet(context),
        backgroundColor: colors.primaryBrand,
        icon: const Icon(Icons.camera_rounded, color: Colors.white),
        label: const Text('التقاط جديد', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
      ),
      body: BlocConsumer<RealityCaptureBloc, RealityCaptureState>(
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
          child: CircularProgressIndicator(color: colors.primaryBrand, strokeWidth: 3),
        ).animate(onComplete: (c) => c.repeat()).shimmer(duration: 1500.ms),
        const SizedBox(height: 24),
        Text(stage, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: colors.textPrimary)),
        const SizedBox(height: 8),
        Text('يرجى عدم إغلاق التطبيق', style: TextStyle(fontSize: 12, color: colors.textSubtle)),
      ]),
    );
  }

  Widget _capturesTab(BuildContext ctx, RealityCaptureState state, SemanticColors colors) {
    if (state is RealityCaptureLoading) {
      return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    }
    final captures = state is CapturesLoaded ? state.captures : <Map<String, dynamic>>[];

    if (captures.isEmpty) {
      return _emptyState(colors, Icons.view_in_ar_rounded, 'لا توجد التقاطات بعد', 'اضغط على "التقاط جديد" لبدء التوثيق');
    }

    return RefreshIndicator(
      onRefresh: () async {
        ctx.read<RealityCaptureBloc>().add(LoadCaptures(projectId: widget.projectId));
      },
      color: colors.primaryBrand,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
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
                    label: Text('${phase.labelAr} ($count)'),
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
      return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    }

    final works = state.works;
    if (works.isEmpty) {
      return _emptyState(colors, Icons.visibility_off_rounded, 'لا توجد أعمال مخفية', 'التقاطات ما قبل الصب ستظهر هنا');
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: colors.warning.withAlpha(15),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: colors.warning.withAlpha(40)),
          ),
          child: Row(children: [
            Icon(Icons.warning_amber_rounded, color: colors.warning, size: 20),
            const SizedBox(width: 10),
            Expanded(child: Text(
              'الأعمال المخفية: تصوير ما قبل الصب الخرساني كدليل قانوني على جودة السباكة والكهرباء',
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
      if (p.value == phase) { phaseLabel = p.labelAr; break; }
    }

    return Container(
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
                  child: Center(child: CircularProgressIndicator(color: colors.primaryBrand, strokeWidth: 2)),
                ),
                errorWidget: (context, url, error) => Container(
                  height: 180,
                  color: colors.backgroundSecondary,
                  child: Icon(Icons.broken_image_rounded, size: 40, color: colors.textSubtle),
                ),
              )
            else
              Container(
                height: 180,
                color: colors.backgroundSecondary,
                child: Icon(is360 ? Icons.view_in_ar_rounded : Icons.image_rounded, size: 40, color: colors.textSubtle),
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
                    Icon(Icons.threesixty_rounded, size: 14, color: Colors.white),
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
                  child: const Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.verified_rounded, size: 14, color: Colors.white),
                    SizedBox(width: 4),
                    Text('مُوثّق', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white)),
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
              Icon(Icons.gps_fixed_rounded, size: 12, color: colors.textSubtle),
              const SizedBox(width: 3),
              Text(
                '${(c['gps_lat'] as num?)?.toStringAsFixed(4) ?? '—'}, ${(c['gps_lng'] as num?)?.toStringAsFixed(4) ?? '—'}',
                style: TextStyle(fontSize: 10, color: colors.textSubtle, fontFamily: 'monospace'),
              ),
            ]),
          ]),
        ),
      ]),
    ).animate(delay: (index * 80).ms).fadeIn().slideY(begin: 0.03);
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

  void _showCaptureSheet(BuildContext context) {
    final colors = context.colors;
    ConstructionPhase selectedPhase = ConstructionPhase.foundation;
    CaptureType selectedType = CaptureType.photo360;
    final titleCtrl = TextEditingController();
    final descCtrl = TextEditingController();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: colors.surfaceElevated,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: colors.strokeSubtle, borderRadius: BorderRadius.circular(2)))),
              const SizedBox(height: 16),
              Text('التقاط 360° جديد', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.textPrimary), textAlign: TextAlign.center),
              const SizedBox(height: 6),
              Text('استخدم وضع البانوراما في الكاميرا للتصوير 360°', style: TextStyle(fontSize: 12, color: colors.textSubtle), textAlign: TextAlign.center),
              const SizedBox(height: 20),

              // Capture type selector
              Text('نوع الالتقاط', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.textPrimary)),
              const SizedBox(height: 8),
              Row(children: [
                _typeChip(ctx, setModalState, selectedType, CaptureType.photo360, Icons.threesixty_rounded, colors, (v) => selectedType = v),
                const SizedBox(width: 8),
                _typeChip(ctx, setModalState, selectedType, CaptureType.photoStandard, Icons.camera_alt_rounded, colors, (v) => selectedType = v),
              ]),
              const SizedBox(height: 16),

              // Phase dropdown
              Text('مرحلة البناء', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.textPrimary)),
              const SizedBox(height: 8),
              DropdownButtonFormField<ConstructionPhase>(
                initialValue: selectedPhase,
                dropdownColor: colors.surfaceElevated,
                style: TextStyle(color: colors.textPrimary, fontSize: 14),
                decoration: InputDecoration(
                  filled: true, fillColor: colors.backgroundSecondary,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: colors.strokeSubtle)),
                ),
                items: ConstructionPhase.values.map((p) => DropdownMenuItem(value: p, child: Text(p.labelAr))).toList(),
                onChanged: (v) => setModalState(() => selectedPhase = v ?? selectedPhase),
              ),
              const SizedBox(height: 14),

              TextField(controller: titleCtrl, style: TextStyle(color: colors.textPrimary),
                decoration: InputDecoration(labelText: 'عنوان (اختياري)', filled: true, fillColor: colors.backgroundSecondary,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)))),
              const SizedBox(height: 12),
              TextField(controller: descCtrl, maxLines: 2, style: TextStyle(color: colors.textPrimary),
                decoration: InputDecoration(labelText: 'وصف (اختياري)', filled: true, fillColor: colors.backgroundSecondary,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)))),
              const SizedBox(height: 20),

              ElevatedButton.icon(
                onPressed: () => _captureAndSubmit(ctx, selectedPhase, selectedType, titleCtrl.text, descCtrl.text),
                icon: const Icon(Icons.camera_rounded, color: Colors.white),
                label: Text(
                  selectedType == CaptureType.photo360 ? 'فتح الكاميرا (بانوراما 360°)' : 'فتح الكاميرا',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: colors.primaryBrand,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _typeChip(BuildContext ctx, StateSetter setModalState, CaptureType current, CaptureType target,
      IconData icon, SemanticColors colors, ValueChanged<CaptureType> onChanged) {
    final isActive = current == target;
    return Expanded(
      child: GestureDetector(
        onTap: () => setModalState(() => onChanged(target)),
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
            Text(target.labelAr, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: isActive ? Colors.white : colors.textSecondary)),
          ]),
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
          SnackBar(content: Text('خطأ: $e'), backgroundColor: context.colors.error),
        );
      }
    }
  }
}
