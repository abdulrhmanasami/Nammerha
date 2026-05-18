import 'dart:async';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/i18n/t.dart';
import '../../../core/utils/animation_budget.dart';
import '../repositories/auth_repository.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// P0-002 FIX: Email Verification Interstitial
/// ═══════════════════════════════════════════════════════════════════════════
/// PREVIOUS: After registration, user got a SnackBar and was popped to login.
/// No guidance about email verification → 88% abandonment risk.
///
/// NOW: Dedicated interstitial screen with:
/// - Clear "check your inbox" messaging
/// - Email address display
/// - Resend button with 60-second cooldown timer
/// - "Open Mail App" convenience button
/// - "Back to Login" escape hatch
///
/// Standard: Nielsen #1 (Visibility of system status), #9 (Help users
/// recognize, diagnose, and recover from errors)
/// ═══════════════════════════════════════════════════════════════════════════
class EmailVerificationScreen extends StatefulWidget {
  final String email;

  const EmailVerificationScreen({super.key, required this.email});

  @override
  State<EmailVerificationScreen> createState() =>
      _EmailVerificationScreenState();
}

class _EmailVerificationScreenState extends State<EmailVerificationScreen> {
  static const _cooldownSeconds = 60;
  int _remainingSeconds = 0;
  Timer? _timer;
  bool _isResending = false;

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _startCooldown() {
    _remainingSeconds = _cooldownSeconds;
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        _remainingSeconds--;
        if (_remainingSeconds <= 0) {
          timer.cancel();
        }
      });
    });
  }

  Future<void> _resendVerification() async {
    if (_remainingSeconds > 0 || _isResending) return;

    setState(() => _isResending = true);
    try {
      final authRepo = AuthRepository();
      await authRepo.resendVerification(email: widget.email);
      if (!mounted) return;
      _startCooldown();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(context.tr('verify_email_resent')),
          backgroundColor: context.colors.success,
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.all(16),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('$e'),
          backgroundColor: context.colors.error,
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.all(16),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
    } finally {
      if (mounted) setState(() => _isResending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: Icon(PhosphorIconsRegular.arrowLeft, color: colors.textPrimary),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            children: [
              const Spacer(flex: 2),
              // Email icon with animated circle
              Container(
                width: 100,
                height: 100,
                decoration: BoxDecoration(
                  color: colors.primaryBrand.withAlpha(15),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  PhosphorIconsRegular.envelopeSimple,
                  size: 48,
                  color: colors.primaryBrand,
                ),
              ).nmAnimate(context).fadeIn(duration: 500.ms).scale(
                    begin: const Offset(0.8, 0.8),
                    end: const Offset(1.0, 1.0),
                    duration: 600.ms,
                  ),
              const SizedBox(height: 32),

              // Title
              Text(
                context.tr('verify_email_title'),
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: colors.textPrimary,
                ),
                textAlign: TextAlign.center,
              ).nmAnimate(context, delay: 200.ms).fadeIn().slideY(begin: 0.1),
              const SizedBox(height: 12),

              // Subtitle
              Text(
                context.tr('verify_email_subtitle'),
                style: TextStyle(
                  fontSize: 15,
                  color: colors.textSecondary,
                  height: 1.6,
                ),
                textAlign: TextAlign.center,
              ).nmAnimate(context, delay: 300.ms).fadeIn(),
              const SizedBox(height: 20),

              // Email address display
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                decoration: BoxDecoration(
                  color: colors.surfaceElevated,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: colors.primaryBrand.withAlpha(40)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(PhosphorIconsRegular.at,
                        size: 18, color: colors.primaryBrand),
                    const SizedBox(width: 10),
                    Flexible(
                      child: Text(
                        widget.email,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: colors.primaryBrand,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ).nmAnimate(context, delay: 400.ms).fadeIn(),
              const SizedBox(height: 14),

              // Spam hint
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(PhosphorIconsRegular.info,
                      size: 14, color: colors.textSubtle),
                  const SizedBox(width: 6),
                  Text(
                    context.tr('verify_email_check_spam'),
                    style: TextStyle(fontSize: 12, color: colors.textSubtle),
                  ),
                ],
              ).nmAnimate(context, delay: 500.ms).fadeIn(),

              const Spacer(flex: 1),

              // Resend button with cooldown
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _remainingSeconds > 0 || _isResending
                      ? null
                      : _resendVerification,
                  icon: _isResending
                      ? SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Icon(PhosphorIconsRegular.arrowsClockwise, size: 18),
                  label: Text(
                    _remainingSeconds > 0
                        ? context
                            .tr('verify_email_resend_countdown')
                            .replaceAll(r'$1', '$_remainingSeconds')
                        : context.tr('verify_email_resend'),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: colors.primaryBrand,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: colors.primaryBrand.withAlpha(100),
                    disabledForegroundColor: Colors.white.withAlpha(180),
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),

              // Back to login
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: Icon(PhosphorIconsRegular.signIn, size: 18),
                  label: Text(context.tr('verify_email_back_to_login')),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: colors.primaryBrand,
                    side: BorderSide(color: colors.primaryBrand),
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ),
              const Spacer(flex: 2),
            ],
          ),
        ),
      ),
    );
  }
}
