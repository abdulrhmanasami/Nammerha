import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/utils/haptics.dart';
import '../../../core/widgets/gradient_button.dart';
import '../widgets/wizard_stepper.dart';
import '../widgets/damage_type_selector.dart';
import '../widgets/photo_uploader.dart';

import 'package:geolocator/geolocator.dart';

import '../models/damage_report_data.dart';
import '../data/damage_report_repository.dart';
import '../bloc/damage_report_bloc.dart';
import '../bloc/damage_report_event.dart';
import '../bloc/damage_report_state.dart';
import '../../../core/i18n/t.dart';
import '../../../core/utils/animation_budget.dart';

class DamageReportScreen extends StatelessWidget {
  /// Optional i18n key to override the AppBar title.
  ///
  /// P1-005 FIX: When launched from the dashboard "Create Project" card,
  /// pass `titleKey: 'create_project'` to eliminate cognitive dissonance
  /// (user expects "Create Project" but sees "Damage Report").
  /// Default: `'dr_title'` ("تقرير الأضرار" / "Damage Report").
  final String? titleKey;

  const DamageReportScreen({super.key, this.titleKey});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => DamageReportBloc(repository: DamageReportRepository()),
      child: _DamageReportWizard(titleKey: titleKey),
    );
  }
}

class _DamageReportWizard extends StatefulWidget {
  final String? titleKey;
  const _DamageReportWizard({this.titleKey});

  @override
  State<_DamageReportWizard> createState() => _DamageReportWizardState();
}

class _DamageReportWizardState extends State<_DamageReportWizard> {
  final PageController _pageController = PageController();
  final TextEditingController _descriptionController = TextEditingController();
  final TextEditingController _addressController = TextEditingController();

  // C2 FIX: Step labels use i18n keys — cannot be const (runtime resolved)
  List<String> _stepLabels(BuildContext context) => [
    context.tr('dr_step_type'), context.tr('dr_step_location'),
    context.tr('dr_step_photos'), context.tr('dr_step_review'),
  ];

  static const _governorateKeys = [
    'gov_damascus', 'gov_rif_dimashq', 'gov_aleppo', 'gov_homs', 'gov_hama', 'gov_latakia',
    'gov_tartous', 'gov_deir_ez_zor', 'gov_raqqa', 'gov_hasakeh', 'gov_idlib',
    'gov_daraa', 'gov_sweida', 'gov_quneitra',
  ];

  @override
  void dispose() {
    _pageController.dispose();
    _descriptionController.dispose();
    _addressController.dispose();
    super.dispose();
  }


  void _updateTextData(BuildContext context, DamageReportData data) {
    context.read<DamageReportBloc>().add(
      UpdateFormDataEvent(
        data.copyWith(
          description: _descriptionController.text.trim(),
          addressText: _addressController.text.trim(),
        ),
      )
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final bloc = context.read<DamageReportBloc>();
        final data = bloc.state.formData;

        // If form is clean, pop immediately
        if (!data.isDirty) {
          if (context.mounted) Navigator.of(context).pop();
          return;
        }

        // Show discard confirmation
        final shouldDiscard = await _showDiscardDialog(context, colors);
        if (shouldDiscard == true && context.mounted) {
          Navigator.of(context).pop();
        }
      },
      child: Scaffold(
        backgroundColor: colors.backgroundPrimary,
        appBar: AppBar(
          title: Text(context.tr(widget.titleKey ?? 'dr_title')),
          leading: BlocBuilder<DamageReportBloc, DamageReportState>(
            buildWhen: (p, c) => p.formData.currentStep != c.formData.currentStep,
            builder: (context, state) {
              if (state.formData.currentStep > 0) {
                return IconButton(
                  icon: Icon(PhosphorIconsRegular.arrowLeft),
                  onPressed: () => context.read<DamageReportBloc>().add(PrevStepEvent()),
                );
              }
              // Step 0: show close/back with discard guard
              return IconButton(
                icon: Icon(PhosphorIconsRegular.x),
                onPressed: () async {
                  final data = context.read<DamageReportBloc>().state.formData;
                  if (!data.isDirty) {
                    if (context.mounted) Navigator.of(context).pop();
                    return;
                  }
                  final shouldDiscard = await _showDiscardDialog(context, colors);
                  if (shouldDiscard == true && context.mounted) {
                    Navigator.of(context).pop();
                  }
                },
              );
            },
          ),
        ),
      body: BlocConsumer<DamageReportBloc, DamageReportState>(
        listener: (context, state) {
          // Navigation Side Effects
          if (_pageController.hasClients && _pageController.page?.round() != state.formData.currentStep) {
            _pageController.animateToPage(
              state.formData.currentStep,
              duration: NammerhaAnimations.slow,
              curve: Curves.easeInOut,
            );
          }

          if (state is DamageReportError) {
            // CRIT-MOB-001 companion: Translate ErrorKey via context.tr()
            // BLoC now emits ErrorKeys (e.g., 'err_gps_permission_required')
            // instead of raw exception strings.
             ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(context.tr(state.error)), backgroundColor: colors.error),
            );
          }

          if (state is DamageReportSuccess) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(context.tr('dr_success_msg')), backgroundColor: colors.success),
            );
            Navigator.of(context).pop(true);
          }
        },
        builder: (context, state) {
          final data = state.formData;
          return Column(
            children: [
              WizardStepper(
                currentStep: data.currentStep,
                stepLabels: _stepLabels(context),
              ),

              Expanded(
                child: PageView(
                  controller: _pageController,
                  physics: const NeverScrollableScrollPhysics(),
                  children: [
                    _buildStep1DamageType(context, data, colors),
                    _buildStep2Location(context, data, state, colors),
                    _buildStep3Photos(context, data, colors),
                    _buildStep4Review(context, data, colors),
                  ],
                ),
              ),

              _buildBottomBar(context, state, colors),
            ],
          );
        },
      ),
    ),
    );
  }

  // ─── Step 1: Damage Type ──────────────────────────────────────────────

  Widget _buildStep1DamageType(BuildContext context, DamageReportData data, SemanticColors colors) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.tr('dr_what_damage'),
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: colors.textPrimary),
          ),
          const SizedBox(height: 8),
          Text(
            context.tr('dr_select_damage_hint'),
            style: TextStyle(fontSize: 14, color: colors.textSecondary),
          ),
          const SizedBox(height: 24),
          DamageTypeSelector(
            selectedType: data.damageType,
            onSelected: (type) {
              context.read<DamageReportBloc>().add(UpdateFormDataEvent(data.copyWith(damageType: type)));
            },
          ),
        ],
      ),
    ).nmAnimate(context).fadeIn(duration: 300.ms);
  }

  // ─── Step 2: Location ─────────────────────────────────────────────────

  Widget _buildStep2Location(BuildContext context, DamageReportData data, DamageReportState state, SemanticColors colors) {
    // AUD-010 FIX: Detect loading state for GPS button feedback.
    // The BLoC emits DamageReportLoading(message: 'msg_detecting_gps') during
    // GPS acquisition. Previously, the button showed NO visual change.
    final isDetectingGPS = state is DamageReportLoading;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.tr('dr_where_property'),
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: colors.textPrimary),
          ),
          const SizedBox(height: 20),

          // AUD-010 FIX: GPS detect button — 3 visual states:
          //   1. Idle (no GPS): Blue border, "Detect location" text, tap enabled
          //   2. Loading: Animated pulse, spinner + "Detecting..." text, tap disabled
          //   3. Success: Green border, checkmark + coordinates, tap to re-detect
          // AUD-020 FIX: Semantics for screen readers (WCAG AAA).
          Semantics(
            label: context.tr('detect_gps_location'),
            button: true,
            enabled: !isDetectingGPS,
            child: GestureDetector(
            onTap: isDetectingGPS
                ? null // Guard: prevent double-tap during GPS acquisition
                : () async {
                    Haptics.light();
                    // HIGH-MOB-003 FIX: GPS permission pre-explanation.
                    // PREVIOUS: Tapping immediately triggered the OS permission dialog.
                    // iOS users get ONE chance — if they deny, must go to Settings.
                    // In conflict zones (Syria), users are extra privacy-conscious.
                    // NOW: Show a custom explanation BEFORE the OS dialog.
                    // If GPS was already detected, skip the explanation (re-detect).
                    final permission = await Geolocator.checkPermission();
                    final alreadyGranted = permission == LocationPermission.always ||
                        permission == LocationPermission.whileInUse;

                    if (data.gpsPosition != null || alreadyGranted) {
                      // Re-detect or already granted — go directly
                      if (context.mounted) {
                        context.read<DamageReportBloc>().add(DetectGPSEvent());
                      }
                    } else {
                      // First time — show explanation bottom sheet
                      if (context.mounted) {
                        final confirmed = await _showGpsExplanation(context, colors);
                        if (confirmed == true && context.mounted) {
                          context.read<DamageReportBloc>().add(DetectGPSEvent());
                        }
                      }
                    }
                  },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: isDetectingGPS
                    ? colors.primaryBrand.withAlpha(8)
                    : data.gpsPosition != null
                        ? colors.success.withAlpha(10)
                        : colors.primaryBrand.withAlpha(10),
                borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
                border: Border.all(
                  color: isDetectingGPS
                      ? colors.primaryBrand.withAlpha(80)
                      : data.gpsPosition != null
                          ? colors.success
                          : colors.primaryBrand,
                  width: 1.5,
                ),
              ),
              child: Row(
                children: [
                  if (isDetectingGPS)
                    // AUD-010: Pulsing spinner during GPS acquisition
                    SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        valueColor: AlwaysStoppedAnimation<Color>(colors.primaryBrand),
                      ),
                    ).animate(onComplete: (c) => c.repeat()).shimmer(
                      duration: 1200.ms,
                      color: colors.primaryBrand.withAlpha(40),
                    )
                  else
                    Icon(
                      data.gpsPosition != null
                          ? PhosphorIconsRegular.crosshair
                          : PhosphorIconsRegular.mapPinLine,
                      color: data.gpsPosition != null ? colors.success : colors.primaryBrand,
                    ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          isDetectingGPS
                              ? context.tr('msg_detecting_gps')
                              : data.gpsPosition != null
                                  ? context.tr('dr_location_detected')
                                  : context.tr('dr_detect_location'),
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: isDetectingGPS
                                ? colors.primaryBrand
                                : data.gpsPosition != null
                                    ? colors.success
                                    : colors.primaryBrand,
                          ),
                        ),
                        if (data.gpsPosition != null && !isDetectingGPS)
                          Text(
                            '${data.gpsPosition!.latitude.toStringAsFixed(5)}, ${data.gpsPosition!.longitude.toStringAsFixed(5)}',
                            style: TextStyle(fontSize: 12, fontFamily: 'monospace', color: colors.textSecondary),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),  // AnimatedContainer
          ),    // GestureDetector
          ),    // Semantics (AUD-020)
          const SizedBox(height: 20),

          DropdownButtonFormField<String>(
            // AUD-011 FIX: Using `initialValue` — the correct API for
            // DropdownButtonFormField (Flutter 3.33+). Shows pre-selected
            // governorate when navigating back from later wizard steps.
            initialValue: data.governorate.isNotEmpty ? data.governorate : null,
            decoration: InputDecoration(
              labelText: '${context.tr('dr_governorate')} *',
              filled: true,
              fillColor: colors.surfaceElevated,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd)),
            ),
            items: _governorateKeys.map((key) => DropdownMenuItem(value: key, child: Text(context.tr(key)))).toList(),
            onChanged: (val) {
              context.read<DamageReportBloc>().add(UpdateFormDataEvent(data.copyWith(governorate: val ?? '')));
            },
          ),
          const SizedBox(height: 16),

          TextFormField(
            initialValue: data.neighborhood,
            onChanged: (val) {
              context.read<DamageReportBloc>().add(UpdateFormDataEvent(data.copyWith(neighborhood: val)));
            },
            // HIGH-MOB-004 FIX: Optimized keyboard and autofill hints
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(
              labelText: context.tr('neighborhood'),
              hintText: context.tr('dr_neighborhood_hint'),
              filled: true,
              fillColor: colors.surfaceElevated,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd)),
            ),
          ),
          const SizedBox(height: 16),

          TextField(
            controller: _addressController,
            onChanged: (_) => _updateTextData(context, data),
            // HIGH-MOB-004 FIX: Optimized keyboard type and input action
            keyboardType: TextInputType.streetAddress,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.fullStreetAddress],
            decoration: InputDecoration(
              labelText: context.tr('dr_address_detail'),
              hintText: context.tr('dr_address_hint'),
              filled: true,
              fillColor: colors.surfaceElevated,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd)),
            ),
          ),
        ],
      ),
    ).nmAnimate(context).fadeIn(duration: 300.ms);
  }

  // ─── Step 3: Photos ───────────────────────────────────────────────────

  Widget _buildStep3Photos(BuildContext context, DamageReportData data, SemanticColors colors) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.tr('dr_capture_photos'),
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: colors.textPrimary),
          ),
          const SizedBox(height: 8),
          Text(
            context.tr('dr_capture_hint'),
            style: TextStyle(fontSize: 14, color: colors.textSecondary),
          ),
          const SizedBox(height: 24),
          PhotoUploader(
            photos: data.photos,
            onPhotosChanged: (photos) {
              context.read<DamageReportBloc>().add(UpdateFormDataEvent(data.copyWith(photos: photos)));
            },
          ),
        ],
      ),
    ).nmAnimate(context).fadeIn(duration: 300.ms);
  }

  // ─── Step 4: Review & Submit ──────────────────────────────────────────

  Widget _buildStep4Review(BuildContext context, DamageReportData data, SemanticColors colors) {
    if (data.damageType == null) return const SizedBox.shrink();
    
    final damageLabel = DamageTypeSelector.categories
        .firstWhere((c) => c.key == data.damageType, orElse: () => DamageTypeSelector.categories.last)
        .label;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.tr('dr_review_submit'),
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: colors.textPrimary),
          ),
          const SizedBox(height: 20),

          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: colors.surfaceElevated,
              borderRadius: BorderRadius.circular(NammerhaTheme.radiusLg),
              border: Border.all(color: colors.strokeSubtle),
            ),
            child: Column(
              children: [
                _reviewRow(context.tr('dr_damage_type'), damageLabel, colors),
                _reviewRow(context.tr('governorate_3'), data.governorate, colors),
                if (data.neighborhood.isNotEmpty)
                  _reviewRow(context.tr('neighborhood'), data.neighborhood, colors),
                _reviewRow(context.tr('photos'), '${data.photos.length} ${context.tr('dr_photos')}', colors),
                if (data.gpsPosition != null)
                  _reviewRow(
                    context.tr('coordinates'),
                    '${data.gpsPosition!.latitude.toStringAsFixed(4)}, ${data.gpsPosition!.longitude.toStringAsFixed(4)}',
                    colors,
                  ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // UX PLATINUM FIX: One-Tap Snag Macros
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _macroChip(context.tr('macro_cracks'), colors),
                  const SizedBox(width: 8),
                  _macroChip(context.tr('macro_plumbing'), colors),
                  const SizedBox(width: 8),
                  _macroChip(context.tr('macro_electrical'), colors),
                  const SizedBox(width: 8),
                  _macroChip(context.tr('macro_roof'), colors),
                ],
              ),
            ),
          ),
          TextField(
            controller: _descriptionController,
            maxLines: 4,
            onChanged: (_) => _updateTextData(context, data),
            decoration: InputDecoration(
              labelText: '${context.tr('dr_damage_desc')} *',
              hintText: context.tr('dr_damage_desc_hint'),
              filled: true,
              fillColor: colors.surfaceElevated,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd)),
              alignLabelWithHint: true,
            ),
          ),
        ],
      ),
    ).nmAnimate(context).fadeIn(duration: 300.ms);
  }

  Widget _macroChip(String text, SemanticColors colors) {
    return GestureDetector(
      onTap: () {
        Haptics.light();
        final currentText = _descriptionController.text;
        _descriptionController.text = currentText.isEmpty ? text : '$currentText\n- $text';
        _updateTextData(context, context.read<DamageReportBloc>().state.formData);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: colors.primaryBrand.withAlpha(20),
          border: Border.all(color: colors.primaryBrand.withAlpha(50)),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          text,
          style: TextStyle(color: colors.primaryBrand, fontSize: 12, fontWeight: FontWeight.bold),
        ),
      ),
    );
  }

  Widget _reviewRow(String label, String value, SemanticColors colors) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 90,
            child: Text(label, style: TextStyle(fontSize: 13, color: colors.textSecondary)),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.textPrimary),
            ),
          ),
        ],
      ),
    );
  }

  // ─── GPS Permission Pre-Explanation (HIGH-MOB-003) ──────────────────────

  /// Shows a branded bottom sheet explaining WHY location is needed.
  /// Returns `true` if user taps "Allow", `false`/null if dismissed or skipped.
  ///
  /// HIGH-MOB-003 FIX: In Syria, users are privacy-conscious — especially in
  /// post-conflict areas. A cold OS permission dialog with no context leads to
  /// high denial rates. On iOS, denial is quasi-permanent (Settings only).
  /// This pre-explanation aligns with Google's "Pre-Prompting" best practice
  /// and Apple HIG's "Explain why your app needs the data" guideline.
  Future<bool?> _showGpsExplanation(BuildContext context, SemanticColors colors) {
    Haptics.light();
    return showModalBottomSheet<bool>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: BoxDecoration(
          color: colors.surfaceElevated,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Grabber
            Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 20),
              decoration: BoxDecoration(
                color: colors.strokeSubtle,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            // Icon
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: colors.primaryBrand.withAlpha(12),
                shape: BoxShape.circle,
              ),
              child: Icon(PhosphorIconsRegular.mapPinLine, size: 32, color: colors.primaryBrand),
            ),
            const SizedBox(height: 16),
            // Title
            Text(
              context.tr('gps_why_title'),
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: colors.textPrimary),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            // Explanation bullets
            _gpsBullet(context, colors, PhosphorIconsRegular.mapTrifold, 'gps_why_verify'),
            _gpsBullet(context, colors, PhosphorIconsRegular.shieldCheck, 'gps_why_escrow'),
            _gpsBullet(context, colors, PhosphorIconsRegular.lockSimple, 'gps_why_privacy'),
            const SizedBox(height: 20),
            // CTA
            GradientButton(
              label: context.tr('gps_allow_btn'),
              icon: PhosphorIconsRegular.mapPinLine,
              onPressed: () => Navigator.pop(ctx, true),
            ),
            const SizedBox(height: 8),
            // Skip
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(
                context.tr('gps_skip_btn'),
                style: TextStyle(color: colors.textSecondary, fontSize: 14),
              ),
            ),
            SizedBox(height: MediaQuery.of(context).viewPadding.bottom),
          ],
        ),
      ),
    );
  }

  Widget _gpsBullet(BuildContext context, SemanticColors colors, IconData icon, String key) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            margin: const EdgeInsetsDirectional.only(end: 12),
            decoration: BoxDecoration(
              color: colors.primaryBrand.withAlpha(8),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 16, color: colors.primaryBrand),
          ),
          Expanded(
            child: Text(
              context.tr(key),
              style: TextStyle(fontSize: 13, color: colors.textSecondary, height: 1.5),
            ),
          ),
        ],
      ),
    );
  }

  // ─── Discard Confirmation (P3-003) ─────────────────────────────────────

  Future<bool?> _showDiscardDialog(BuildContext context, SemanticColors colors) {
    Haptics.medium();
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surfaceElevated,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        icon: Icon(PhosphorIconsRegular.warning, size: 40, color: colors.warning),
        title: Text(
          context.tr('dr_discard_title'),
          style: TextStyle(fontWeight: FontWeight.w800, color: colors.textPrimary),
        ),
        content: Text(
          context.tr('dr_discard_body'),
          style: TextStyle(color: colors.textSecondary, fontSize: 14),
          textAlign: TextAlign.center,
        ),
        actionsAlignment: MainAxisAlignment.center,
        actions: [
          OutlinedButton(
            onPressed: () {
              Haptics.heavy();
              Navigator.pop(ctx, true);
            },
            style: OutlinedButton.styleFrom(
              side: BorderSide(color: colors.error.withAlpha(60)),
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: Text(
              context.tr('dr_discard_leave'),
              style: TextStyle(color: colors.error, fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(width: 8),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, false),
            style: ElevatedButton.styleFrom(
              backgroundColor: colors.primaryBrand,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: Text(
              context.tr('dr_discard_stay'),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }

  // ─── Bottom Bar ───────────────────────────────────────────────────────

  Widget _buildBottomBar(BuildContext context, DamageReportState state, SemanticColors colors) {
    final data = state.formData;
    final isLoading = state is DamageReportLoading;
    final loadingMessage = isLoading ? state.message : null;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        boxShadow: const [NammerhaShadows.sheet],
      ),
      child: SafeArea(
        child: data.currentStep == 3
            ? GradientButton(
                label: loadingMessage ?? context.tr('dr_submit_btn'),
                icon: PhosphorIconsRegular.paperPlaneRight,
                isLoading: isLoading,
                onPressed: data.canProceed && !isLoading ? () {
                  Haptics.heavy();
                  context.read<DamageReportBloc>().add(SubmitReportEvent());
                } : null,
              )
            : GradientButton(
                label: context.tr('next'),
                icon: PhosphorIconsRegular.arrowRight,
                onPressed: data.canProceed ? () {
                  Haptics.medium();
                  context.read<DamageReportBloc>().add(NextStepEvent());
                } : null,
              ),
      ),
    );
  }
}
