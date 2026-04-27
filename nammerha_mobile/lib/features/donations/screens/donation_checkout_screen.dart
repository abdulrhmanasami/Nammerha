import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import '../data/donations_repository.dart';

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
            content: Text(e.toString(), style: GoogleFonts.cairo()),
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
    return Scaffold(
      backgroundColor: const Color(0xFFF4F6F8),
      appBar: AppBar(
        backgroundColor: Colors.white,
        title: Text(
          'التبرع للمشروع',
          style: GoogleFonts.cairo(
            color: const Color(0xFF242424),
            fontWeight: FontWeight.bold,
          ),
        ),
        iconTheme: const IconThemeData(color: Color(0xFF242424)),
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
                  color: const Color(0xFFE3F2FD),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF0D47A1).withValues(alpha: 0.2)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.security, color: Color(0xFF0D47A1)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'جميع التبرعات محمية بنظام الضمان (Escrow) ولن تُصرف إلا بعد الإثبات المكاني.',
                        style: GoogleFonts.cairo(
                          color: const Color(0xFF0D47A1),
                          fontSize: 12,
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
                style: GoogleFonts.cairo(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: const Color(0xFF242424),
                ),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _amountController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                style: GoogleFonts.cairo(fontSize: 24, fontWeight: FontWeight.bold),
                decoration: InputDecoration(
                  filled: true,
                  fillColor: Colors.white,
                  hintText: '0.00',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  prefixIcon: const Icon(Icons.attach_money, size: 32, color: Color(0xFF0A6E55)),
                ),
                validator: (val) {
                  if (val == null || val.isEmpty) return 'مطلوب';
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
                  style: GoogleFonts.cairo(fontWeight: FontWeight.w600),
                ),
                subtitle: Text(
                  'لن يتم عرض اسمك في السجل العام للمشروع',
                  style: GoogleFonts.cairo(fontSize: 12, color: Colors.grey.shade600),
                ),
                activeTrackColor: const Color(0xFF0D47A1).withValues(alpha: 0.5),
                activeThumbColor: const Color(0xFF0D47A1),
                value: _isAnonymous,
                onChanged: (val) => setState(() => _isAnonymous = val),
              ),
              const SizedBox(height: 48),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ButtonStyle(
                    backgroundColor: WidgetStateProperty.all(const Color(0xFF0A6E55)),
                    padding: WidgetStateProperty.all(const EdgeInsets.symmetric(vertical: 16)),
                    shape: WidgetStateProperty.all(
                      RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
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
                          style: GoogleFonts.cairo(
                            fontSize: 16,
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
