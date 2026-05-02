import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';
import '../data/donations_repository.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/i18n/t.dart';
import '../bloc/donation_form_cubit.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// DonationCheckoutScreen — Platinum Standard (Absolute Zero setState)
/// ═══════════════════════════════════════════════════════════════════════════
/// BlocProvider MUST be an ancestor of the StatefulWidget so that
/// context.read<DonationFormCubit>() resolves correctly in async methods.
/// ═══════════════════════════════════════════════════════════════════════════

class DonationCheckoutScreen extends StatelessWidget {
  final String projectId;

  const DonationCheckoutScreen({super.key, required this.projectId});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => DonationFormCubit(),
      child: _DonationCheckoutContent(projectId: projectId),
    );
  }
}

class _DonationCheckoutContent extends StatefulWidget {
  final String projectId;
  const _DonationCheckoutContent({required this.projectId});

  @override
  State<_DonationCheckoutContent> createState() => _DonationCheckoutContentState();
}

class _DonationCheckoutContentState extends State<_DonationCheckoutContent> {
  final _repository = DonationsRepository();
  final _amountController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _processDonation() async {
    if (!_formKey.currentState!.validate()) return;

    final cubit = context.read<DonationFormCubit>();
    cubit.setSubmitting(true);

    try {
      final amount = double.parse(_amountController.text);
      final checkoutUrl = await _repository.createDonation(
        projectId: widget.projectId,
        amount: amount,
        isAnonymous: cubit.state.isAnonymous,
      );

      final uri = Uri.parse(checkoutUrl);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
        if (mounted) Navigator.pop(context);
      } else {
        throw Exception('لا يمكن فتح رابط الدفع');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString()),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) cubit.setSubmitting(false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final textTheme = Theme.of(context).textTheme;

    return BlocBuilder<DonationFormCubit, DonationFormState>(
      builder: (context, formState) {
        return Scaffold(
          backgroundColor: colors.backgroundPrimary,
          appBar: AppBar(
            title: Text(
              'التبرع للمشروع',
              style: textTheme.titleMedium?.copyWith(
                color: colors.textPrimary,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: colors.primaryBrandLight,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: colors.primaryBrand.withAlpha(50)),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.security, color: colors.primaryBrand),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'جميع التبرعات محمية بنظام الضمان (Escrow) ولن تُصرف إلا بعد الإثبات المكاني.',
                            style: textTheme.bodySmall?.copyWith(
                              color: colors.primaryBrand,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 32),
                  Text(
                    'مبلغ التبرع (USD)',
                    style: textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: colors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _amountController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    style: textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: colors.surfaceElevated,
                      hintText: '0.00',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                      prefixIcon: Icon(Icons.attach_money, size: 32, color: colors.secondaryAccent),
                    ),
                    validator: (val) {
                      if (val == null || val.isEmpty) return context.tr('str_bbd73382');
                      final num = double.tryParse(val);
                      if (num == null || num <= 0) return 'مبلغ غير صالح';
                      return null;
                    },
                  ),
                  const SizedBox(height: 24),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      'تبرع بصفة مجهول (Anonymous)',
                      style: textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                    ),
                    subtitle: Text(
                      'لن يتم عرض اسمك في السجل العام للمشروع',
                      style: textTheme.bodySmall?.copyWith(color: colors.textSecondary),
                    ),
                    activeTrackColor: colors.primaryBrand.withAlpha(127),
                    activeThumbColor: colors.primaryBrand,
                    value: formState.isAnonymous,
                    onChanged: (val) => context.read<DonationFormCubit>().toggleAnonymous(val),
                  ),
                  const SizedBox(height: 48),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: colors.secondaryAccent,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: formState.isSubmitting ? null : _processDonation,
                      child: formState.isSubmitting
                          ? const SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                            )
                          : Text(
                              'متابعة الدفع عبر بوابة فاتورة',
                              style: textTheme.titleSmall?.copyWith(
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
