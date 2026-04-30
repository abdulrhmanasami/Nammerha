import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/gradient_button.dart';
import '../bloc/auth_bloc.dart';
import '../../../core/i18n/t.dart';

/// Password Reset Screen — handles deep-link token from email.
///
/// GAP-H5 FIX: Mobile previously only had the "Forgot Password" dialog
/// which sends the email. This screen processes the actual reset token
/// received via deep-link (nammerha://reset-password?token=xxx).
///
/// Flow:
///   1. User taps "Forgot Password" → receives email with reset link
///   2. Deep link opens this screen with the token
///   3. User enters new password (with strength validation)
///   4. AuthBloc.add(AuthResetPassword(token, newPassword))
///   5. On success → navigates back to login
class ResetPasswordScreen extends StatefulWidget {
  final String token;

  const ResetPasswordScreen({super.key, required this.token});

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen>
    with SingleTickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();

  bool _obscurePassword = true;
  bool _obscureConfirm = true;
  bool _isSubmitting = false;
  bool _isSuccess = false;
  double _passwordStrength = 0;

  late AnimationController _animController;
  late Animation<double> _fadeIn;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _fadeIn = CurvedAnimation(parent: _animController, curve: Curves.easeOut);
    _animController.forward();

    _passwordController.addListener(_updateStrength);
  }

  @override
  void dispose() {
    _passwordController.removeListener(_updateStrength);
    _passwordController.dispose();
    _confirmController.dispose();
    _animController.dispose();
    super.dispose();
  }

  void _updateStrength() {
    final pw = _passwordController.text;
    double strength = 0;
    if (pw.length >= 8) strength += 0.2;
    if (pw.length >= 12) strength += 0.1;
    if (RegExp(r'[A-Z]').hasMatch(pw)) strength += 0.2;
    if (RegExp(r'[a-z]').hasMatch(pw)) strength += 0.15;
    if (RegExp(r'[0-9]').hasMatch(pw)) strength += 0.15;
    if (RegExp(r'[^A-Za-z0-9]').hasMatch(pw)) strength += 0.2;
    setState(() => _passwordStrength = strength.clamp(0.0, 1.0));
  }

  Color _strengthColor(BuildContext context) {
    final colors = context.colors;
    if (_passwordStrength < 0.3) return colors.error;
    if (_passwordStrength < 0.6) return colors.warning;
    if (_passwordStrength < 0.85) return colors.info;
    return colors.success;
  }

  String _strengthLabel() {
    if (_passwordStrength < 0.3) return 'ضعيفة جداً';
    if (_passwordStrength < 0.6) return context.tr('pw_strength_good');
    if (_passwordStrength < 0.85) return context.tr('str_5edbdc1c');
    return 'قوية جداً ✓';
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSubmitting = true);
    context.read<AuthBloc>().add(
          AuthResetPassword(
            token: widget.token,
            newPassword: _passwordController.text,
          ),
        );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return BlocListener<AuthBloc, AuthState>(
      listener: (context, state) {
        if (state is AuthPasswordResetSuccess) {
          setState(() {
            _isSubmitting = false;
            _isSuccess = true;
          });
        } else if (state is AuthError) {
          setState(() => _isSubmitting = false);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(state.message),
              backgroundColor: colors.error,
            ),
          );
        }
      },
      child: Scaffold(
        backgroundColor: colors.backgroundPrimary,
        appBar: AppBar(
          backgroundColor: colors.backgroundPrimary,
          elevation: 0,
          iconTheme: IconThemeData(color: colors.textPrimary),
        ),
        body: SafeArea(
          child: FadeTransition(
            opacity: _fadeIn,
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: _isSuccess ? _buildSuccessView(context) : _buildFormView(context),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildFormView(BuildContext context) {
    final colors = context.colors;

    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 20),

          // Logo
          Center(
            child: SvgPicture.asset(
              Theme.of(context).brightness == Brightness.dark
                  ? 'assets/brand/Nammerha_logo_Full_dark.svg'
                  : 'assets/brand/Nammerha_logo_Full.svg',
              width: 160,
              height: 60,
            ),
          ),
          const SizedBox(height: 24),

          // Title
          Text(
            'إعادة تعيين كلمة المرور',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: colors.textPrimary,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            'أدخل كلمة المرور الجديدة لحسابك',
            style: TextStyle(fontSize: 14, color: colors.textSecondary),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 32),

          // New Password
          TextFormField(
            controller: _passwordController,
            obscureText: _obscurePassword,
            textDirection: TextDirection.ltr,
            style: TextStyle(color: colors.textPrimary),
            decoration: InputDecoration(
              labelText: 'كلمة المرور الجديدة',
              labelStyle: TextStyle(color: colors.textSecondary),
              prefixIcon: Icon(Icons.lock_rounded, color: colors.textSecondary),
              suffixIcon: IconButton(
                icon: Icon(
                  _obscurePassword ? Icons.visibility_off : Icons.visibility,
                  color: colors.textSecondary,
                ),
                onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
              ),
              filled: true,
              fillColor: colors.surfaceElevated,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: colors.strokeSubtle),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: colors.strokeSubtle),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: colors.primaryBrand, width: 2),
              ),
              errorBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: colors.error),
              ),
            ),
            validator: (v) {
              if (v == null || v.isEmpty) return 'كلمة المرور مطلوبة';
              if (v.length < 8) return 'يجب أن تكون 8 أحرف على الأقل';
              if (!RegExp(r'[A-Z]').hasMatch(v)) return 'يجب أن تحتوي على حرف كبير';
              if (!RegExp(r'[a-z]').hasMatch(v)) return 'يجب أن تحتوي على حرف صغير';
              if (!RegExp(r'[0-9]').hasMatch(v)) return 'يجب أن تحتوي على رقم';
              if (!RegExp(r'[^A-Za-z0-9]').hasMatch(v)) return 'يجب أن تحتوي على رمز خاص';
              return null;
            },
          ),
          const SizedBox(height: 8),

          // Password Strength Meter (GAP-M7 bonus fix)
          if (_passwordController.text.isNotEmpty) ...[
            Row(
              children: [
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: _passwordStrength,
                      backgroundColor: colors.backgroundSecondary,
                      valueColor: AlwaysStoppedAnimation<Color>(_strengthColor(context)),
                      minHeight: 4,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  _strengthLabel(),
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: _strengthColor(context),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
          ],
          const SizedBox(height: 8),

          // Confirm Password
          TextFormField(
            controller: _confirmController,
            obscureText: _obscureConfirm,
            textDirection: TextDirection.ltr,
            style: TextStyle(color: colors.textPrimary),
            decoration: InputDecoration(
              labelText: 'تأكيد كلمة المرور',
              labelStyle: TextStyle(color: colors.textSecondary),
              prefixIcon: Icon(Icons.lock_outline_rounded, color: colors.textSecondary),
              suffixIcon: IconButton(
                icon: Icon(
                  _obscureConfirm ? Icons.visibility_off : Icons.visibility,
                  color: colors.textSecondary,
                ),
                onPressed: () => setState(() => _obscureConfirm = !_obscureConfirm),
              ),
              filled: true,
              fillColor: colors.surfaceElevated,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: colors.strokeSubtle),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: colors.strokeSubtle),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: colors.primaryBrand, width: 2),
              ),
              errorBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: colors.error),
              ),
            ),
            validator: (v) {
              if (v == null || v.isEmpty) return 'تأكيد كلمة المرور مطلوب';
              if (v != _passwordController.text) return 'كلمتا المرور غير متطابقتين';
              return null;
            },
          ),
          const SizedBox(height: 28),

          // Submit
          GradientButton(
            label: 'تعيين كلمة المرور الجديدة',
            icon: Icons.lock_reset_rounded,
            isLoading: _isSubmitting,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }

  Widget _buildSuccessView(BuildContext context) {
    final colors = context.colors;

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const SizedBox(height: 60),
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            color: colors.success.withAlpha(20),
            shape: BoxShape.circle,
          ),
          child: Icon(Icons.check_circle_rounded, size: 48, color: colors.success),
        ).animate().scale(duration: 400.ms, curve: Curves.elasticOut),
        const SizedBox(height: 24),
        Text(
          'تم تغيير كلمة المرور بنجاح!',
          style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w800,
            color: colors.textPrimary,
          ),
          textAlign: TextAlign.center,
        ).animate(delay: 200.ms).fadeIn(),
        const SizedBox(height: 12),
        Text(
          'يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة',
          style: TextStyle(fontSize: 14, color: colors.textSecondary),
          textAlign: TextAlign.center,
        ).animate(delay: 300.ms).fadeIn(),
        const SizedBox(height: 32),
        ElevatedButton(
          onPressed: () => Navigator.pop(context),
          style: ElevatedButton.styleFrom(
            backgroundColor: colors.primaryBrand,
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          child: const Text(
            'العودة لتسجيل الدخول',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15),
          ),
        ).animate(delay: 400.ms).fadeIn().slideY(begin: 0.1),
      ],
    );
  }
}
