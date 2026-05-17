import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/gradient_button.dart';
import '../../../core/i18n/t.dart';
import '../bloc/auth_bloc.dart';
import '../bloc/register_wizard_cubit.dart';
import '../widgets/password_strength_indicator.dart';
import '../../../core/utils/animation_budget.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Register Wizard Screen — Platinum Standard
/// ═══════════════════════════════════════════════════════════════════════════
/// UX-F027 REMEDIATION: Cross-platform parity with web registration wizard.
///
/// ARCHITECTURE (Wave 4.8 — setState → Cubit):
///   - RegisterWizardCubit: manages page index, password visibility,
///     terms checkbox, password text (for strength indicator),
///     and AUD-003 draft persistence (name + email + step).
///   - AuthBloc: manages the actual registration API call.
///   - TextEditingControllers live in _RegisterWizardBody (StatefulWidget)
///     because Flutter requires dispose() for controllers.
///
/// AUD-003 FIX: Draft persistence — saves name + email + step to
/// SharedPreferences when advancing steps and on dispose. Restores
/// on next mount. NEVER persists passwords.
///
/// Step 1: Identity (Full Name)
/// Step 2: Account (Email)
/// Step 3: Security (Password, Confirm, Strength, Review, Terms, Submit)
/// ═══════════════════════════════════════════════════════════════════════════
class RegisterWizardScreen extends StatelessWidget {
  const RegisterWizardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => RegisterWizardCubit(),
      child: const _RegisterWizardBody(),
    );
  }
}

/// Internal body — StatefulWidget ONLY for TextEditingController lifecycle
/// and draft restore/save coordination. All UI state flows through
/// RegisterWizardCubit (zero setState).
class _RegisterWizardBody extends StatefulWidget {
  const _RegisterWizardBody();

  @override
  State<_RegisterWizardBody> createState() => _RegisterWizardBodyState();
}

class _RegisterWizardBodyState extends State<_RegisterWizardBody> {
  final _pageController = PageController();

  final _formKey1 = GlobalKey<FormState>();
  final _formKey2 = GlobalKey<FormState>();
  final _formKey3 = GlobalKey<FormState>();

  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  /// AUD-003: Tracks whether draft restore has been applied to controllers.
  /// Prevents re-applying on every build.
  bool _draftApplied = false;

  @override
  void initState() {
    super.initState();
    // AUD-003: Restore any saved draft on mount.
    // Uses addPostFrameCallback to ensure BlocProvider is available.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<RegisterWizardCubit>().restoreDraft();
    });
  }

  @override
  void dispose() {
    // AUD-003: Save draft on dispose — catches "swipe away" / back navigation.
    // Fire-and-forget: we don't await since the widget is being disposed.
    _saveDraftSync();
    _pageController.dispose();
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  /// AUD-003: Fire-and-forget draft save on dispose.
  void _saveDraftSync() {
    final name = _nameController.text.trim();
    final email = _emailController.text.trim();
    if (name.isNotEmpty || email.isNotEmpty) {
      // We can't read Cubit after dispose, so call directly.
      // The Cubit's saveDraft handles SharedPreferences async internally.
      context.read<RegisterWizardCubit>().saveDraft(name: name, email: email);
    }
  }

  void _nextPage(GlobalKey<FormState> key) {
    if (key.currentState?.validate() ?? false) {
      HapticFeedback.lightImpact();
      FocusScope.of(context).unfocus();

      // AUD-003: Save draft on step advance — captures progress.
      context.read<RegisterWizardCubit>().saveDraft(
            name: _nameController.text.trim(),
            email: _emailController.text.trim(),
          );

      _pageController.nextPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
    }
  }

  void _goBack() {
    final cubit = context.read<RegisterWizardCubit>();
    if (cubit.state.currentPage > 0) {
      _pageController.previousPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
    } else {
      Navigator.of(context).pop();
    }
  }

  /// UX-F027: Password validation matching web auth.ts lines 639-660.
  /// Requires: 8+ chars, 1 uppercase, 1 lowercase, 1 number, 1 special char.
  String? _validatePassword(String? value) {
    if (value == null || value.isEmpty) {
      return context.tr('reg_pw_required');
    }
    if (value.length < 8) {
      return context.tr('reg_pw_min_length');
    }
    if (!RegExp(r'[A-Z]').hasMatch(value)) {
      return context.tr('reg_pw_needs_upper');
    }
    if (!RegExp(r'[a-z]').hasMatch(value)) {
      return context.tr('reg_pw_needs_lower');
    }
    if (!RegExp(r'[0-9]').hasMatch(value)) {
      return context.tr('reg_pw_needs_number');
    }
    if (!RegExp(r'[^A-Za-z0-9]').hasMatch(value)) {
      return context.tr('reg_pw_needs_symbol');
    }
    return null;
  }

  void _submit() {
    if (!(_formKey3.currentState?.validate() ?? false)) return;

    final cubit = context.read<RegisterWizardCubit>();

    // UX-F027: Terms validation — GDPR Art.7 active consent required.
    if (!cubit.state.termsAccepted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(context.tr('reg_terms_required')),
          backgroundColor: context.colors.error,
        ),
      );
      return;
    }

    HapticFeedback.heavyImpact();
    context.read<AuthBloc>().add(
          AuthRegisterRequested(
            email: _emailController.text.trim(),
            password: _passwordController.text,
            fullName: _nameController.text.trim(),
          ),
        );
  }

  /// AUD-003: Apply restored draft values to TextEditingControllers.
  /// Called once when the Cubit emits state with draftRestored == true.
  void _applyDraft(RegisterWizardState wizState) {
    if (_draftApplied || !wizState.draftRestored) return;
    _draftApplied = true;

    // Pre-fill controllers with restored values.
    if (wizState.draftName.isNotEmpty && _nameController.text.isEmpty) {
      _nameController.text = wizState.draftName;
    }
    if (wizState.draftEmail.isNotEmpty && _emailController.text.isEmpty) {
      _emailController.text = wizState.draftEmail;
    }

    // Navigate to the restored step (0 or 1 — never step 2/password).
    if (wizState.currentPage > 0) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _pageController.hasClients) {
          _pageController.jumpToPage(wizState.currentPage);
        }
      });
    }

    // Show a subtle notification that draft was restored.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(context.tr('reg_draft_restored')),
          backgroundColor: context.colors.success,
          duration: const Duration(seconds: 2),
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.all(16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      context.read<RegisterWizardCubit>().acknowledgeDraftRestore();
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return BlocConsumer<AuthBloc, AuthState>(
      listener: (context, state) {
        if (state is AuthRegistrationSuccess) {
          // AUD-003: Clear draft on successful registration.
          context.read<RegisterWizardCubit>().clearDraft();
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(state.message), backgroundColor: colors.success),
          );
          Navigator.of(context).pop(); // Go back to login
        } else if (state is AuthError) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(state.message), backgroundColor: colors.error),
          );
        }
      },
      builder: (context, authState) {
        final isLoading = authState is AuthLoading;

        return BlocBuilder<RegisterWizardCubit, RegisterWizardState>(
          builder: (context, wizState) {
            // AUD-003: Apply draft to controllers when restored.
            _applyDraft(wizState);

            return Scaffold(
              backgroundColor: colors.backgroundPrimary,
              appBar: AppBar(
                backgroundColor: Colors.transparent,
                elevation: 0,
                // UX-F027 FIX: warningCircle → arrowLeft for back navigation.
                leading: IconButton(
                  icon: Icon(PhosphorIconsRegular.arrowLeft, color: colors.textPrimary),
                  onPressed: _goBack,
                ),
              ),
              body: SafeArea(
                child: Column(
                  children: [
                    _buildProgress(colors, wizState.currentPage),
                    Expanded(
                      child: PageView(
                        controller: _pageController,
                        physics: const NeverScrollableScrollPhysics(),
                        onPageChanged: (i) =>
                            context.read<RegisterWizardCubit>().setPage(i),
                        children: [
                          _buildStep1(colors),
                          _buildStep2(colors),
                          _buildStep3(colors, isLoading, wizState),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildProgress(SemanticColors colors, int currentPage) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      child: Row(
        children: List.generate(3, (index) {
          final isActive = index <= currentPage;
          return Expanded(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              margin: const EdgeInsets.symmetric(horizontal: 4),
              height: 4,
              decoration: BoxDecoration(
                color: isActive ? colors.primaryBrand : colors.strokeBorder,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          );
        }),
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Identity — Full Name
  // ═══════════════════════════════════════════════════════════════════════════
  Widget _buildStep1(SemanticColors colors) {
    return Form(
      key: _formKey1,
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              context.tr('reg_identity_title'),
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: colors.textPrimary),
            ),
            const SizedBox(height: 8),
            Text(
              context.tr('reg_identity_subtitle'),
              style: TextStyle(fontSize: 14, color: colors.textSecondary),
            ),
            const SizedBox(height: 32),
            TextFormField(
              controller: _nameController,
              decoration: InputDecoration(
                labelText: context.tr('full_name_label'),
                prefixIcon: Icon(PhosphorIconsRegular.user),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              validator: (v) => v == null || v.trim().isEmpty ? context.tr('reg_name_required') : null,
              textInputAction: TextInputAction.next,
              onFieldSubmitted: (_) => _nextPage(_formKey1),
            ),
            const SizedBox(height: 32),
            GradientButton(
              label: context.tr('next'),
              onPressed: () => _nextPage(_formKey1),
            ),
          ],
        ).nmAnimate(context).fadeIn().slideX(),
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Account — Email
  // ═══════════════════════════════════════════════════════════════════════════
  Widget _buildStep2(SemanticColors colors) {
    return Form(
      key: _formKey2,
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              context.tr('reg_account_title'),
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: colors.textPrimary),
            ),
            const SizedBox(height: 8),
            Text(
              context.tr('reg_account_subtitle'),
              style: TextStyle(fontSize: 14, color: colors.textSecondary),
            ),
            const SizedBox(height: 32),
            TextFormField(
              controller: _emailController,
              keyboardType: TextInputType.emailAddress,
              decoration: InputDecoration(
                labelText: context.tr('email_label'),
                // UX-F027 FIX: warningCircle → envelope for email field.
                prefixIcon: Icon(PhosphorIconsRegular.envelope),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              validator: (v) {
                if (v == null || v.trim().isEmpty) return context.tr('reg_email_required');
                if (!RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(v)) return context.tr('reg_email_invalid');
                return null;
              },
              textInputAction: TextInputAction.next,
              onFieldSubmitted: (_) => _nextPage(_formKey2),
            ),
            const SizedBox(height: 32),
            GradientButton(
              label: context.tr('next'),
              onPressed: () => _nextPage(_formKey2),
            ),
          ],
        ).nmAnimate(context).fadeIn().slideX(),
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Security — Password, Confirm, Strength, Review, Terms, Submit
  // ═══════════════════════════════════════════════════════════════════════════
  Widget _buildStep3(SemanticColors colors, bool isLoading, RegisterWizardState wizState) {
    final cubit = context.read<RegisterWizardCubit>();

    return Form(
      key: _formKey3,
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              context.tr('reg_security_title'),
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: colors.textPrimary),
            ),
            const SizedBox(height: 8),
            Text(
              context.tr('reg_security_subtitle'),
              style: TextStyle(fontSize: 14, color: colors.textSecondary),
            ),
            const SizedBox(height: 32),

            // Password field
            TextFormField(
              controller: _passwordController,
              obscureText: wizState.obscurePassword,
              decoration: InputDecoration(
                labelText: context.tr('password_label'),
                prefixIcon: Icon(PhosphorIconsRegular.lockKey),
                suffixIcon: IconButton(
                  icon: Icon(wizState.obscurePassword
                      ? PhosphorIconsRegular.eyeSlash
                      : PhosphorIconsRegular.eye),
                  onPressed: cubit.toggleObscurePassword,
                ),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              // UX-F027 FIX: Password validation matches web auth.ts (8+, upper, lower, num, symbol).
              validator: _validatePassword,
              textInputAction: TextInputAction.next,
              onChanged: cubit.updatePassword,
            ),

            // UX-F027 FIX: Password strength indicator — reactive via Cubit.
            PasswordStrengthIndicator(password: wizState.password),

            // Password requirements hint
            Padding(
              padding: const EdgeInsetsDirectional.only(bottom: 8),
              child: Text(
                context.tr('reg_pw_hint'),
                style: TextStyle(fontSize: 11, color: colors.textSecondary),
              ),
            ),

            const SizedBox(height: 8),

            // Confirm password field
            TextFormField(
              controller: _confirmPasswordController,
              obscureText: wizState.obscureConfirm,
              decoration: InputDecoration(
                labelText: context.tr('confirm_password_label'),
                prefixIcon: Icon(PhosphorIconsRegular.lockKey),
                suffixIcon: IconButton(
                  icon: Icon(wizState.obscureConfirm
                      ? PhosphorIconsRegular.eyeSlash
                      : PhosphorIconsRegular.eye),
                  onPressed: cubit.toggleObscureConfirm,
                ),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              validator: (v) {
                if (v == null || v.isEmpty) return context.tr('reg_confirm_required');
                if (v != _passwordController.text) return context.tr('reg_password_mismatch');
                return null;
              },
              textInputAction: TextInputAction.done,
              onFieldSubmitted: (_) => _submit(),
            ),

            const SizedBox(height: 24),

            // ═══ Review Card ═══
            _buildReviewCard(colors),

            const SizedBox(height: 16),

            // ═══ Terms Checkbox ═══
            // UX-F027 FIX: GDPR Art.7 active consent.
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 24,
                  height: 24,
                  child: Checkbox(
                    value: wizState.termsAccepted,
                    onChanged: (v) => cubit.setTerms(v ?? false),
                    activeColor: colors.primaryBrand,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: GestureDetector(
                    onTap: cubit.toggleTerms,
                    child: Text(
                      context.tr('reg_terms_agree'),
                      style: TextStyle(fontSize: 13, color: colors.textSecondary, height: 1.5),
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 32),

            // Submit button
            GradientButton(
              label: context.tr('create_account_btn'),
              isLoading: isLoading,
              onPressed: isLoading ? null : _submit,
              icon: PhosphorIconsRegular.userPlus,
            ),
          ],
        ).nmAnimate(context).fadeIn().slideX(),
      ),
    );
  }

  /// Review card showing name, email before final submit.
  Widget _buildReviewCard(SemanticColors colors) {
    final name = _nameController.text.trim();
    final email = _emailController.text.trim();

    if (name.isEmpty && email.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.tr('reg_review_title'),
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: colors.textSecondary, letterSpacing: 0.5),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: colors.primaryBrand.withAlpha(20),
                  shape: BoxShape.circle,
                ),
                child: Icon(PhosphorIconsRegular.user, color: colors.primaryBrand, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (name.isNotEmpty)
                      Text(name, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary)),
                    if (email.isNotEmpty)
                      Text(email, style: TextStyle(fontSize: 12, color: colors.textSecondary)),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    ).nmAnimate(context).fadeIn(duration: 200.ms);
  }
}
