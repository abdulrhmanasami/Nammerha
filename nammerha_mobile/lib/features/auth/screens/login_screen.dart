import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/gradient_button.dart';
import '../../../core/widgets/bottom_sheet_grabber.dart';
import '../../../core/network/api_client.dart'; // ApiException
import '../../../core/services/social_auth_service.dart';
import 'register_wizard_screen.dart';
import '../bloc/auth_bloc.dart';
import '../bloc/login_form_cubit.dart';
import '../../../core/i18n/t.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Login Screen — Platinum Standard (Absolute Zero setState)
/// ═══════════════════════════════════════════════════════════════════════════
/// All UI state managed via LoginFormCubit + AuthBloc.
/// P1-AUD-009: _isSocialLoading migrated to LoginFormCubit.isSocialLoading.
/// P0-AUD-004: Forgot PW sheet stays open with spinner during API call.
/// TRUE Absolute Zero setState — zero setState calls in this file.
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
    _animController.dispose();
    super.dispose();
  }

  /// AUD-001 FIX: Login-only submit. Registration path removed — handled
  /// exclusively by RegisterWizardScreen (3-step wizard).
  /// W3-P1-008: Reads `rememberMe` from LoginFormCubit and passes to AuthBloc.
  void _submit() {
    if (!_formKey.currentState!.validate()) return;

    final rememberMe = context.read<LoginFormCubit>().state.rememberMe;
    context.read<AuthBloc>().add(AuthLoginRequested(
      email: _emailController.text.trim(),
      password: _passwordController.text,
      remember: rememberMe,
    ));
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
          } else if (state is AuthEmailNotVerified) {
            // Show persistent verification banner with resend action
            ScaffoldMessenger.of(context).clearSnackBars();
            _showVerificationBanner(context, state.email, state.message);
          } else if (state is AuthError) {
            // P0-AUD-004 FIX: If forgot-PW sheet is open, dismiss it first.
            final formCubit = context.read<LoginFormCubit>();
            if (formCubit.state.isForgotPwLoading) {
              formCubit.setForgotPwLoading(false);
              Navigator.of(context).pop(); // Dismiss the bottom sheet
            }
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: colors.error,
              ),
            );
          // UX-F026 FIX: Forgot password confirmation — await backend before feedback.
          // PREVIOUS: Success snackbar shown BEFORE API response (false positive).
          // NOW: BLoC emits AuthPasswordResetSent after backend confirms.
          // P0-AUD-004: Sheet dismissed here on SUCCESS, not on submit.
          } else if (state is AuthPasswordResetSent) {
            // P0-AUD-004 FIX: Dismiss the forgot-PW sheet with success feedback.
            final formCubit = context.read<LoginFormCubit>();
            if (formCubit.state.isForgotPwLoading) {
              formCubit.setForgotPwLoading(false);
              Navigator.of(context).pop(); // Dismiss the bottom sheet
            }
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
                  // AUD-004 FIX: Removed RefreshIndicator — PTR on login is
                  // semantically confusing (Nielsen #2). Users don't expect
                  // "pull to check session" on a login form.
                  return SingleChildScrollView(
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
                            context.tr('auth_login_subtitle'),
                            style: TextStyle(fontSize: 16, color: colors.textSecondary),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 36),

                          // Email
                          _buildTextField(
                            controller: _emailController,
                            label: context.tr('auth_email_label'),
                            icon: PhosphorIconsRegular.envelope,
                            keyboardType: TextInputType.emailAddress,
                            validator: (v) {
                              if (v == null || v.trim().isEmpty) return context.tr('auth_email_required');
                              if (!RegExp(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$').hasMatch(v.trim())) {
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
                              return null;
                            },
                          ),

                          // W3-P1-008: Remember Me checkbox
                          // Managed via LoginFormCubit (zero setState).
                          Row(
                            children: [
                              SizedBox(
                                width: 24,
                                height: 24,
                                child: Checkbox(
                                  value: formState.rememberMe,
                                  onChanged: (_) => context.read<LoginFormCubit>().toggleRememberMe(),
                                  activeColor: colors.primaryBrand,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  side: BorderSide(color: colors.strokeBorder),
                                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                  visualDensity: VisualDensity.compact,
                                ),
                              ),
                              const SizedBox(width: 8),
                              GestureDetector(
                                onTap: () => context.read<LoginFormCubit>().toggleRememberMe(),
                                child: Text(
                                  context.tr('remember_me'),
                                  style: TextStyle(
                                    color: colors.textSecondary,
                                    fontSize: 14,
                                  ),
                                ),
                              ),
                            ],
                          ),

                          // Forgot Password
                          // P2-UX-007 FIX: Tightened spacing.
                          // PREVIOUS: 28px gap between forgot password and submit
                          // → submit felt disconnected from the form.
                          // NOW: 20px gap — forgot password and submit are
                          // contextually linked auth actions.
                          // Standard: Gestalt proximity principle.
                          Align(
                            alignment: AlignmentDirectional.centerStart,
                            child: TextButton(
                              onPressed: () => _showForgotPasswordSheet(),
                              child: Text(
                                context.tr('auth_forgot_password'),
                                style: TextStyle(color: colors.primaryBrand, fontSize: 14),
                              ),
                            ),
                          ),

                          const SizedBox(height: 20),

                          // Submit Button
                          BlocBuilder<AuthBloc, AuthState>(
                            builder: (context, state) {
                              return GradientButton(
                                label: context.tr('auth_sign_in_btn'),
                                icon: PhosphorIconsRegular.signIn,
                                isLoading: state is AuthLoading,
                                onPressed: _submit,
                              );
                            },
                          ),

                          const SizedBox(height: 24),

                          // ─── Social OAuth Divider + Buttons ──────────────
                          _buildSocialDivider(),
                          const SizedBox(height: 16),
                          _buildSocialButtons(),
                          const SizedBox(height: 24),

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

  // ═══════════════════════════════════════════════════════════════════════════
  // P1-UX-007 FIX: Forgot Password — Themed Bottom Sheet
  // ═══════════════════════════════════════════════════════════════════════════
  // PREVIOUS: Raw AlertDialog — the ONLY modal in the entire app not using
  // the standard bottom sheet pattern. Visually foreign: no grabber, no
  // rounded top corners, no gradient CTA, basic input without themed borders.
  // Violates Nielsen #4 (Consistency and Standards).
  //
  // NOW: showModalBottomSheet with:
  //   • BottomSheetGrabber (drag affordance)
  //   • Rounded top corners (24px)
  //   • Themed InputDecoration (filled, branded focus border)
  //   • GradientButton CTA (consistent with login/register)
  //   • Email validation before submit
  //   • Keyboard-aware padding (viewInsets)
  //   • Semantics header for screen readers
  //   • P1-004 preserved: controller disposed on close
  //
  // Standard: Nielsen #4, Material M3, Apple HIG.
  // ═══════════════════════════════════════════════════════════════════════════
  void _showForgotPasswordSheet() {
    final emailController = TextEditingController(text: _emailController.text);
    final formKey = GlobalKey<FormState>();
    final colors = context.colors;
    // P0-AUD-004: Capture cubit before entering sheet builder scope.
    final cubit = context.read<LoginFormCubit>();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetCtx) {
        // P0-AUD-004 FIX: BlocBuilder makes the sheet reactive to loading state.
        // PREVIOUS: Static sheet — popped immediately on submit, zero API feedback.
        // NOW: Sheet stays open, CTA shows spinner, email field disabled.
        return BlocBuilder<LoginFormCubit, LoginFormState>(
          bloc: cubit,
          buildWhen: (prev, curr) => prev.isForgotPwLoading != curr.isForgotPwLoading,
          builder: (_, fpState) {
            final isLoading = fpState.isForgotPwLoading;
            return PopScope(
              // Block back gesture while API call is in progress.
              canPop: !isLoading,
              child: Padding(
                padding: EdgeInsets.only(
                  bottom: MediaQuery.of(sheetCtx).viewInsets.bottom,
                ),
                child: Container(
                  decoration: BoxDecoration(
                    color: colors.surfaceElevated,
                    borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(24),
                    ),
                  ),
                  padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
                  child: Form(
                    key: formKey,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Drag handle
                        BottomSheetGrabber(colors: colors),

                        // Icon header
                        Center(
                          child: Container(
                            width: 64,
                            height: 64,
                            decoration: BoxDecoration(
                              color: colors.primaryBrandLight,
                              shape: BoxShape.circle,
                            ),
                            child: Icon(
                              PhosphorIconsRegular.lockKey,
                              size: 28,
                              color: colors.primaryBrand,
                            ),
                          ),
                        ),
                        const SizedBox(height: 20),

                        // Title
                        Semantics(
                          header: true,
                          child: Center(
                            child: Text(
                              context.tr('auth_forgot_password'),
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w800,
                                color: colors.textPrimary,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),

                        // Description
                        Center(
                          child: Text(
                            context.tr('auth_forgot_password_desc'),
                            style: TextStyle(
                              color: colors.textSecondary,
                              fontSize: 14,
                              height: 1.6,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ),
                        const SizedBox(height: 24),

                        // Email field — disabled during loading
                        TextFormField(
                          controller: emailController,
                          keyboardType: TextInputType.emailAddress,
                          textDirection: TextDirection.ltr,
                          autofocus: true,
                          // P0-AUD-004: Freeze input during API call.
                          enabled: !isLoading,
                          decoration: InputDecoration(
                            labelText: context.tr('auth_email_label'),
                            labelStyle: TextStyle(color: colors.textSecondary),
                            hintText: 'example@email.com',
                            hintStyle: TextStyle(color: colors.textSubtle),
                            prefixIcon: Icon(
                              PhosphorIconsRegular.envelope,
                              color: colors.textSecondary,
                            ),
                            filled: true,
                            fillColor: colors.backgroundPrimary,
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
                              borderSide: BorderSide(
                                color: colors.primaryBrand,
                                width: 2,
                              ),
                            ),
                            errorBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: BorderSide(color: colors.error),
                            ),
                          ),
                          validator: (v) {
                            if (v == null || v.trim().isEmpty) {
                              return context.tr('auth_email_required');
                            }
                            if (!RegExp(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$').hasMatch(v.trim())) {
                              return context.tr('auth_email_invalid');
                            }
                            return null;
                          },
                          onFieldSubmitted: (_) {
                            if (!isLoading && (formKey.currentState?.validate() ?? false)) {
                              cubit.setForgotPwLoading(true);
                              context.read<AuthBloc>().add(
                                AuthForgotPassword(emailController.text.trim()),
                              );
                            }
                          },
                        ),
                        const SizedBox(height: 24),

                        // CTA — GradientButton shows loading spinner during API call
                        GradientButton(
                          label: isLoading
                              ? context.tr('auth_forgot_sending')
                              : context.tr('auth_send_btn'),
                          icon: isLoading ? null : PhosphorIconsRegular.paperPlaneTilt,
                          isLoading: isLoading,
                          onPressed: isLoading
                              ? null
                              : () {
                                  if (formKey.currentState?.validate() ?? false) {
                                    cubit.setForgotPwLoading(true);
                                    context.read<AuthBloc>().add(
                                      AuthForgotPassword(emailController.text.trim()),
                                    );
                                    // P0-AUD-004: Do NOT pop here. BLocListener in
                                    // build() dismisses the sheet on API response.
                                  }
                                },
                        ),
                        const SizedBox(height: 12),

                        // Cancel — disabled during loading
                        Center(
                          child: TextButton(
                            onPressed: isLoading ? null : () => Navigator.pop(sheetCtx),
                            child: Text(
                              context.tr('cancel'),
                              style: TextStyle(
                                color: isLoading
                                    ? colors.textSubtle
                                    : colors.textSecondary,
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ),

                        // Safe area bottom padding
                        SizedBox(
                          height: MediaQuery.of(sheetCtx).viewPadding.bottom + 8,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        );
      },
    ).then((_) {
      emailController.dispose(); // P1-004 preserved: Dispose on close
      // Safety: reset loading if sheet dismissed externally (e.g. Android back).
      cubit.setForgotPwLoading(false);
    });
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

  /// AUD-002 FIX: Facebook OAuth hidden — feature unavailable.
  /// Only Google and Apple shown as functional providers.
  Widget _buildSocialButtons() {
    final colors = context.colors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // P1-AUD-009 FIX: Read from Cubit instead of defunct _isSocialLoading field.
    final isSocialLoading = context.read<LoginFormCubit>().state.isSocialLoading;
    return Column(
      children: [
        // ─── Google + Apple (functional) ───────────────────────────
        Row(
          children: [
            Expanded(
              // P0-UX-003 FIX: Dark mode contrast failure.
              // PREVIOUS: Colors.white — jarring white island in dark mode.
              // NOW: Themed surface with proper border contrast in both modes.
              // Standard: WCAG 1.4.11 (Non-text Contrast 3:1 min).
              child: _buildSocialButton(
                label: 'Google',
                icon: PhosphorIconsRegular.googleLogo,
                backgroundColor: isDark ? colors.surfaceElevated : Colors.white,
                foregroundColor: isDark ? colors.textPrimary : const Color(0xFF3C4043),
                borderColor: colors.strokeBorder,
                onPressed: isSocialLoading ? null : () => _handleSocialLogin('google'),
                isLoading: isSocialLoading,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              // P0-UX-003 FIX: Dark mode — Apple black was invisible.
              // NOW: Uses high-contrast surface in dark, black in light.
              child: _buildSocialButton(
                label: 'Apple',
                icon: PhosphorIconsRegular.appleLogo,
                backgroundColor: isDark ? colors.surfaceElevated : Colors.black,
                foregroundColor: isDark ? colors.textPrimary : Colors.white,
                borderColor: isDark ? colors.strokeBorder : Colors.black,
                onPressed: isSocialLoading ? null : () => _handleSocialLogin('apple'),
                isLoading: isSocialLoading,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),

        // ─── Facebook (Coming Soon — W3-P3-005) ──────────────────
        // Disabled with opacity + 'قريباً' badge overlay.
        // Requires Meta App Review before activation.
        Stack(
          clipBehavior: Clip.none,
          children: [
            Opacity(
              opacity: 0.5,
              child: _buildSocialButton(
                label: 'Facebook',
                icon: PhosphorIconsRegular.facebookLogo,
                backgroundColor: const Color(0xFF1877F2),
                foregroundColor: Colors.white,
                borderColor: const Color(0xFF1877F2),
                onPressed: null,
              ),
            ),
            // 'قريباً' (Coming Soon) badge — top-end corner
            PositionedDirectional(
              top: -6,
              end: -4,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 2,
                ),
                decoration: BoxDecoration(
                  color: colors.textSecondary,
                  borderRadius: BorderRadius.circular(8),
                ),
                // P2-AUD-009 FIX: Was hardcoded Arabic — bypassed i18n.
                child: Text(
                  context.tr('coming_soon'),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ],
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
    required VoidCallback? onPressed,
    bool isLoading = false,
  }) {
    return Material(
      color: backgroundColor,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(12),
        child: AnimatedOpacity(
          // P0-UX-004 FIX: Visual dim during loading — signals disabled state.
          opacity: isLoading ? 0.6 : 1.0,
          duration: const Duration(milliseconds: 200),
          child: Container(
            height: 48,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: borderColor, width: 1.5),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (isLoading)
                  SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: foregroundColor,
                    ),
                  )
                else
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
      ),
    );
  }

  // P1-AUD-009 FIX: Loading state migrated to LoginFormCubit.isSocialLoading.
  // PREVIOUS: setState(() => _isSocialLoading = true) — violated Absolute Zero.
  // NOW: cubit.setSocialLoading(true) — BlocBuilder auto-rebuilds UI.
  // Standard: Nielsen #1 (Visibility of System Status), Apple HIG.
  Future<void> _handleSocialLogin(String provider) async {
    final cubit = context.read<LoginFormCubit>();
    cubit.setSocialLoading(true);
    try {
      final result = await SocialAuthService.instance.signIn(provider);

      // Dispatch to AuthBloc — backend verifies the ID token server-side
      // W3-P1-008: Pass rememberMe from LoginFormCubit to social login event.
      if (mounted) {
        final rememberMe = context.read<LoginFormCubit>().state.rememberMe;
        context.read<AuthBloc>().add(AuthSocialLoginRequested(
          provider: result.provider,
          idToken: result.idToken,
          fullName: result.fullName,
          remember: rememberMe,
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
    } finally {
      if (mounted) cubit.setSocialLoading(false);
    }
  }
}
