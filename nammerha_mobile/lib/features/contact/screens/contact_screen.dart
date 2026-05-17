import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter/services.dart';

import '../../../core/theme/semantic_colors.dart';
import '../../../core/i18n/t.dart';
import '../bloc/contact_bloc.dart';
import '../../../core/utils/animation_budget.dart';

/// Contact Screen — mirrors web contact.ts
/// GAP-M4 FIX: Contact form with category picker + Platinum BLoC integration.
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

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _subjectCtrl.dispose();
    _messageCtrl.dispose();
    super.dispose();
  }

  void _submit(BuildContext context) {
    HapticFeedback.mediumImpact();
    if (!_formKey.currentState!.validate()) return;
    
    // Add the category to the subject or message since the API currently takes subject/message
    final subjectWithCategory = '[$_category] ${_subjectCtrl.text.trim()}';
    
    context.read<ContactBloc>().add(
      SubmitContactForm(
        name: _nameCtrl.text.trim(),
        email: _emailCtrl.text.trim(),
        subject: subjectWithCategory,
        message: _messageCtrl.text.trim(),
      )
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    
    return BlocProvider(
      create: (_) => ContactBloc(),
      child: Scaffold(
        backgroundColor: colors.backgroundPrimary,
        appBar: AppBar(
          title: Text(context.tr('contact_us'), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.textPrimary)),
          backgroundColor: colors.backgroundPrimary, elevation: 0,
          iconTheme: IconThemeData(color: colors.textPrimary),
        ),
        body: SafeArea(
          child: BlocConsumer<ContactBloc, ContactState>(
            listener: (context, state) {
              if (state.error != null) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text(state.error!), backgroundColor: colors.error)
                );
              }
            },
            builder: (context, state) {
              return SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: state.isSuccess ? _successView(colors, context) : _formView(colors, context, state),
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _formView(SemanticColors colors, BuildContext context, ContactState state) {
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
            Icon(PhosphorIconsRegular.chatCircle, color: Colors.white, size: 40),
            const SizedBox(height: 10),
            Text(context.tr('we_are_here_to_help'), style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white)),
            const SizedBox(height: 4),
            Text(context.tr('contact_response_time'), style: TextStyle(fontSize: 13, color: Colors.white.withAlpha(200))),
          ]),
        ).nmAnimate(context).fadeIn(duration: 400.ms),
        const SizedBox(height: 24),
        // Category
        DropdownButtonFormField<String>(
          initialValue: _category,
          dropdownColor: colors.surfaceElevated,
          style: TextStyle(color: colors.textPrimary, fontSize: 14),
          decoration: _inputDecor(colors, context.tr('category')),
          items: [
            DropdownMenuItem(value: 'general', child: Text(context.tr('contact_cat_general'))),
            DropdownMenuItem(value: 'technical', child: Text(context.tr('contact_cat_technical'))),
            DropdownMenuItem(value: 'financial', child: Text(context.tr('contact_cat_financial'))),
            DropdownMenuItem(value: 'partnership', child: Text(context.tr('contact_cat_partnership'))),
            DropdownMenuItem(value: 'complaint', child: Text(context.tr('contact_cat_complaint'))),
          ],
          onChanged: (v) {
            if (v != null) {
              _category = v;
            }
          },
        ),
        const SizedBox(height: 14),
        TextFormField(controller: _nameCtrl, style: TextStyle(color: colors.textPrimary), textInputAction: TextInputAction.next,
          decoration: _inputDecor(colors, context.tr('contact_full_name')),
          validator: (v) => v == null || v.trim().isEmpty ? context.tr('required_2') : null),
        const SizedBox(height: 14),
        TextFormField(controller: _emailCtrl, keyboardType: TextInputType.emailAddress, textInputAction: TextInputAction.next,
          textDirection: TextDirection.ltr, style: TextStyle(color: colors.textPrimary),
          decoration: _inputDecor(colors, context.tr('contact_email')),
          validator: (v) {
            if (v == null || v.trim().isEmpty) return context.tr('required_2');
            if (!v.contains('@')) return context.tr('contact_invalid_email');
            return null;
          }),
        const SizedBox(height: 14),
        TextFormField(controller: _subjectCtrl, style: TextStyle(color: colors.textPrimary), textInputAction: TextInputAction.next,
          decoration: _inputDecor(colors, context.tr('contact_subject')),
          validator: (v) => v == null || v.trim().isEmpty ? context.tr('required_2') : null),
        const SizedBox(height: 14),
        TextFormField(controller: _messageCtrl, maxLines: 5, style: TextStyle(color: colors.textPrimary), textInputAction: TextInputAction.done,
          decoration: _inputDecor(colors, context.tr('contact_message')),
          validator: (v) {
            if (v == null || v.trim().isEmpty) return context.tr('required_2');
            if (v.trim().length < 10) return context.tr('contact_msg_too_short');
            return null;
          }),
        const SizedBox(height: 24),
        ElevatedButton(
          onPressed: state.isSubmitting ? null : () => _submit(context),
          style: ElevatedButton.styleFrom(backgroundColor: colors.primaryBrand, foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
          child: state.isSubmitting
              ? SizedBox(width: 20, height: 20, child: NammerhaShimmerLoader(colors: colors))
              : Text(context.tr('send_btn'), style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15)),
        ),
      ]),
    );
  }

  Widget _successView(SemanticColors colors, BuildContext context) {
    return Column(children: [
      const SizedBox(height: 60),
      Container(width: 80, height: 80,
        decoration: BoxDecoration(color: colors.success.withAlpha(20), shape: BoxShape.circle),
        child: Icon(PhosphorIconsRegular.checkCircle, size: 48, color: colors.success),
      ).nmAnimate(context).scale(duration: 400.ms, curve: Curves.elasticOut),
      const SizedBox(height: 24),
      Text(context.tr('contact_sent_success'), style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: colors.textPrimary)).nmAnimate(context, delay: 200.ms).fadeIn(),
      const SizedBox(height: 8),
      Text(context.tr('contact_will_reply'), style: TextStyle(fontSize: 14, color: colors.textSecondary)).nmAnimate(context, delay: 300.ms).fadeIn(),
      const SizedBox(height: 32),
      ElevatedButton(onPressed: () => Navigator.pop(context),
        style: ElevatedButton.styleFrom(backgroundColor: colors.primaryBrand, foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
        child: Text(context.tr('back_btn'), style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
      ).nmAnimate(context, delay: 400.ms).fadeIn(),
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
