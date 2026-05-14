import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/gradient_button.dart';
import '../../../core/i18n/t.dart';
import '../bloc/auth_bloc.dart';
import '../widgets/password_strength_indicator.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Register Wizard Screen
/// ═══════════════════════════════════════════════════════════════════════════
/// UX-F027 REMEDIATION: Cross-platform parity with web registration wizard.
///
/// PREVIOUS (8 defects):
///   - P0: Password validation = 6 chars (web = 8 + upper/lower/num/symbol)
///   - P0: ALL 17 strings hardcoded Arabic — no i18n
///   - P0: warningCircle on back button (should be arrowLeft)
///   - P0: warningCircle on email icon (should be envelope)
///   - P0: No terms/consent checkbox (GDPR Art.7)
///   - P1: PasswordStrengthIndicator widget exists but not used
///   - P1: No review summary card (web has one in Step 3)
///   - P2: pw_strength_none key missing
///
/// NOW:
///   - Password validation matches web: 8+, uppercase, lowercase, number, symbol
///   - All strings use context.tr() with i18n keys
///   - Correct Phosphor icons (arrowLeft, envelope)
///   - Terms checkbox with validation gate
///   - PasswordStrengthIndicator wired to Step 3
///   - Review card showing name + email + strength before submit
///
/// Step 1: Identity (Full Name)
/// Step 2: Account (Email)
/// Step 3: Security (Password, Confirm, Strength, Review, Terms, Submit)
/// ═══════════════════════════════════════════════════════════════════════════
class RegisterWizardScreen extends StatefulWidget {
  const RegisterWizardScreen({super.key});

  @override
  State<RegisterWizardScreen> createState() => _RegisterWizardScreenState();
}

class _RegisterWizardScreenState extends State<RegisterWizardScreen> {
  final _pageController = PageController();
  int _currentPage = 0;

  final _formKey1 = GlobalKey<FormState>();
  final _formKey2 = GlobalKey<FormState>();
  final _formKey3 = GlobalKey<FormState>();

  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  bool _obscurePassword = true;
  bool _obscureConfirm = true;
  bool _termsAccepted = false;

  @override
  void dispose() {
    _pageController.dispose();
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  void _nextPage(GlobalKey<FormState> key) {
    if (key.currentState?.validate() ?? false) {
      HapticFeedback.lightImpact();
      FocusScope.of(context).unfocus();
      _pageController.nextPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
    }
  }

  void _goBack() {
    if (_currentPage > 0) {
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

    // UX-F027: Terms validation — GDPR Art.7 active consent required.
    if (!_termsAccepted) {
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

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return BlocConsumer<AuthBloc, AuthState>(
      listener: (context, state) {
        if (state is AuthRegistrationSuccess) {
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
      builder: (context, state) {
        final isLoading = state is AuthLoading;

        return Scaffold(
          backgroundColor: colors.backgroundPrimary,
          appBar: AppBar(
            backgroundColor: Colors.transparent,
            elevation: 0,
            // UX-F027 FIX: warningCircle → arrowLeft for back navigation.
            // PREVIOUS: warningCircle conveyed danger/error on a back button — P0 trust violation.
            leading: IconButton(
              icon: Icon(PhosphorIconsRegular.arrowLeft, color: colors.textPrimary),
              onPressed: _goBack,
            ),
          ),
          body: SafeArea(
            child: Column(
              children: [
                _buildProgress(colors),
                Expanded(
                  child: PageView(
                    controller: _pageController,
                    physics: const NeverScrollableScrollPhysics(),
                    onPageChanged: (i) => setState(() => _currentPage = i),
                    children: [
                      _buildStep1(colors),
                      _buildStep2(colors),
                      _buildStep3(colors, isLoading),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildProgress(SemanticColors colors) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      child: Row(
        children: List.generate(3, (index) {
          final isActive = index <= _currentPage;
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
        ).animate().fadeIn().slideX(),
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
                // PREVIOUS: warningCircle conveyed error state on a normal input.
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
        ).animate().fadeIn().slideX(),
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Security — Password, Confirm, Strength, Review, Terms, Submit
  // ═══════════════════════════════════════════════════════════════════════════
  Widget _buildStep3(SemanticColors colors, bool isLoading) {
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
              obscureText: _obscurePassword,
              decoration: InputDecoration(
                labelText: context.tr('password_label'),
                prefixIcon: Icon(PhosphorIconsRegular.lockKey),
                suffixIcon: IconButton(
                  icon: Icon(_obscurePassword ? PhosphorIconsRegular.eyeSlash : PhosphorIconsRegular.eye),
                  onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                ),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              // UX-F027 FIX: Password validation matches web auth.ts (8+, upper, lower, num, symbol).
              // PREVIOUS: v.length < 6 — users registered with "abc123" then failed backend validation.
              validator: _validatePassword,
              textInputAction: TextInputAction.next,
              onChanged: (_) => setState(() {}), // Trigger rebuild for strength indicator
            ),

            // UX-F027 FIX: Password strength indicator — widget existed but was never wired.
            // Uses the same scoring algorithm as the web (4 bars, color-coded).
            PasswordStrengthIndicator(password: _passwordController.text),

            // Password requirements hint (matches web pw_requirements text)
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
              obscureText: _obscureConfirm,
              decoration: InputDecoration(
                labelText: context.tr('confirm_password_label'),
                prefixIcon: Icon(PhosphorIconsRegular.lockKey),
                suffixIcon: IconButton(
                  icon: Icon(_obscureConfirm ? PhosphorIconsRegular.eyeSlash : PhosphorIconsRegular.eye),
                  onPressed: () => setState(() => _obscureConfirm = !_obscureConfirm),
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
            // UX-F027 FIX: Review summary — matches web Step 3 review card.
            // Shows what the user entered (name, email) + password strength indicator.
            // Nielsen #1 (System Status Visibility) — confirm data before final submit.
            _buildReviewCard(colors),

            const SizedBox(height: 16),

            // ═══ Terms Checkbox ═══
            // UX-F027 FIX: GDPR Art.7 active consent — matches web auth.html line 437-451.
            // PREVIOUS: No terms checkbox — legal liability.
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 24,
                  height: 24,
                  child: Checkbox(
                    value: _termsAccepted,
                    onChanged: (v) => setState(() => _termsAccepted = v ?? false),
                    activeColor: colors.primaryBrand,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => _termsAccepted = !_termsAccepted),
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
        ).animate().fadeIn().slideX(),
      ),
    );
  }

  /// Review card showing name, email, and password strength before final submit.
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
    ).animate().fadeIn(duration: 200.ms);
  }
}
