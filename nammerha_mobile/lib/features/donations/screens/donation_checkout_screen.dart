import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../data/donations_repository.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/i18n/t.dart';

class DonationCheckoutScreen extends StatefulWidget {
  final String projectId;
  
  const DonationCheckoutScreen({super.key, required this.projectId});

  @override
  State<DonationCheckoutScreen> createState() => _DonationCheckoutScreenState();
}

class _DonationCheckoutScreenState extends State<DonationCheckoutScreen> {
  final _repository = DonationsRepository();
  final _amountController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  
  bool _isAnonymous = false;
  bool _isSubmitting = false;

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _processDonation() async {
    if (!_formKey.currentState!.validate()) return;
    
    setState(() => _isSubmitting = true);
    
    try {
      final amount = double.parse(_amountController.text);
      final checkoutUrl = await _repository.createDonation(
        projectId: widget.projectId,
        amount: amount,
        isAnonymous: _isAnonymous,
      );
      
      final uri = Uri.parse(checkoutUrl);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
        if (mounted) Navigator.pop(context); // Go back after launching Fatora
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
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final textTheme = Theme.of(context).textTheme;

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
                value: _isAnonymous,
                onChanged: (val) => setState(() => _isAnonymous = val),
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
                  onPressed: _isSubmitting ? null : _processDonation,
                  child: _isSubmitting
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
  }
}
