import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../data/bids_repository.dart';

class SubmitBidScreen extends StatefulWidget {
  final String projectId;
  
  const SubmitBidScreen({super.key, required this.projectId});

  @override
  State<SubmitBidScreen> createState() => _SubmitBidScreenState();
}

class _SubmitBidScreenState extends State<SubmitBidScreen> {
  final _repository = BidsRepository();
  final _amountController = TextEditingController();
  final _notesController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  
  bool _isSubmitting = false;

  @override
  void dispose() {
    _amountController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submitBid() async {
    if (!_formKey.currentState!.validate()) return;
    
    setState(() => _isSubmitting = true);
    
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
            content: Text(
              'تم تقديم العطاء بنجاح. سيتم إرساله للقيد الذكي.',
              style: GoogleFonts.cairo(),
            ),
            backgroundColor: const Color(0xFF0A6E55),
          ),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              e.toString(),
              style: GoogleFonts.cairo(),
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F6F8),
      appBar: AppBar(
        backgroundColor: Colors.white,
        title: Text(
          'تقديم عطاء تسعير',
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
              Text(
                'المبلغ الإجمالي المقترح (USD)',
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
                style: GoogleFonts.cairo(),
                decoration: InputDecoration(
                  filled: true,
                  fillColor: Colors.white,
                  hintText: 'أدخل المبلغ هنا...',
                  hintStyle: GoogleFonts.cairo(color: Colors.grey.shade400),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide.none,
                  ),
                  prefixIcon: const Icon(Icons.attach_money, color: Color(0xFF0D47A1)),
                ),
                validator: (val) {
                  if (val == null || val.isEmpty) return 'المبلغ مطلوب';
                  final num = double.tryParse(val);
                  if (num == null) return 'يجب أن يكون رقماً صالحاً';
                  if (num <= 0) return 'المبلغ يجب أن يكون أكبر من صفر';
                  return null;
                },
              ),
              const SizedBox(height: 24),
              Text(
                'ملاحظات إضافية وشروط (اختياري)',
                style: GoogleFonts.cairo(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: const Color(0xFF242424),
                ),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _notesController,
                maxLines: 4,
                style: GoogleFonts.cairo(),
                decoration: InputDecoration(
                  filled: true,
                  fillColor: Colors.white,
                  hintText: 'اكتب الشروط الإضافية أو الملاحظات الهندسية...',
                  hintStyle: GoogleFonts.cairo(color: Colors.grey.shade400),
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
                  style: ButtonStyle(
                    backgroundColor: WidgetStateProperty.all(const Color(0xFF0D47A1)),
                    padding: WidgetStateProperty.all(const EdgeInsets.symmetric(vertical: 16)),
                    shape: WidgetStateProperty.all(
                      RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                  onPressed: _isSubmitting ? null : _submitBid,
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        )
                      : Text(
                          'تأكيد وتقديم العطاء',
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
