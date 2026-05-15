import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/gradient_button.dart';
import '../../../core/network/api_client.dart'; // ApiException
import '../../../core/services/social_auth_service.dart';
import 'register_wizard_screen.dart';
import '../bloc/auth_bloc.dart';
import '../bloc/login_form_cubit.dart';
import '../widgets/password_strength_indicator.dart';
import '../../../core/i18n/t.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Login Screen — Platinum Standard (Absolute Zero setState)
/// ═══════════════════════════════════════════════════════════════════════════
/// All UI state managed via LoginFormCubit + AuthBloc.
/// Zero setState calls in this file.
/// ═══════════════════════════════════════════════════════════════════════════
class LoginScreen extends StatefulWidget {
  final VoidCallback onLoginSuccess;

  const LoginScreen({super.key, required this.onLoginSuccess});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with SingleTickerProviderStateMixin {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController(); // C4 FIX: Confirm password
  final _nameController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  late AnimationController _animController;
  late Animation<double> _fadeIn;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(vsync: this, duration: const Duration(milliseconds: 800));
    _fadeIn = CurvedAnimation(parent: _animController, curve: Curves.easeOut);
    _animController.forward();
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose(); // C4 FIX: Dispose confirm password controller
    _nameController.dispose();
    _animController.dispose();
    super.dispose();
  }

  void _submit(bool isLoginMode, bool termsAccepted) {
    if (!_formKey.currentState!.validate()) return;

    // C4 FIX: Validate confirm password match in registration mode.
    if (!isLoginMode) {
      if (_passwordController.text != _confirmPasswordController.text) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.tr('auth_pw_mismatch')),
            backgroundColor: context.colors.error,
          ),
        );
        return;
      }

      // C5 FIX: Validate Terms & Privacy acceptance (GDPR Art. 7).
      if (!termsAccepted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.tr('auth_terms_required')),
            backgroundColor: context.colors.error,
          ),
        );
        return;
      }
    }

    final authBloc = context.read<AuthBloc>();

    if (isLoginMode) {
      authBloc.add(AuthLoginRequested(
        email: _emailController.text.trim(),
        password: _passwordController.text,
      ));
    } else {
      authBloc.add(AuthRegisterRequested(
        email: _emailController.text.trim(),
        password: _passwordController.text,
        fullName: _nameController.text.trim(),
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return BlocProvider(
      create: (_) => LoginFormCubit(),
      child: BlocListener<AuthBloc, AuthState>(
        listener: (context, state) {
          if (state is AuthAuthenticated) {
            widget.onLoginSuccess();
          } else if (state is AuthRegistrationSuccess) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: colors.success,
                duration: const Duration(seconds: 5),
              ),
            );
            context.read<LoginFormCubit>().switchToLoginMode();
          } else if (state is AuthEmailNotVerified) {
            // Show persistent verification banner with resend action
            ScaffoldMessenger.of(context).clearSnackBars();
            _showVerificationBanner(context, state.email, state.message);
          } else if (state is AuthError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: colors.error,
              ),
            );
          // UX-F026 FIX: Forgot password confirmation — await backend before feedback.
          // PREVIOUS: Success snackbar shown BEFORE API response (false positive).
          // NOW: BLoC emits AuthPasswordResetSent after backend confirms.
          } else if (state is AuthPasswordResetSent) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(context.tr('auth_reset_link_sent')),
                backgroundColor: colors.success,
                duration: const Duration(seconds: 5),
              ),
            );
          }
        },
        child: Scaffold(
          backgroundColor: colors.backgroundPrimary,
          body: SafeArea(
            child: FadeTransition(
              opacity: _fadeIn,
              child: BlocBuilder<LoginFormCubit, LoginFormState>(
                builder: (context, formState) {
                  return RefreshIndicator(
                    onRefresh: () async {
                      context.read<AuthBloc>().add(AuthCheckSession());
                      await Future.delayed(const Duration(milliseconds: 500));
                    },
                    color: colors.primaryBrand,
                    child: SingleChildScrollView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const SizedBox(height: 40),

                          // Logo — real Nammerha SVG from web platform compliant with Dark Mode WCAG standards
                          Center(
                            child: SvgPicture.asset(
                              Theme.of(context).brightness == Brightness.dark
                                  ? 'assets/brand/Nammerha_logo_Full_dark.svg'
                                  : 'assets/brand/Nammerha_logo_Full.svg',
                              width: 200,
                              height: 80,
                            ),
                          ),
                          const SizedBox(height: 20),
                          Text(
                            context.tr('nammerha_brand'),
                            style: TextStyle(
                              fontSize: 32,
                              fontWeight: FontWeight.w900,
                              color: colors.textPrimary,
                            ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            formState.isLoginMode
                                ? context.tr('auth_login_subtitle')
                                : context.tr('auth_register_subtitle'),
                            style: TextStyle(fontSize: 16, color: colors.textSecondary),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 36),

                          // Full Name (register only)
                          if (!formState.isLoginMode) ...[
                            _buildTextField(
                              controller: _nameController,
                              label: context.tr('auth_full_name'),
                              icon: PhosphorIconsRegular.user,
                              validator: (v) {
                                if (v == null || v.trim().isEmpty) return context.tr('auth_name_required');
                                if (v.trim().length < 3) return context.tr('auth_name_min_length');
                                return null;
                              },
                            ),
                            const SizedBox(height: 16),
                          ],

                          // Email
                          _buildTextField(
                            controller: _emailController,
                            label: context.tr('auth_email_label'),
                            icon: PhosphorIconsRegular.envelope,
                            keyboardType: TextInputType.emailAddress,
                            validator: (v) {
                              if (v == null || v.trim().isEmpty) return context.tr('auth_email_required');
                              if (!RegExp(r'^[^@]+@[^@]+\.[^@]+$').hasMatch(v.trim())) {
                                return context.tr('auth_email_invalid');
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 16),

                          // Password
                          _buildTextField(
                            controller: _passwordController,
                            label: context.tr('auth_password_label'),
                            icon: PhosphorIconsRegular.lockKey,
                            obscureText: formState.obscurePassword,
                            suffixIcon: IconButton(
                              icon: Icon(
                                formState.obscurePassword ? PhosphorIconsRegular.eyeSlash : PhosphorIconsRegular.eye,
                                color: colors.textSecondary,
                              ),
                              onPressed: () => context.read<LoginFormCubit>().togglePasswordVisibility(),
                            ),
                            validator: (v) {
                              if (v == null || v.isEmpty) return context.tr('auth_password_required');
                              if (!formState.isLoginMode) {
                                if (v.length < 8) return context.tr('auth_password_min_length');
                                if (v.length > 128) return context.tr('auth_password_max_length');
                                if (!RegExp(r'[A-Z]').hasMatch(v)) return context.tr('auth_password_uppercase');
                                if (!RegExp(r'[a-z]').hasMatch(v)) return context.tr('auth_password_lowercase');
                                if (!RegExp(r'[0-9]').hasMatch(v)) return context.tr('auth_password_digit');
                                if (!RegExp(r'[^A-Za-z0-9]').hasMatch(v)) return context.tr('auth_password_special');
                              }
                              return null;
                            },
                          ),

                          // C4 FIX: Confirm Password (register only)
                          // Mirrors web's reg-password-confirm field.
                          // Without this, users could register with a typo in their
                          // password and be permanently locked out.
                          if (!formState.isLoginMode) ...[
                            ListenableBuilder(
                              listenable: _passwordController,
                              builder: (context, _) => PasswordStrengthIndicator(
                                password: _passwordController.text,
                              ),
                            ),
                            const SizedBox(height: 8),
                            _buildTextField(
                              controller: _confirmPasswordController,
                              label: context.tr('auth_confirm_password'),
                              icon: PhosphorIconsRegular.lockKey,
                              obscureText: formState.obscureConfirmPassword,
                              suffixIcon: IconButton(
                                icon: Icon(
                                  formState.obscureConfirmPassword ? PhosphorIconsRegular.eyeSlash : PhosphorIconsRegular.eye,
                                  color: colors.textSecondary,
                                ),
                                onPressed: () => context.read<LoginFormCubit>().toggleConfirmPasswordVisibility(),
                              ),
                              validator: (v) {
                                if (v == null || v.isEmpty) return context.tr('auth_confirm_password_required');
                                if (v != _passwordController.text) return context.tr('auth_pw_mismatch');
                                return null;
                              },
                            ),
                          ],

                          // Forgot Password
                          if (formState.isLoginMode) ...[
                            // P1-003 FIX: Physical Alignment.centerLeft → Logical AlignmentDirectional.centerStart
                          // Physical alignment breaks RTL — Forgot Password link renders on wrong side.
                          Align(
                              alignment: AlignmentDirectional.centerStart,
                              child: TextButton(
                                onPressed: () => _showForgotPasswordDialog(),
                                child: Text(
                                  context.tr('auth_forgot_password'),
                                  style: TextStyle(color: colors.primaryBrand, fontSize: 14),
                                ),
                              ),
                            ),
                          ],

                          // UNIFIED CITIZEN: Role selector removed.
                          // All users get all roles automatically.
                          // Terms & Privacy only shown during registration.
                          if (!formState.isLoginMode) ...[
                            // C5 FIX: Terms & Privacy acceptance (GDPR Art. 7).
                            // Mirrors web's Step 3 consent checkbox.
                            // Without this, registration on mobile lacks legally
                            // required consent capture.
                            const SizedBox(height: 20),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                SizedBox(
                                  width: 24,
                                  height: 24,
                                  child: Checkbox(
                                    value: formState.termsAccepted,
                                    onChanged: (_) => context.read<LoginFormCubit>().toggleTerms(),
                                    activeColor: colors.primaryBrand,
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: GestureDetector(
                                    onTap: () => context.read<LoginFormCubit>().toggleTerms(),
                                    child: Text(
                                      context.tr('auth_terms_text'),
                                      style: TextStyle(
                                        fontSize: 13,
                                        color: colors.textSecondary,
                                        height: 1.4,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],

                          const SizedBox(height: 28),

                          // Submit Button
                          BlocBuilder<AuthBloc, AuthState>(
                            builder: (context, state) {
                              return GradientButton(
                                label: formState.isLoginMode
                                    ? context.tr('auth_sign_in_btn')
                                    : context.tr('auth_create_account_btn'),
                                // UX-F001 FIX: Register button uses userPlus (was warningCircle placeholder).
                                icon: formState.isLoginMode ? PhosphorIconsRegular.signIn : PhosphorIconsRegular.userPlus,
                                isLoading: state is AuthLoading,
                                onPressed: () => _submit(
                                  formState.isLoginMode,
                                  formState.termsAccepted,
                                ),
                              );
                            },
                          ),

                          const SizedBox(height: 20),

                          // ─── Social OAuth Divider + Buttons ──────────────
                          _buildSocialDivider(),
                          const SizedBox(height: 12),
                          _buildSocialButtons(),
                          const SizedBox(height: 20),

                          // Toggle Login/Register
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                context.tr('auth_no_account'),
                                style: TextStyle(color: colors.textSecondary),
                              ),
                              TextButton(
                                onPressed: () {
                                  Navigator.push(context, MaterialPageRoute(builder: (_) => const RegisterWizardScreen()));
                                },
                                child: Text(
                                  context.tr('auth_create_account_link'),
                                  style: TextStyle(
                                    color: colors.primaryBrand,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 40),
                        ],
                      ),
                    ),
                    ),
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required IconData icon,
    TextInputType keyboardType = TextInputType.text,
    bool obscureText = false,
    Widget? suffixIcon,
    String? Function(String?)? validator,
  }) {
    final colors = context.colors;
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      obscureText: obscureText,
      validator: validator,
      textDirection: TextDirection.ltr,
      style: TextStyle(color: colors.textPrimary),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: TextStyle(color: colors.textSecondary),
        prefixIcon: Icon(icon, color: colors.textSecondary),
        suffixIcon: suffixIcon,
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
    );
  }

  // UNIFIED CITIZEN: _buildRoleSelector removed — roles are auto-granted.

  // P1-004 FIX: Forgot password dialog TextEditingController memory leak.
  // Previous: controller created inside _showForgotPasswordDialog was NEVER disposed.
  // Now: controller is disposed when the dialog closes via .then() callback.
  void _showForgotPasswordDialog() {
    final emailController = TextEditingController(text: _emailController.text);
    final colors = context.colors;

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surfaceElevated,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(context.tr('auth_forgot_password'), style: TextStyle(color: colors.textPrimary)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              context.tr('auth_forgot_password_desc'),
              style: TextStyle(color: colors.textSecondary, fontSize: 14),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: emailController,
              keyboardType: TextInputType.emailAddress,
              textDirection: TextDirection.ltr,
              decoration: InputDecoration(
                hintText: 'example@email.com',
                prefixIcon: Icon(PhosphorIconsRegular.envelope, color: colors.textSecondary),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(context.tr('cancel'), style: TextStyle(color: colors.textSecondary)),
          ),
          ElevatedButton(
            onPressed: () {
              if (emailController.text.trim().isNotEmpty) {
                context.read<AuthBloc>().add(AuthForgotPassword(emailController.text.trim()));
                Navigator.pop(ctx);
                // UX-F026 FIX: REMOVED premature success snackbar.
                // PREVIOUS: Showed 'Link sent ✓' BEFORE backend confirmed.
                // NOW: BLocListener handles AuthPasswordResetSent (success)
                // and AuthError (failure) — user sees accurate feedback only.
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: colors.primaryBrand,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: Text(context.tr('auth_send_btn'), style: const TextStyle(color: Colors.white)),
          ),
        ],
      ),
    ).then((_) => emailController.dispose()); // P1-004: Dispose on dialog close
  }

  /// Shows a persistent MaterialBanner for email verification errors.
  /// Includes a "Resend verification" action button so the user can
  /// request a new verification link without leaving the login screen.
  void _showVerificationBanner(BuildContext context, String email, String message) {
    final colors = context.colors;

    ScaffoldMessenger.of(context).showMaterialBanner(
      MaterialBanner(
        backgroundColor: colors.warningLight,
        leading: Icon(PhosphorIconsRegular.warningCircle, color: colors.warning, size: 28),
        content: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              message,
              style: TextStyle(
                color: colors.textPrimary,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              email,
              style: TextStyle(
                color: colors.textSecondary,
                fontSize: 13,
              ),
              textDirection: TextDirection.ltr,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              ScaffoldMessenger.of(context).hideCurrentMaterialBanner();
            },
            // UX-F003 FIX: Hardcoded Arabic 'حسناً' → i18n
            child: Text(
              context.tr('ok'),
              style: TextStyle(color: colors.textSecondary),
            ),
          ),
          TextButton(
            onPressed: () async {
              ScaffoldMessenger.of(context).hideCurrentMaterialBanner();
              try {
                final authRepo = context.read<AuthBloc>().authRepository;
                final resultMessage = await authRepo.resendVerification(email: email);
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(resultMessage),
                      backgroundColor: colors.success,
                      duration: const Duration(seconds: 4),
                    ),
                  );
                }
              } on ApiException catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(e.message),
                      backgroundColor: colors.error,
                      duration: const Duration(seconds: 4),
                    ),
                  );
                }
              } catch (e) {
                if (context.mounted) {
                  // UX-F004 FIX: Hardcoded Arabic error → i18n
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(context.tr('auth_resend_verify_failed')),
                      backgroundColor: colors.error,
                      duration: const Duration(seconds: 4),
                    ),
                  );
                }
              }
            },
            // UX-F005 FIX: Hardcoded Arabic → i18n
            child: Text(
              context.tr('auth_resend_verify_link'),
              style: TextStyle(
                color: colors.primaryBrand,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ═══ Social OAuth Buttons ═══════════════════════════════════════════════
  // OAuth-001: Branded social login buttons for Google, Apple, Facebook.
  // Each triggers the native SDK flow → obtains ID token → dispatches
  // AuthSocialLoginRequested to the BLoC.
  // ═══════════════════════════════════════════════════════════════════════

  Widget _buildSocialDivider() {
    final colors = context.colors;
    return Row(
      children: [
        Expanded(child: Divider(color: colors.strokeSubtle, thickness: 1)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            context.tr('auth_social_divider'),
            style: TextStyle(
              fontSize: 13,
              color: colors.textSecondary,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        Expanded(child: Divider(color: colors.strokeSubtle, thickness: 1)),
      ],
    );
  }

  Widget _buildSocialButtons() {
    return Row(
      children: [
        Expanded(
          // UX-F001 FIX: warningCircle → googleLogo (Phosphor brand icon)
          child: _buildSocialButton(
            label: 'Google',
            icon: PhosphorIconsRegular.googleLogo,
            backgroundColor: Colors.white,
            foregroundColor: const Color(0xFF3C4043),
            borderColor: const Color(0xFFDADCE0),
            onPressed: () => _handleSocialLogin('google'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          // UX-F001 FIX: warningCircle → appleLogo (Phosphor brand icon)
          child: _buildSocialButton(
            label: 'Apple',
            icon: PhosphorIconsRegular.appleLogo,
            backgroundColor: Colors.black,
            foregroundColor: Colors.white,
            borderColor: Colors.black,
            onPressed: () => _handleSocialLogin('apple'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          // UX-F001 FIX: warningCircle → facebookLogo (Phosphor brand icon)
          child: _buildSocialButton(
            label: 'Facebook',
            icon: PhosphorIconsRegular.facebookLogo,
            backgroundColor: const Color(0xFF1877F2),
            foregroundColor: Colors.white,
            borderColor: const Color(0xFF1877F2),
            onPressed: () => _handleSocialLogin('facebook'),
          ),
        ),
      ],
    );
  }

  Widget _buildSocialButton({
    required String label,
    required IconData icon,
    required Color backgroundColor,
    required Color foregroundColor,
    required Color borderColor,
    required VoidCallback onPressed,
  }) {
    return Material(
      color: backgroundColor,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          height: 48,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: borderColor, width: 1.5),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 22, color: foregroundColor),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: foregroundColor,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Handle social login via native SDK → backend verification.
  /// OAuth-001: Real SDK integration for Google and Apple.
  /// Facebook: Coming soon (requires Meta App review).
  Future<void> _handleSocialLogin(String provider) async {
    try {
      final result = await SocialAuthService.instance.signIn(provider);

      // Dispatch to AuthBloc — backend verifies the ID token server-side
      if (mounted) {
        context.read<AuthBloc>().add(AuthSocialLoginRequested(
          provider: result.provider,
          idToken: result.idToken,
          fullName: result.fullName,
        ));
      }
    } on SocialAuthCancelledException {
      // User cancelled — no error message needed
      return;
    } on SocialAuthNotAvailableException catch (e) {
      if (mounted) {
        final providerNames = {'google': 'Google', 'apple': 'Apple', 'facebook': 'Facebook'};
        final displayName = providerNames[provider] ?? provider;

        // UX-F006 FIX: Hardcoded Arabic social auth errors → i18n
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              provider == 'facebook'
                  ? context.tr('auth_social_facebook_coming_soon')
                  : '${context.tr('auth_social_unavailable')} ($displayName): ${e.reason}',
            ),
            backgroundColor: context.colors.primaryBrand,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        // UX-F006 FIX: Hardcoded Arabic login failure → i18n
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${context.tr('auth_social_login_failed')}: ${e.toString()}'),
            backgroundColor: context.colors.error,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }
  }
}
