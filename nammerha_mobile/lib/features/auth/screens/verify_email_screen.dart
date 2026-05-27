import 'dart:async';

import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/gradient_button.dart';
import '../../../core/i18n/t.dart';
import '../bloc/verify_email_bloc.dart';
import '../bloc/auth_bloc.dart';
import '../../../core/utils/animation_budget.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Verify Email Screen — Platinum Standard (Wave 5 Audit)
/// ═══════════════════════════════════════════════════════════════════════════
/// Mirrors web: frontend/src/pages/verify-email.ts
/// Receives a verification token (from deep link), calls backend via
/// VerifyEmailBloc, shows result. Auto-navigates to login on success after 3s.
///
/// P1-VE-001 FIX: i18n — all messages resolved via context.tr() from
///   ErrorKeys emitted by VerifyEmailBloc.
/// P1-VE-002 FIX: AuthRepository injected from AuthBloc into VerifyEmailBloc
///   via constructor DI — no more NammerhaApiClient.instance singleton.
/// P1-VE-003 FIX: Resend button with 60s cooldown timer shown on expired token
///   — previously, users had NO recovery path from this screen.
/// P2-VE-002 FIX: Icon background alpha 15 → 26 (~10% opacity).
/// P3-VE-002 FIX: Semantics label wrapping main content.
/// ═══════════════════════════════════════════════════════════════════════════
class VerifyEmailScreen extends StatelessWidget {
  final String? token;
  final String? email;

  const VerifyEmailScreen({super.key, this.token, this.email});

  @override
  Widget build(BuildContext context) {
    // P1-VE-002 FIX: Inject AuthRepository from AuthBloc into VerifyEmailBloc.
    final authRepo = context.read<AuthBloc>().authRepository;
    return BlocProvider(
      create: (_) => VerifyEmailBloc(authRepository: authRepo)
        ..add(VerifyEmailRequested(token: token)),
      child: _VerifyEmailView(token: token, email: email),
    );
  }
}

class _VerifyEmailView extends StatefulWidget {
  final String? token;
  final String? email;

  const _VerifyEmailView({this.token, this.email});

  @override
  State<_VerifyEmailView> createState() => _VerifyEmailViewState();
}

class _VerifyEmailViewState extends State<_VerifyEmailView> {
  // P1-VE-003: Resend cooldown timer state.
  static const _cooldownSeconds = 60;
  int _remainingSeconds = 0;
  Timer? _timer;

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

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      body: SafeArea(
        // P3-VE-002 FIX: Semantics for screen readers.
        child: Semantics(
          label: 'Email verification screen',
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: BlocConsumer<VerifyEmailBloc, VerifyEmailState>(
                
                buildWhen: (previous, current) {
                  // Allow Error and Success states to trigger a rebuild
                  return current is! VerifyEmailResent; // Don't rebuild builder for resent, just listener
                },
                listener: (context, state) {
                  if (state is VerifyEmailSuccess) {
                    // Auto-navigate to login after 3 seconds
                    Future.delayed(const Duration(seconds: 3), () {
                      if (context.mounted) {
                        Navigator.of(context)
                            .pushNamedAndRemoveUntil('/', (_) => false);
                      }
                    });
                  } else if (state is VerifyEmailResent) {
                    // P1-VE-003: Show success SnackBar and start cooldown.
                    _startCooldown();
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(context.tr(state.messageKey)),
                        backgroundColor: colors.success,
                        behavior: SnackBarBehavior.floating,
                        margin: const EdgeInsets.all(16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    );
                  }
                },
                builder: (context, state) {
                  return Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _buildIcon(context, colors, state),
                      const SizedBox(height: 32),
                      _buildTitle(context, colors, state),
                      const SizedBox(height: 12),
                      _buildMessage(context, colors, state),
                      const SizedBox(height: 40),
                      _buildAction(context, colors, state),
                    ],
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildIcon(
      BuildContext context, SemanticColors colors, VerifyEmailState state) {
    if (state is VerifyEmailVerifying) {
      return SizedBox(
        width: 80,
        height: 80,
        child: NammerhaShimmerLoader(colors: colors),
      ).nmAnimate(context).fadeIn();
    }

    IconData icon;
    Color iconColor;
    Color bgColor;

    if (state is VerifyEmailSuccess) {
      icon = PhosphorIconsRegular.sealCheck;
      iconColor = colors.success;
      // P2-VE-002 FIX: Alpha 15 → 26 (~10% opacity) for better visibility.
      bgColor = colors.success.withAlpha(26);
    } else if (state is VerifyEmailExpired) {
      icon = PhosphorIconsRegular.clockCountdown;
      iconColor = colors.warning;
      bgColor = colors.warning.withAlpha(26);
    } else {
      icon = PhosphorIconsRegular.xCircle;
      iconColor = colors.error;
      bgColor = colors.error.withAlpha(26);
    }

    return Container(
      width: 100,
      height: 100,
      decoration: BoxDecoration(
        color: bgColor,
        shape: BoxShape.circle,
      ),
      child: Icon(icon, size: 48, color: iconColor),
    )
        .nmAnimate(context)
        .fadeIn(duration: 500.ms)
        .scale(begin: const Offset(0.5, 0.5), end: const Offset(1, 1));
  }

  Widget _buildTitle(
      BuildContext context, SemanticColors colors, VerifyEmailState state) {
    String title;
    if (state is VerifyEmailVerifying) {
      title = context.tr('verify_loading');
    } else if (state is VerifyEmailSuccess) {
      title = context.tr('verify_success');
    } else if (state is VerifyEmailExpired) {
      title = context.tr('verify_expired');
    } else {
      title = context.tr('verify_failed');
    }

    return Text(
      title,
      style: TextStyle(
        fontSize: 26,
        fontWeight: FontWeight.w800,
        color: colors.textPrimary,
      ),
    ).nmAnimate(context, delay: 200.ms).fadeIn();
  }

  Widget _buildMessage(
      BuildContext context, SemanticColors colors, VerifyEmailState state) {
    // P1-VE-001 FIX: Resolve i18n keys from BLoC states via context.tr().
    String message = '';
    if (state is VerifyEmailSuccess) {
      message = context.tr(state.messageKey);
    } else if (state is VerifyEmailExpired) {
      message = context.tr(state.messageKey);
    } else if (state is VerifyEmailError) {
      message = context.tr(state.messageKey);
    }

    if (message.isEmpty) return const SizedBox.shrink();

    return Text(
      message,
      textAlign: TextAlign.center,
      style: TextStyle(
        fontSize: 15,
        color: colors.textSecondary,
        height: 1.5,
      ),
    ).nmAnimate(context, delay: 400.ms).fadeIn();
  }

  Widget _buildAction(
      BuildContext context, SemanticColors colors, VerifyEmailState state) {
    if (state is VerifyEmailVerifying) {
      return const SizedBox.shrink();
    }

    if (state is VerifyEmailSuccess) {
      return Text(
        context.tr('auto_redirect'),
        style: TextStyle(fontSize: 13, color: colors.textSubtle),
      ).nmAnimate(context, delay: 600.ms).fadeIn();
    }

    // P1-VE-003 FIX: Show resend button on expired state (with cooldown timer).
    // Previously, users had NO recovery path — only "Back to Login".
    if (state is VerifyEmailExpired && widget.email != null) {
      return Column(
        children: [
          // Resend button with cooldown
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _remainingSeconds > 0
                  ? null
                  : () {
                      context.read<VerifyEmailBloc>().add(
                            ResendVerificationRequested(email: widget.email!),
                          );
                    },
              icon: Icon(PhosphorIconsRegular.arrowsClockwise, size: 18),
              label: Text(
                _remainingSeconds > 0
                    ? context
                        .tr('verify_email_resend_countdown')
                        .replaceAll(r'$1', '$_remainingSeconds')
                    : context.tr('verify_email_resend_expired'),
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
          GradientButton(
            label: context.tr('back_to_login'),
            icon: PhosphorIconsRegular.signIn,
            onPressed: () {
              Navigator.of(context)
                  .pushNamedAndRemoveUntil('/', (_) => false);
            },
          ),
        ],
      ).nmAnimate(context, delay: 600.ms).fadeIn();
    }

    return GradientButton(
      label: context.tr('back_to_login'),
      icon: PhosphorIconsRegular.signIn,
      onPressed: () {
        Navigator.of(context).pushNamedAndRemoveUntil('/', (_) => false);
      },
    ).nmAnimate(context, delay: 600.ms).fadeIn();
  }
}
