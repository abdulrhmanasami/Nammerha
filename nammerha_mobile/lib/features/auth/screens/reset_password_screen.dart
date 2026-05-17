import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/gradient_button.dart';
import '../bloc/auth_bloc.dart';
import '../bloc/reset_password_form_cubit.dart';
import '../../../core/i18n/t.dart';
import '../../../core/utils/animation_budget.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Password Reset Screen — Platinum Standard (Absolute Zero setState)
/// ═══════════════════════════════════════════════════════════════════════════
/// All UI state managed via ResetPasswordFormCubit + AuthBloc.
/// Zero setState calls in this file.
///
/// Flow:
///   1. User taps "Forgot Password" → receives email with reset link
///   2. Deep link opens this screen with the token
///   3. User enters new password (with strength validation)
///   4. AuthBloc.add(AuthResetPassword(token, newPassword))
///   5. On success → navigates back to login
/// ═══════════════════════════════════════════════════════════════════════════
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
  }

  @override
  void dispose() {
    _passwordController.dispose();
    _confirmController.dispose();
    _animController.dispose();
    super.dispose();
  }

  Color _strengthColor(SemanticColors colors, double strength) {
    if (strength < 0.3) return colors.error;
    if (strength < 0.6) return colors.warning;
    if (strength < 0.85) return colors.info;
    return colors.success;
  }

  String _strengthLabel(double strength) {
    if (strength < 0.3) return context.tr('pw_strength_weak');
    if (strength < 0.6) return context.tr('pw_strength_good');
    if (strength < 0.85) return context.tr('password_good');
    return context.tr('pw_strength_strong');
  }

  void _submit(BuildContext context) {
    if (!_formKey.currentState!.validate()) return;

    context.read<ResetPasswordFormCubit>().setSubmitting();
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

    return BlocProvider(
      create: (_) => ResetPasswordFormCubit(),
      child: BlocListener<AuthBloc, AuthState>(
        listener: (context, state) {
          if (state is AuthPasswordResetSuccess) {
            context.read<ResetPasswordFormCubit>().setSuccess();
          } else if (state is AuthError) {
            context.read<ResetPasswordFormCubit>().setError();
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
                child: BlocBuilder<ResetPasswordFormCubit, ResetPasswordFormState>(
                  builder: (context, formState) {
                    return formState.isSuccess
                        ? _buildSuccessView(context)
                        : _buildFormView(context, formState);
                  },
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildFormView(BuildContext context, ResetPasswordFormState formState) {
    final colors = context.colors;
    final strength = formState.passwordStrength;

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
            context.tr('pw_reset_title'),
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: colors.textPrimary,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            context.tr('pw_reset_subtitle'),
            style: TextStyle(fontSize: 14, color: colors.textSecondary),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 32),

          // New Password
          TextFormField(
            controller: _passwordController,
            obscureText: formState.obscurePassword,
            textDirection: TextDirection.ltr,
            style: TextStyle(color: colors.textPrimary),
            onChanged: (value) =>
                context.read<ResetPasswordFormCubit>().updateStrength(value),
            decoration: InputDecoration(
              labelText: context.tr('pw_new_label'),
              labelStyle: TextStyle(color: colors.textSecondary),
              prefixIcon: Icon(PhosphorIconsRegular.lockKey, color: colors.textSecondary),
              suffixIcon: IconButton(
                icon: Icon(
                  formState.obscurePassword
                      ? PhosphorIconsRegular.eyeSlash
                      : PhosphorIconsRegular.eye,
                  color: colors.textSecondary,
                ),
                onPressed: () => context
                    .read<ResetPasswordFormCubit>()
                    .togglePasswordVisibility(),
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
              if (v == null || v.isEmpty) return context.tr('pw_required');
              if (v.length < 8) return context.tr('pw_min_length');
              if (!RegExp(r'[A-Z]').hasMatch(v)) return context.tr('pw_needs_upper');
              if (!RegExp(r'[a-z]').hasMatch(v)) return context.tr('pw_needs_lower');
              if (!RegExp(r'[0-9]').hasMatch(v)) return context.tr('pw_needs_digit');
              if (!RegExp(r'[^A-Za-z0-9]').hasMatch(v)) return context.tr('pw_needs_special');
              return null;
            },
          ),
          const SizedBox(height: 8),

          // Password Strength Meter
          if (_passwordController.text.isNotEmpty) ...[
            Row(
              children: [
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: strength,
                      backgroundColor: colors.backgroundSecondary,
                      valueColor: AlwaysStoppedAnimation<Color>(
                          _strengthColor(colors, strength)),
                      minHeight: 4,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  _strengthLabel(strength),
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: _strengthColor(colors, strength),
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
            obscureText: formState.obscureConfirm,
            textDirection: TextDirection.ltr,
            style: TextStyle(color: colors.textPrimary),
            decoration: InputDecoration(
              labelText: context.tr('pw_confirm_label'),
              labelStyle: TextStyle(color: colors.textSecondary),
              prefixIcon:
                  Icon(PhosphorIconsRegular.lockKey, color: colors.textSecondary),
              suffixIcon: IconButton(
                icon: Icon(
                  formState.obscureConfirm
                      ? PhosphorIconsRegular.eyeSlash
                      : PhosphorIconsRegular.eye,
                  color: colors.textSecondary,
                ),
                onPressed: () => context
                    .read<ResetPasswordFormCubit>()
                    .toggleConfirmVisibility(),
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
              if (v == null || v.isEmpty) return context.tr('pw_confirm_required');
              if (v != _passwordController.text) {
                return context.tr('pw_mismatch');
              }
              return null;
            },
          ),
          const SizedBox(height: 28),

          // Submit
          GradientButton(
            label: context.tr('pw_submit_btn'),
            icon: PhosphorIconsRegular.lockKey,
            isLoading: formState.isSubmitting,
            onPressed: () => _submit(context),
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
          child: Icon(PhosphorIconsRegular.checkCircle, size: 48, color: colors.success),
        ).nmAnimate(context).scale(duration: 400.ms, curve: Curves.elasticOut),
        const SizedBox(height: 24),
        Text(
          context.tr('pw_success_title'),
          style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w800,
            color: colors.textPrimary,
          ),
          textAlign: TextAlign.center,
        ).nmAnimate(context, delay: 200.ms).fadeIn(),
        const SizedBox(height: 12),
        Text(
          context.tr('pw_success_subtitle'),
          style: TextStyle(fontSize: 14, color: colors.textSecondary),
          textAlign: TextAlign.center,
        ).nmAnimate(context, delay: 300.ms).fadeIn(),
        const SizedBox(height: 32),
        ElevatedButton(
          onPressed: () => Navigator.pop(context),
          style: ElevatedButton.styleFrom(
            backgroundColor: colors.primaryBrand,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          child: Text(
            context.tr('back_to_login'),
            style: TextStyle(
                color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15),
          ),
        ).nmAnimate(context, delay: 400.ms).fadeIn().slideY(begin: 0.1),
      ],
    );
  }
}
