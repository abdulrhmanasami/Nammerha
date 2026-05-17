import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import '../data/bids_repository.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/bloc/submit_form_cubit.dart';
import '../../../core/i18n/t.dart'; // PLAT-100: i18n import

/// ═══════════════════════════════════════════════════════════════════════════
/// SubmitBidScreen — Platinum Standard (Absolute Zero setState)
/// ═══════════════════════════════════════════════════════════════════════════
/// BlocProvider MUST be an ancestor of the StatefulWidget so that
/// `context.read<SubmitFormCubit>()` resolves correctly in async methods.
/// ═══════════════════════════════════════════════════════════════════════════

class SubmitBidScreen extends StatelessWidget {
  final String projectId;

  const SubmitBidScreen({super.key, required this.projectId});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => SubmitFormCubit(),
      child: _SubmitBidContent(projectId: projectId),
    );
  }
}

class _SubmitBidContent extends StatefulWidget {
  final String projectId;
  const _SubmitBidContent({required this.projectId});

  @override
  State<_SubmitBidContent> createState() => _SubmitBidContentState();
}

class _SubmitBidContentState extends State<_SubmitBidContent> {
  final _repository = BidsRepository();
  final _amountController = TextEditingController();
  final _notesController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _amountController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submitBid() async {
    HapticFeedback.mediumImpact();
    if (!_formKey.currentState!.validate()) return;

    final cubit = context.read<SubmitFormCubit>();
    cubit.setSubmitting(true);

    try {
      final amount = double.parse(_amountController.text);
      await _repository.submitBid(
        projectId: widget.projectId,
        totalAmount: amount,
        notes: _notesController.text,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.tr('sent_success_submitted_success_bid')),
            backgroundColor: const Color(0xFF0A6E55),
          ),
        );
        Navigator.pop(context);
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
      if (mounted) {
        cubit.setSubmitting(false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final textTheme = Theme.of(context).textTheme;

    return BlocBuilder<SubmitFormCubit, bool>(
      builder: (context, isSubmitting) {
        return Scaffold(
          backgroundColor: colors.backgroundPrimary,
          appBar: AppBar(
            title: Text(
              context.tr('submit_bid_2'),
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
                  Text(
                    context.tr('total_amount'),
                    style: textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: colors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _amountController,
                    textInputAction: TextInputAction.next,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    style: textTheme.bodyLarge,
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: colors.surfaceElevated,
                      hintText: context.tr('input_amount_enter'),
                      hintStyle: textTheme.bodyMedium?.copyWith(color: colors.textSubtle),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: BorderSide.none,
                      ),
                      prefixIcon: Icon(PhosphorIcons.currencyDollar(), color: colors.primaryBrand),
                    ),
                    validator: (val) {
                      if (val == null || val.isEmpty) return context.tr('amount_required');
                      final num = double.tryParse(val);
                      if (num == null) return context.tr('validation_validation_3');
                      if (num <= 0) return context.tr('validation_validation_amount');
                      return null;
                    },
                  ),
                  const SizedBox(height: 24),
                  Text(
                    context.tr('notes_terms_optional'),
                    style: textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: colors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _notesController,
                    textInputAction: TextInputAction.done,
                    maxLines: 4,
                    style: textTheme.bodyLarge,
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: colors.surfaceElevated,
                      hintText: context.tr('hint_additional_terms'),
                      hintStyle: textTheme.bodyMedium?.copyWith(color: colors.textSubtle),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                  const SizedBox(height: 48),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: colors.primaryBrand,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: isSubmitting ? null : _submitBid,
                      child: isSubmitting
                          ? SizedBox(width: 24, height: 24, child: NammerhaShimmerLoader(colors: colors),
                            )
                          : Text(
                              context.tr('bid_submit'),
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
