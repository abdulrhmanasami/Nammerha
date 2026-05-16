import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/gradient_button.dart';
import '../bloc/verify_email_bloc.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Verify Email Screen — Platinum Standard (Absolute Zero setState)
/// ═══════════════════════════════════════════════════════════════════════════
/// Mirrors web: frontend/src/pages/verify-email.ts
/// Receives a verification token, calls backend via VerifyEmailBloc,
/// shows result. Auto-navigates to login on success after 3s.
///
/// CRITICAL FIX: Previous version called NammerhaApiClient.instance.request()
/// directly inside initState() with raw setState. Now all network logic
/// is encapsulated in VerifyEmailBloc.
/// ═══════════════════════════════════════════════════════════════════════════
class VerifyEmailScreen extends StatelessWidget {
  final String? token;

  const VerifyEmailScreen({super.key, this.token});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => VerifyEmailBloc()
        ..add(VerifyEmailRequested(token: token)),
      child: _VerifyEmailView(token: token),
    );
  }
}

class _VerifyEmailView extends StatelessWidget {
  final String? token;

  const _VerifyEmailView({this.token});

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: BlocConsumer<VerifyEmailBloc, VerifyEmailState>(
              listener: (context, state) {
                if (state is VerifyEmailSuccess) {
                  // Auto-navigate to login after 3 seconds
                  Future.delayed(const Duration(seconds: 3), () {
                    if (context.mounted) {
                      Navigator.of(context)
                          .pushNamedAndRemoveUntil('/', (_) => false);
                    }
                  });
                }
              },
              builder: (context, state) {
                return Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _buildIcon(colors, state),
                    const SizedBox(height: 32),
                    _buildTitle(colors, state),
                    const SizedBox(height: 12),
                    _buildMessage(colors, state),
                    const SizedBox(height: 40),
                    _buildAction(context, colors, state),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildIcon(SemanticColors colors, VerifyEmailState state) {
    if (state is VerifyEmailVerifying) {
      return SizedBox(
        width: 80,
        height: 80,
        child: NammerhaShimmerLoader(colors: colors),
      ).animate().fadeIn();
    }

    IconData icon;
    Color iconColor;
    Color bgColor;

    if (state is VerifyEmailSuccess) {
      icon = PhosphorIconsRegular.sealCheck;
      iconColor = colors.success;
      bgColor = colors.success.withAlpha(15);
    } else if (state is VerifyEmailExpired) {
      icon = PhosphorIconsRegular.clockCountdown;
      iconColor = colors.warning;
      bgColor = colors.warning.withAlpha(15);
    } else {
      icon = PhosphorIconsRegular.xCircle;
      iconColor = colors.error;
      bgColor = colors.error.withAlpha(15);
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
        .animate()
        .fadeIn(duration: 500.ms)
        .scale(begin: const Offset(0.5, 0.5), end: const Offset(1, 1));
  }

  Widget _buildTitle(SemanticColors colors, VerifyEmailState state) {
    String title;
    if (state is VerifyEmailVerifying) {
      title = 'جارِ التحقق...';
    } else if (state is VerifyEmailSuccess) {
      title = 'تم التحقق ✓';
    } else if (state is VerifyEmailExpired) {
      title = 'انتهت الصلاحية';
    } else {
      title = 'فشل التحقق';
    }

    return Text(
      title,
      style: TextStyle(
        fontSize: 26,
        fontWeight: FontWeight.w800,
        color: colors.textPrimary,
      ),
    ).animate(delay: 200.ms).fadeIn();
  }

  Widget _buildMessage(SemanticColors colors, VerifyEmailState state) {
    String message = '';
    if (state is VerifyEmailSuccess) {
      message = state.message;
    } else if (state is VerifyEmailExpired) {
      message = state.message;
    } else if (state is VerifyEmailError) {
      message = state.message;
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
    ).animate(delay: 400.ms).fadeIn();
  }

  Widget _buildAction(
      BuildContext context, SemanticColors colors, VerifyEmailState state) {
    if (state is VerifyEmailVerifying) {
      return const SizedBox.shrink();
    }

    if (state is VerifyEmailSuccess) {
      return Text(
        'سيتم تحويلك تلقائياً...',
        style: TextStyle(fontSize: 13, color: colors.textSubtle),
      ).animate(delay: 600.ms).fadeIn();
    }

    return GradientButton(
      label: 'العودة لتسجيل الدخول',
      icon: PhosphorIconsRegular.signIn,
      onPressed: () {
        Navigator.of(context).pushNamedAndRemoveUntil('/', (_) => false);
      },
    ).animate(delay: 600.ms).fadeIn();
  }
}
