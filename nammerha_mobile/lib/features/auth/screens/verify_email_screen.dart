import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/theme/semantic_colors.dart';
import '../../../core/network/api_client.dart';
import '../../../core/widgets/gradient_button.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Verify Email Screen — Email confirmation handler
/// ═══════════════════════════════════════════════════════════════════════════
/// Mirrors web: frontend/src/pages/verify-email.ts
/// Receives a verification token, calls backend, shows result.
/// Auto-navigates to login on success after 3s.
/// ═══════════════════════════════════════════════════════════════════════════
class VerifyEmailScreen extends StatefulWidget {
  final String? token;

  const VerifyEmailScreen({super.key, this.token});

  @override
  State<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends State<VerifyEmailScreen> {
  String _status = 'verifying'; // verifying, success, error, expired
  String _message = '';

  @override
  void initState() {
    super.initState();
    _verifyToken();
  }

  Future<void> _verifyToken() async {
    if (widget.token == null || widget.token!.isEmpty) {
      setState(() {
        _status = 'error';
        _message = 'رابط التحقق غير صالح — لا يوجد رمز تحقق';
      });
      return;
    }

    try {
      final api = NammerhaApiClient.instance;
      await api.request(
        '/auth/verify-email',
        method: 'POST',
        body: {'token': widget.token},
      );

      setState(() {
        _status = 'success';
        _message = 'تم تأكيد بريدك الإلكتروني بنجاح!';
      });

      // Auto-navigate to login after 3 seconds
      await Future.delayed(const Duration(seconds: 3));
      if (mounted) {
        Navigator.of(context).pushNamedAndRemoveUntil('/', (_) => false);
      }
    } on ApiException catch (e) {
      setState(() {
        if (e.statusCode == 410 || e.message.contains('expired')) {
          _status = 'expired';
          _message = 'انتهت صلاحية رابط التحقق — اطلب رابطاً جديداً';
        } else {
          _status = 'error';
          _message = e.message;
        }
      });
    } catch (e) {
      setState(() {
        _status = 'error';
        _message = 'حدث خطأ في التحقق — حاول مرة أخرى';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _buildIcon(colors),
                const SizedBox(height: 32),
                _buildTitle(colors),
                const SizedBox(height: 12),
                _buildMessage(colors),
                const SizedBox(height: 40),
                _buildAction(colors),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildIcon(SemanticColors colors) {
    IconData icon;
    Color iconColor;
    Color bgColor;

    switch (_status) {
      case 'verifying':
        return SizedBox(
          width: 80,
          height: 80,
          child: CircularProgressIndicator(
            color: colors.primaryBrand,
            strokeWidth: 3,
          ),
        ).animate().fadeIn();
      case 'success':
        icon = Icons.verified_rounded;
        iconColor = colors.success;
        bgColor = colors.success.withAlpha(15);
        break;
      case 'expired':
        icon = Icons.timer_off_rounded;
        iconColor = colors.warning;
        bgColor = colors.warning.withAlpha(15);
        break;
      default:
        icon = Icons.error_outline_rounded;
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

  Widget _buildTitle(SemanticColors colors) {
    String title;
    switch (_status) {
      case 'verifying':
        title = 'جارِ التحقق...';
        break;
      case 'success':
        title = 'تم التحقق ✓';
        break;
      case 'expired':
        title = 'انتهت الصلاحية';
        break;
      default:
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

  Widget _buildMessage(SemanticColors colors) {
    if (_message.isEmpty) return const SizedBox.shrink();

    return Text(
      _message,
      textAlign: TextAlign.center,
      style: TextStyle(
        fontSize: 15,
        color: colors.textSecondary,
        height: 1.5,
      ),
    ).animate(delay: 400.ms).fadeIn();
  }

  Widget _buildAction(SemanticColors colors) {
    switch (_status) {
      case 'verifying':
        return const SizedBox.shrink();
      case 'success':
        return Text(
          'سيتم تحويلك تلقائياً...',
          style: TextStyle(fontSize: 13, color: colors.textSubtle),
        ).animate(delay: 600.ms).fadeIn();
      default:
        return GradientButton(
          label: 'العودة لتسجيل الدخول',
          icon: Icons.login_rounded,
          onPressed: () {
            Navigator.of(context).pushNamedAndRemoveUntil('/', (_) => false);
          },
        ).animate(delay: 600.ms).fadeIn();
    }
  }
}
