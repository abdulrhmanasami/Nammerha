import 'package:flutter/material.dart';
import '../data/bids_repository.dart';
import '../../../core/theme/semantic_colors.dart';

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
          const SnackBar(
            content: Text('تم تقديم العطاء بنجاح. سيتم إرساله للقيد الذكي.'),
            backgroundColor: Color(0xFF0A6E55),
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
        setState(() => _isSubmitting = false);
      }
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
          'تقديم عطاء تسعير',
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
                'المبلغ الإجمالي المقترح (USD)',
                style: textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: colors.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _amountController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                style: textTheme.bodyLarge,
                decoration: InputDecoration(
                  filled: true,
                  fillColor: colors.surfaceElevated,
                  hintText: 'أدخل المبلغ هنا...',
                  hintStyle: textTheme.bodyMedium?.copyWith(color: colors.textSubtle),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide.none,
                  ),
                  prefixIcon: Icon(Icons.attach_money, color: colors.primaryBrand),
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
                style: textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: colors.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _notesController,
                maxLines: 4,
                style: textTheme.bodyLarge,
                decoration: InputDecoration(
                  filled: true,
                  fillColor: colors.surfaceElevated,
                  hintText: 'اكتب الشروط الإضافية أو الملاحظات الهندسية...',
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
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
