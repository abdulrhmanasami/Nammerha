import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/gradient_button.dart';
import '../../../core/i18n/t.dart';
import '../bloc/auth_bloc.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// MFA Challenge Screen — Platinum Standard
/// ═══════════════════════════════════════════════════════════════════════════
/// P1-W15-001: Replaces the "use web platform" AlertDialog with a full TOTP
/// verification screen. Supports:
///   • 6-digit TOTP code from authenticator app
///   • Recovery code fallback
///   • AuthMfaError → retry without re-entering password
///   • Back-to-login escape hatch
///
/// BLoC events:
///   AuthMfaVerifyRequested → TOTP verification
///   AuthMfaRecoveryRequested → recovery code verification
///
/// BLoC states consumed:
///   AuthMfaRequired  → initial entry (mfaToken + email)
///   AuthMfaError     → retry with preserved mfaToken
///   AuthAuthenticated → success → pop to dashboard
///   AuthLoading      → spinner
/// ═══════════════════════════════════════════════════════════════════════════
class MfaChallengeScreen extends StatefulWidget {
  final String mfaToken;
  final String email;

  const MfaChallengeScreen({
    super.key,
    required this.mfaToken,
    required this.email,
  });

  @override
  State<MfaChallengeScreen> createState() => _MfaChallengeScreenState();
}

class _MfaChallengeScreenState extends State<MfaChallengeScreen>
    with SingleTickerProviderStateMixin {
  final _codeController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  late AnimationController _animController;
  late Animation<double> _fadeIn;

  /// Tracks whether the user is entering a recovery code instead of TOTP.
  bool _isRecoveryMode = false;

  /// Current MFA token — may update if AuthMfaError carries a refreshed token.
  late String _currentMfaToken;

  @override
  void initState() {
    super.initState();
    _currentMfaToken = widget.mfaToken;
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _fadeIn = CurvedAnimation(parent: _animController, curve: Curves.easeOut);
    _animController.forward();
  }

  @override
  void dispose() {
    _codeController.dispose();
    _animController.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    final code = _codeController.text.trim();
    if (_isRecoveryMode) {
      context.read<AuthBloc>().add(
            AuthMfaRecoveryRequested(
              mfaToken: _currentMfaToken,
              recoveryCode: code,
            ),
          );
    } else {
      context.read<AuthBloc>().add(
            AuthMfaVerifyRequested(
              mfaToken: _currentMfaToken,
              code: code,
            ),
          );
    }
  }

  void _toggleMode() {
    // Transient UI toggle — setState is acceptable per AGENTS.md rule:
    // "Only allowed for transient UI state (e.g., _isPressed, _isExpanded)."
    setState(() {
      _isRecoveryMode = !_isRecoveryMode;
      _codeController.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return BlocListener<AuthBloc, AuthState>(
      listener: (context, state) {
        if (state is AuthAuthenticated) {
          // MFA verification succeeded — pop back to login which handles
          // the onLoginSuccess callback.
          Navigator.of(context).pop();
        } else if (state is AuthMfaError) {
          // Update the MFA token in case the backend rotated it.
          _currentMfaToken = state.mfaToken.isNotEmpty
              ? state.mfaToken
              : _currentMfaToken;

          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(context.tr(state.message)),
              backgroundColor: colors.error,
              duration: const Duration(seconds: 4),
            ),
          );
        }
      },
      child: Scaffold(
        backgroundColor: colors.backgroundPrimary,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          leading: IconButton(
            icon: Icon(
              PhosphorIconsRegular.arrowLeft,
              color: colors.textPrimary,
            ),
            onPressed: () => Navigator.of(context).pop(),
            tooltip: context.tr('mfa_back_to_login'),
          ),
        ),
        body: SafeArea(
          child: FadeTransition(
            opacity: _fadeIn,
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Form(
                key: _formKey,
                child: BlocBuilder<AuthBloc, AuthState>(
                  builder: (context, state) {
                    final isLoading = state is AuthLoading;

                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const SizedBox(height: 32),

                        // Shield icon
                        Center(
                          child: Container(
                            width: 80,
                            height: 80,
                            decoration: BoxDecoration(
                              color: colors.primaryBrandLight,
                              shape: BoxShape.circle,
                            ),
                            child: Icon(
                              _isRecoveryMode
                                  ? PhosphorIconsRegular.key
                                  : PhosphorIconsRegular.shieldCheck,
                              size: 36,
                              color: colors.primaryBrand,
                            ),
                          ),
                        ),
                        const SizedBox(height: 24),

                        // Title
                        Semantics(
                          header: true,
                          child: Text(
                            context.tr('mfa_enter_code'),
                            style: TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.w800,
                              color: colors.textPrimary,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ),
                        const SizedBox(height: 8),

                        // Subtitle
                        Text(
                          _isRecoveryMode
                              ? context.tr('mfa_recovery_hint')
                              : context.tr('err_mfa_required'),
                          style: TextStyle(
                            fontSize: 14,
                            color: colors.textSecondary,
                            height: 1.6,
                          ),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 32),

                        // Code input field
                        TextFormField(
                          controller: _codeController,
                          keyboardType: _isRecoveryMode
                              ? TextInputType.text
                              : TextInputType.number,
                          textInputAction: TextInputAction.done,
                          textAlign: TextAlign.center,
                          textDirection: TextDirection.ltr,
                          autofocus: true,
                          enabled: !isLoading,
                          inputFormatters: _isRecoveryMode
                              ? [] // Recovery codes can be alphanumeric
                              : [
                                  FilteringTextInputFormatter.digitsOnly,
                                  LengthLimitingTextInputFormatter(6),
                                ],
                          style: TextStyle(
                            color: colors.textPrimary,
                            fontSize: 28,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 8,
                          ),
                          decoration: InputDecoration(
                            hintText: _isRecoveryMode
                                ? context.tr('mfa_recovery_hint')
                                : context.tr('mfa_code_hint'),
                            hintStyle: TextStyle(
                              color: colors.textSubtle,
                              fontSize: 16,
                              fontWeight: FontWeight.w400,
                              letterSpacing: 0,
                            ),
                            filled: true,
                            fillColor: colors.surfaceElevated,
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide:
                                  BorderSide(color: colors.strokeSubtle),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide:
                                  BorderSide(color: colors.strokeSubtle),
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
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 24,
                              vertical: 18,
                            ),
                          ),
                          onFieldSubmitted: (_) => _submit(),
                          validator: (v) {
                            if (v == null || v.trim().isEmpty) {
                              return context.tr('mfa_enter_code');
                            }
                            if (!_isRecoveryMode && v.trim().length != 6) {
                              return context.tr('mfa_code_hint');
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: 28),

                        // Verify button
                        GradientButton(
                          label: context.tr('mfa_verify_button'),
                          icon: PhosphorIconsRegular.shieldCheck,
                          isLoading: isLoading,
                          onPressed: isLoading ? null : _submit,
                        ),
                        const SizedBox(height: 20),

                        // Toggle TOTP ↔ Recovery
                        Center(
                          child: TextButton.icon(
                            onPressed: isLoading ? null : _toggleMode,
                            icon: Icon(
                              _isRecoveryMode
                                  ? PhosphorIconsRegular.deviceMobile
                                  : PhosphorIconsRegular.key,
                              size: 18,
                              color: isLoading
                                  ? colors.textSubtle
                                  : colors.primaryBrand,
                            ),
                            label: Text(
                              _isRecoveryMode
                                  ? context.tr('mfa_use_authenticator')
                                  : context.tr('mfa_use_recovery'),
                              style: TextStyle(
                                color: isLoading
                                    ? colors.textSubtle
                                    : colors.primaryBrand,
                                fontWeight: FontWeight.w600,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        ),

                        const SizedBox(height: 12),

                        // Back to login
                        Center(
                          child: TextButton(
                            onPressed:
                                isLoading ? null : () => Navigator.pop(context),
                            child: Text(
                              context.tr('mfa_back_to_login'),
                              style: TextStyle(
                                color: colors.textSecondary,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        ),

                        const SizedBox(height: 40),
                      ],
                    );
                  },
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
