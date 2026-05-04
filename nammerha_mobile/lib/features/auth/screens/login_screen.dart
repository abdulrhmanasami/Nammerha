import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/gradient_button.dart';
import '../bloc/auth_bloc.dart';
import '../bloc/login_form_cubit.dart';
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
  final _nameController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  late AnimationController _animController;
  late Animation<double> _fadeIn;

  // UX-001 FIX: Debounce guard to prevent multi-tap spam.
  // GradientButton's isLoading blocks taps during AuthLoading state, but
  // there's a microsecond gap between the tap and the BLoC emitting AuthLoading.
  // This flag closes that window with a 500ms lock.
  bool _isSubmitting = false;

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
    _nameController.dispose();
    _animController.dispose();
    super.dispose();
  }

  void _submit(bool isLoginMode, String selectedRole) {
    if (_isSubmitting) return; // UX-001: Block rapid multi-tap
    if (!_formKey.currentState!.validate()) return;

    _isSubmitting = true;
    // Release lock after 500ms — BLoC will have emitted AuthLoading by then,
    // and GradientButton's isLoading guard takes over.
    Future.delayed(const Duration(milliseconds: 500), () {
      _isSubmitting = false;
    });

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
        role: selectedRole,
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
          }
        },
        child: Scaffold(
          backgroundColor: colors.backgroundPrimary,
          body: SafeArea(
            child: FadeTransition(
              opacity: _fadeIn,
              child: BlocBuilder<LoginFormCubit, LoginFormState>(
                builder: (context, formState) {
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
                            context.tr('str_e29cfbf2'),
                            style: TextStyle(
                              fontSize: 32,
                              fontWeight: FontWeight.w900,
                              color: colors.textPrimary,
                            ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            formState.isLoginMode ? 'تسجيل الدخول إلى حسابك' : 'إنشاء حساب جديد',
                            style: TextStyle(fontSize: 16, color: colors.textSecondary),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 36),

                          // Full Name (register only)
                          if (!formState.isLoginMode) ...[
                            _buildTextField(
                              controller: _nameController,
                              label: 'الاسم الكامل',
                              icon: Icons.person_rounded,
                              validator: (v) {
                                if (v == null || v.trim().isEmpty) return 'الاسم مطلوب';
                                if (v.trim().length < 3) return 'يجب أن يكون الاسم 3 أحرف على الأقل';
                                return null;
                              },
                            ),
                            const SizedBox(height: 16),
                          ],

                          // Email
                          _buildTextField(
                            controller: _emailController,
                            label: 'البريد الإلكتروني',
                            icon: Icons.email_rounded,
                            keyboardType: TextInputType.emailAddress,
                            validator: (v) {
                              if (v == null || v.trim().isEmpty) return 'البريد الإلكتروني مطلوب';
                              if (!RegExp(r'^[^@]+@[^@]+\.[^@]+$').hasMatch(v.trim())) {
                                return 'صيغة البريد غير صحيحة';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 16),

                          // Password
                          _buildTextField(
                            controller: _passwordController,
                            label: 'كلمة المرور',
                            icon: Icons.lock_rounded,
                            obscureText: formState.obscurePassword,
                            suffixIcon: IconButton(
                              icon: Icon(
                                formState.obscurePassword ? Icons.visibility_off : Icons.visibility,
                                color: colors.textSecondary,
                              ),
                              onPressed: () => context.read<LoginFormCubit>().togglePasswordVisibility(),
                            ),
                            validator: (v) {
                              if (v == null || v.isEmpty) return 'كلمة المرور مطلوبة';
                              if (!formState.isLoginMode) {
                                if (v.length < 8) return 'يجب أن تكون 8 أحرف على الأقل';
                                if (!RegExp(r'[A-Z]').hasMatch(v)) return 'يجب أن تحتوي على حرف كبير';
                                if (!RegExp(r'[a-z]').hasMatch(v)) return 'يجب أن تحتوي على حرف صغير';
                                if (!RegExp(r'[0-9]').hasMatch(v)) return 'يجب أن تحتوي على رقم';
                                if (!RegExp(r'[^A-Za-z0-9]').hasMatch(v)) return 'يجب أن تحتوي على رمز خاص';
                              }
                              return null;
                            },
                          ),

                          // Forgot Password
                          if (formState.isLoginMode) ...[
                            Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton(
                                onPressed: () => _showForgotPasswordDialog(),
                                child: Text(
                                  'نسيت كلمة المرور؟',
                                  style: TextStyle(color: colors.primaryBrand, fontSize: 14),
                                ),
                              ),
                            ),
                          ],

                          // Role Selector (register only)
                          if (!formState.isLoginMode) ...[
                            const SizedBox(height: 20),
                            Text(
                              'اختر دورك في المنصة',
                              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: colors.textPrimary),
                            ),
                            const SizedBox(height: 12),
                            _buildRoleSelector(formState.selectedRole),
                          ],

                          const SizedBox(height: 28),

                          // Submit Button
                          BlocBuilder<AuthBloc, AuthState>(
                            builder: (context, state) {
                              return GradientButton(
                                label: formState.isLoginMode ? 'تسجيل الدخول' : 'إنشاء حساب',
                                icon: formState.isLoginMode ? Icons.login_rounded : Icons.person_add_rounded,
                                isLoading: state is AuthLoading,
                                onPressed: () => _submit(formState.isLoginMode, formState.selectedRole),
                              );
                            },
                          ),

                          const SizedBox(height: 20),

                          // Toggle Login/Register
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                formState.isLoginMode ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟',
                                style: TextStyle(color: colors.textSecondary),
                              ),
                              TextButton(
                                onPressed: () {
                                  context.read<LoginFormCubit>().toggleMode();
                                  _formKey.currentState?.reset();
                                },
                                child: Text(
                                  formState.isLoginMode ? 'أنشئ حساباً' : 'سجّل دخولك',
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

  Widget _buildRoleSelector(String selectedRole) {
    final roles = [
      {'key': 'donor', 'label': context.tr('role_donor'), 'icon': Icons.volunteer_activism_rounded},
      {'key': 'homeowner', 'label': context.tr('role_homeowner'), 'icon': Icons.home_rounded},
      {'key': 'engineer', 'label': context.tr('role_engineer'), 'icon': Icons.engineering_rounded},
      {'key': 'supplier', 'label': context.tr('role_supplier'), 'icon': Icons.inventory_2_rounded},
      {'key': 'contractor', 'label': context.tr('role_contractor'), 'icon': Icons.construction_rounded},
      {'key': 'tradesperson', 'label': context.tr('role_tradesperson'), 'icon': Icons.handyman_rounded},
    ];

    final colors = context.colors;

    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: roles.map((role) {
        final isSelected = selectedRole == role['key'];
        return GestureDetector(
          onTap: () => context.read<LoginFormCubit>().selectRole(role['key'] as String),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: isSelected ? colors.primaryBrandLight : colors.surfaceElevated,
              border: Border.all(
                color: isSelected ? colors.primaryBrand : colors.strokeSubtle,
                width: isSelected ? 2 : 1,
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  role['icon'] as IconData,
                  size: 18,
                  color: isSelected ? colors.primaryBrand : colors.textSecondary,
                ),
                const SizedBox(width: 8),
                Text(
                  role['label'] as String,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                    color: isSelected ? colors.primaryBrand : colors.textPrimary,
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }

  void _showForgotPasswordDialog() {
    final emailController = TextEditingController(text: _emailController.text);
    final colors = context.colors;

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surfaceElevated,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('نسيت كلمة المرور', style: TextStyle(color: colors.textPrimary)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'أدخل بريدك الإلكتروني لإرسال رابط إعادة تعيين كلمة المرور',
              style: TextStyle(color: colors.textSecondary, fontSize: 14),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: emailController,
              keyboardType: TextInputType.emailAddress,
              textDirection: TextDirection.ltr,
              decoration: InputDecoration(
                hintText: 'example@email.com',
                prefixIcon: Icon(Icons.email_rounded, color: colors.textSecondary),
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
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: const Text('تم إرسال رابط إعادة تعيين كلمة المرور'),
                    backgroundColor: colors.success,
                  ),
                );
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: colors.primaryBrand,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('إرسال', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  /// Shows a persistent MaterialBanner for email verification errors.
  /// Includes a "Resend verification" action button so the user can
  /// request a new verification link without leaving the login screen.
  void _showVerificationBanner(BuildContext context, String email, String message) {
    final colors = context.colors;

    ScaffoldMessenger.of(context).showMaterialBanner(
      MaterialBanner(
        backgroundColor: const Color(0xFFFFF3E0), // Warm amber background
        leading: Icon(Icons.mark_email_unread_rounded, color: colors.warning, size: 28),
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
            child: Text(
              'حسناً',
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
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: const Text('تعذر إعادة إرسال رابط التحقق - حاول مرة أخرى'),
                      backgroundColor: colors.error,
                      duration: const Duration(seconds: 4),
                    ),
                  );
                }
              }
            },
            child: Text(
              'إعادة إرسال رابط التحقق',
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
}
