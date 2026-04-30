import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/gradient_button.dart';
import '../widgets/wizard_stepper.dart';
import '../widgets/damage_type_selector.dart';
import '../widgets/photo_uploader.dart';

import '../models/damage_report_data.dart';
import '../data/damage_report_repository.dart';
import '../bloc/damage_report_bloc.dart';
import '../bloc/damage_report_event.dart';
import '../bloc/damage_report_state.dart';
import '../../../core/i18n/t.dart';

class DamageReportScreen extends StatelessWidget {
  const DamageReportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => DamageReportBloc(repository: DamageReportRepository()),
      child: const _DamageReportWizard(),
    );
  }
}

class _DamageReportWizard extends StatefulWidget {
  const _DamageReportWizard();

  @override
  State<_DamageReportWizard> createState() => _DamageReportWizardState();
}

class _DamageReportWizardState extends State<_DamageReportWizard> {
  final PageController _pageController = PageController();
  final TextEditingController _descriptionController = TextEditingController();
  final TextEditingController _addressController = TextEditingController();

  static const _stepLabels = ['نوع الضرر', 'الموقع', 'الصور', 'المراجعة'];

  static const _governorates = [
    'دمشق', 'ريف دمشق', 'حلب', 'حمص', 'حماة', 'اللاذقية',
    'طرطوس', 'دير الزور', 'الرقة', 'الحسكة', 'إدلب',
    'درعا', 'السويداء', 'القنيطرة',
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

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: const Text('تقرير الأضرار'),
        leading: BlocBuilder<DamageReportBloc, DamageReportState>(
          buildWhen: (p, c) => p.formData.currentStep != c.formData.currentStep,
          builder: (context, state) {
            return state.formData.currentStep > 0
                ? IconButton(
                    icon: const Icon(Icons.arrow_back_rounded),
                    onPressed: () => context.read<DamageReportBloc>().add(PrevStepEvent()),
                  )
                : const BackButton();
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
             ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.error), backgroundColor: colors.error),
            );
          }

          if (state is DamageReportSuccess) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: const Text('✅ تم تقديم طلب الإعمار بنجاح!'), backgroundColor: colors.success),
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
                stepLabels: _stepLabels,
              ),

              Expanded(
                child: PageView(
                  controller: _pageController,
                  physics: const NeverScrollableScrollPhysics(),
                  children: [
                    _buildStep1DamageType(context, data, colors),
                    _buildStep2Location(context, data, colors),
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
            'ما نوع الضرر؟',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: colors.textPrimary),
          ),
          const SizedBox(height: 8),
          Text(
            'اختر نوع الضرر الرئيسي في منزلك',
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
    ).animate().fadeIn(duration: 300.ms);
  }

  // ─── Step 2: Location ─────────────────────────────────────────────────

  Widget _buildStep2Location(BuildContext context, DamageReportData data, SemanticColors colors) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'أين يقع العقار؟',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: colors.textPrimary),
          ),
          const SizedBox(height: 20),

          GestureDetector(
            onTap: () => context.read<DamageReportBloc>().add(DetectGPSEvent()),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: data.gpsPosition != null ? colors.success.withAlpha(10) : colors.primaryBrand.withAlpha(10),
                borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
                border: Border.all(
                  color: data.gpsPosition != null ? colors.success : colors.primaryBrand,
                  width: 1.5,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    data.gpsPosition != null ? Icons.gps_fixed_rounded : Icons.gps_not_fixed_rounded,
                    color: data.gpsPosition != null ? colors.success : colors.primaryBrand,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          data.gpsPosition != null ? 'تم تحديد الموقع ✓' : 'تحديد الموقع تلقائياً',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: data.gpsPosition != null ? colors.success : colors.primaryBrand,
                          ),
                        ),
                        if (data.gpsPosition != null)
                          Text(
                            '${data.gpsPosition!.latitude.toStringAsFixed(5)}, ${data.gpsPosition!.longitude.toStringAsFixed(5)}',
                            style: TextStyle(fontSize: 12, fontFamily: 'monospace', color: colors.textSecondary),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),

          DropdownButtonFormField<String>(
            initialValue: data.governorate.isNotEmpty ? data.governorate : null,
            decoration: InputDecoration(
              labelText: 'المحافظة *',
              filled: true,
              fillColor: colors.surfaceElevated,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd)),
            ),
            items: _governorates.map((g) => DropdownMenuItem(value: g, child: Text(g))).toList(),
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
            decoration: InputDecoration(
              labelText: context.tr('str_c9256712'),
              hintText: 'مثال: المزة، الشعلان',
              filled: true,
              fillColor: colors.surfaceElevated,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd)),
            ),
          ),
          const SizedBox(height: 16),

          TextField(
            controller: _addressController,
            onChanged: (_) => _updateTextData(context, data),
            decoration: InputDecoration(
              labelText: 'العنوان التفصيلي (اختياري)',
              hintText: 'شارع، بناء، طابق',
              filled: true,
              fillColor: colors.surfaceElevated,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd)),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms);
  }

  // ─── Step 3: Photos ───────────────────────────────────────────────────

  Widget _buildStep3Photos(BuildContext context, DamageReportData data, SemanticColors colors) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'صوّر الأضرار',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: colors.textPrimary),
          ),
          const SizedBox(height: 8),
          Text(
            'التقط صوراً واضحة للأضرار من زوايا مختلفة',
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
    ).animate().fadeIn(duration: 300.ms);
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
            'مراجعة وإرسال',
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
                _reviewRow('نوع الضرر', damageLabel, colors),
                _reviewRow(context.tr('str_d5113593'), data.governorate, colors),
                if (data.neighborhood.isNotEmpty)
                  _reviewRow(context.tr('str_c9256712'), data.neighborhood, colors),
                _reviewRow(context.tr('str_5ed92505'), '${data.photos.length} صور', colors),
                if (data.gpsPosition != null)
                  _reviewRow(
                    context.tr('str_3cf6c7a4'),
                    '${data.gpsPosition!.latitude.toStringAsFixed(4)}, ${data.gpsPosition!.longitude.toStringAsFixed(4)}',
                    colors,
                  ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          TextField(
            controller: _descriptionController,
            maxLines: 4,
            onChanged: (_) => _updateTextData(context, data),
            decoration: InputDecoration(
              labelText: 'وصف الأضرار *',
              hintText: 'اشرح طبيعة الأضرار بالتفصيل...',
              filled: true,
              fillColor: colors.surfaceElevated,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd)),
              alignLabelWithHint: true,
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms);
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
                label: loadingMessage ?? 'تقديم طلب الإعمار',
                icon: Icons.send_rounded,
                isLoading: isLoading,
                onPressed: data.canProceed && !isLoading ? () => context.read<DamageReportBloc>().add(SubmitReportEvent()) : null,
              )
            : GradientButton(
                label: context.tr('next'),
                icon: Icons.arrow_forward_rounded,
                onPressed: data.canProceed ? () => context.read<DamageReportBloc>().add(NextStepEvent()) : null,
              ),
      ),
    );
  }
}
