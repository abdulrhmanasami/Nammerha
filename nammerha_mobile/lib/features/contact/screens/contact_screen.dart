import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/semantic_colors.dart';

/// Contact Screen — mirrors web contact.ts
/// GAP-M4 FIX: Contact form with category picker.
class ContactScreen extends StatefulWidget {
  const ContactScreen({super.key});

  @override
  State<ContactScreen> createState() => _ContactScreenState();
}

class _ContactScreenState extends State<ContactScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _subjectCtrl = TextEditingController();
  final _messageCtrl = TextEditingController();
  String _category = 'general';
  bool _isSubmitting = false;
  bool _isSuccess = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _subjectCtrl.dispose();
    _messageCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isSubmitting = true);
    try {
      await NammerhaApiClient.instance.request(
        '/contact',
        method: 'POST',
        body: {
          'name': _nameCtrl.text.trim(),
          'email': _emailCtrl.text.trim(),
          'subject': _subjectCtrl.text.trim(),
          'message': _messageCtrl.text.trim(),
          'category': _category,
        },
      );
      setState(() { _isSubmitting = false; _isSuccess = true; });
    } on ApiException catch (e) {
      setState(() => _isSubmitting = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: context.colors.error));
      }
    } catch (e) {
      setState(() => _isSubmitting = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('فشل الإرسال: $e'), backgroundColor: context.colors.error));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text('تواصل معنا', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.textPrimary)),
        backgroundColor: colors.backgroundPrimary, elevation: 0,
        iconTheme: IconThemeData(color: colors.textPrimary),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: _isSuccess ? _successView(colors) : _formView(colors),
        ),
      ),
    );
  }

  Widget _formView(SemanticColors colors) {
    return Form(
      key: _formKey,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        // Header
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [colors.primaryBrand, colors.secondaryAccent]),
            borderRadius: BorderRadius.circular(18),
          ),
          child: Column(children: [
            const Icon(Icons.headset_mic_rounded, color: Colors.white, size: 40),
            const SizedBox(height: 10),
            const Text('نحن هنا لمساعدتك', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white)),
            const SizedBox(height: 4),
            Text('سنرد خلال 24 ساعة عمل', style: TextStyle(fontSize: 13, color: Colors.white.withAlpha(200))),
          ]),
        ).animate().fadeIn(duration: 400.ms),
        const SizedBox(height: 24),
        // Category
        DropdownButtonFormField<String>(
          value: _category,
          dropdownColor: colors.surfaceElevated,
          style: TextStyle(color: colors.textPrimary, fontSize: 14),
          decoration: _inputDecor(colors, 'الفئة'),
          items: const [
            DropdownMenuItem(value: 'general', child: Text('استفسار عام')),
            DropdownMenuItem(value: 'technical', child: Text('دعم تقني')),
            DropdownMenuItem(value: 'financial', child: Text('مالي / ضمان')),
            DropdownMenuItem(value: 'partnership', child: Text('شراكات')),
            DropdownMenuItem(value: 'complaint', child: Text('شكوى')),
          ],
          onChanged: (v) => setState(() => _category = v ?? _category),
        ),
        const SizedBox(height: 14),
        TextFormField(controller: _nameCtrl, style: TextStyle(color: colors.textPrimary),
          decoration: _inputDecor(colors, 'الاسم الكامل *'),
          validator: (v) => v == null || v.trim().isEmpty ? 'مطلوب' : null),
        const SizedBox(height: 14),
        TextFormField(controller: _emailCtrl, keyboardType: TextInputType.emailAddress,
          textDirection: TextDirection.ltr, style: TextStyle(color: colors.textPrimary),
          decoration: _inputDecor(colors, 'البريد الإلكتروني *'),
          validator: (v) {
            if (v == null || v.trim().isEmpty) return 'مطلوب';
            if (!v.contains('@')) return 'بريد إلكتروني غير صالح';
            return null;
          }),
        const SizedBox(height: 14),
        TextFormField(controller: _subjectCtrl, style: TextStyle(color: colors.textPrimary),
          decoration: _inputDecor(colors, 'الموضوع *'),
          validator: (v) => v == null || v.trim().isEmpty ? 'مطلوب' : null),
        const SizedBox(height: 14),
        TextFormField(controller: _messageCtrl, maxLines: 5, style: TextStyle(color: colors.textPrimary),
          decoration: _inputDecor(colors, 'الرسالة *'),
          validator: (v) {
            if (v == null || v.trim().isEmpty) return 'مطلوب';
            if (v.trim().length < 10) return 'الرسالة قصيرة جداً';
            return null;
          }),
        const SizedBox(height: 24),
        ElevatedButton(
          onPressed: _isSubmitting ? null : _submit,
          style: ElevatedButton.styleFrom(backgroundColor: colors.primaryBrand,
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
          child: _isSubmitting
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
              : const Text('إرسال', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15)),
        ),
      ]),
    );
  }

  Widget _successView(SemanticColors colors) {
    return Column(children: [
      const SizedBox(height: 60),
      Container(width: 80, height: 80,
        decoration: BoxDecoration(color: colors.success.withAlpha(20), shape: BoxShape.circle),
        child: Icon(Icons.check_circle_rounded, size: 48, color: colors.success),
      ).animate().scale(duration: 400.ms, curve: Curves.elasticOut),
      const SizedBox(height: 24),
      Text('تم إرسال رسالتك بنجاح!', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: colors.textPrimary)).animate(delay: 200.ms).fadeIn(),
      const SizedBox(height: 8),
      Text('سنتواصل معك في أقرب وقت ممكن', style: TextStyle(fontSize: 14, color: colors.textSecondary)).animate(delay: 300.ms).fadeIn(),
      const SizedBox(height: 32),
      ElevatedButton(onPressed: () => Navigator.pop(context),
        style: ElevatedButton.styleFrom(backgroundColor: colors.primaryBrand,
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
        child: const Text('العودة', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
      ).animate(delay: 400.ms).fadeIn(),
    ]);
  }

  InputDecoration _inputDecor(SemanticColors colors, String label) {
    return InputDecoration(
      labelText: label, labelStyle: TextStyle(color: colors.textSecondary, fontSize: 13),
      filled: true, fillColor: colors.surfaceElevated,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: colors.strokeSubtle)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: colors.strokeSubtle)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: colors.primaryBrand, width: 2)),
    );
  }
}
