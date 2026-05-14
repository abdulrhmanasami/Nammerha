import '../../../core/i18n/t.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';


import '../../../core/theme/semantic_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../bloc/privacy_bloc.dart';
import '../data/privacy_repository.dart';

class PrivacyCenterScreen extends StatelessWidget {
  const PrivacyCenterScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => PrivacyBloc(
        repository: PrivacyRepository(),
      ),
      child: const _PrivacyCenterView(),
    );
  }
}

class _PrivacyCenterView extends StatelessWidget {
  const _PrivacyCenterView();

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<SemanticColors>()!;
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      backgroundColor: colors.backgroundSecondary,
      appBar: AppBar(
        title: Text(context.tr('privacy_center')),
      ),
      body: BlocListener<PrivacyBloc, PrivacyState>(
        listener: (context, state) {
          if (state is PrivacySuccess) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: colors.primaryBrand,
              ),
            );
          } else if (state is PrivacyError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: colors.error,
              ),
            );
          }
        },
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(NammerhaTheme.spaceMd),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'إدارة بياناتك',
                style: textTheme.headlineMedium?.copyWith(color: colors.textHeading),
              ),
              const SizedBox(height: NammerhaTheme.spaceSm),
              Text(
                'نحن في نعمّرها نلتزم بالشفافية المطلقة. بياناتك هي ملكك بالكامل. يمكنك طلب نسخة منها أو سحب موافقتك على معالجتها في أي وقت.',
                style: textTheme.bodyMedium?.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: NammerhaTheme.spaceLg),
              
              _ActionCard(
                icon: PhosphorIconsRegular.warningCircle,
                title: 'تصدير البيانات (GDPR)',
                description: 'احصل على نسخة كاملة من جميع بياناتك المسجلة لدينا بصيغة JSON قابلة للقراءة.',
                buttonText: 'طلب تصدير',
                onTap: () {
                  _showConfirmationDialog(
                    context,
                    title: 'تصدير البيانات',
                    content: 'هل أنت متأكد أنك تريد طلب تصدير جميع بياناتك؟ سيتم إرسال رابط التحميل إلى بريدك الإلكتروني خلال 24 ساعة.',
                    onConfirm: () => context.read<PrivacyBloc>().add(RequestDataExport()),
                  );
                },
              ),

              const SizedBox(height: NammerhaTheme.spaceMd),

              _ActionCard(
                icon: PhosphorIconsRegular.warningCircle,
                title: 'سحب الموافقة',
                description: 'إيقاف معالجة بياناتك لأغراض التحليل وتحسين الخدمات. لن يؤثر ذلك على خدمات الضمان الأساسية (Escrow).',
                buttonText: 'سحب الموافقة',
                isWarning: true,
                onTap: () {
                  _showConfirmationDialog(
                    context,
                    title: 'سحب الموافقة',
                    content: 'هل أنت متأكد من سحب موافقتك على معالجة البيانات؟',
                    isDestructive: true,
                    onConfirm: () => context.read<PrivacyBloc>().add(WithdrawConsent()),
                  );
                },
              ),

              const SizedBox(height: NammerhaTheme.spaceMd),

              _ActionCard(
                icon: PhosphorIconsRegular.warningCircle,
                title: 'حذف الحساب نهائياً',
                description: 'سيتم مسح جميع بياناتك الشخصية من خوادمنا بشكل لا رجعة فيه. ستبقى السجلات المالية مجهولة الهوية لأغراض التدقيق القانوني.',
                buttonText: 'حذف الحساب',
                isWarning: true,
                onTap: () {
                  _showConfirmationDialog(
                    context,
                    title: 'حذف الحساب نهائياً',
                    content: 'هذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد تماماً من رغبتك في حذف الحساب؟',
                    isDestructive: true,
                    onConfirm: () => context.read<PrivacyBloc>().add(DeleteAccount()),
                  );
                },
              ),

              const SizedBox(height: NammerhaTheme.spaceXl),
              
              Center(
                child: TextButton.icon(
                  onPressed: () {
                    // Navigate to Cryptographic Consent Audit Logs (optional future expansion)
                  },
                   icon: Icon(PhosphorIconsRegular.lockKey, size: 16),
                  label: Text(context.tr('consent_log_hmac')),
                  style: TextButton.styleFrom(foregroundColor: colors.primaryBrand),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showConfirmationDialog(
    BuildContext context, {
    required String title,
    required String content,
    required VoidCallback onConfirm,
    bool isDestructive = false,
  }) {
    final colors = Theme.of(context).extension<SemanticColors>()!;
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(content),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(context.tr('cancel_btn')),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: isDestructive ? colors.error : colors.primaryBrand,
            ),
            onPressed: () {
              Navigator.pop(ctx);
              onConfirm();
            },
            child: Text(context.tr('confirm_btn')),
          ),
        ],
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String description;
  final String buttonText;
  final VoidCallback onTap;
  final bool isWarning;

  const _ActionCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.buttonText,
    required this.onTap,
    this.isWarning = false,
  });

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<SemanticColors>()!;
    final theme = Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(NammerhaTheme.radiusLg),
        border: Border.all(color: colors.strokeBorder),
        boxShadow: const [NammerhaShadows.elevation],
      ),
      padding: const EdgeInsets.all(NammerhaTheme.spaceMd),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: isWarning ? colors.error : colors.primaryBrand, size: 28),
              const SizedBox(width: NammerhaTheme.spaceSm),
              Text(
                title,
                style: theme.textTheme.titleLarge?.copyWith(
                  color: isWarning ? colors.error : colors.textHeading,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: NammerhaTheme.spaceSm),
          Text(
            description,
            style: theme.textTheme.bodyMedium?.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: NammerhaTheme.spaceMd),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(
                foregroundColor: isWarning ? colors.error : colors.textPrimary,
                side: BorderSide(color: isWarning ? colors.error : colors.strokeBorder),
              ),
              onPressed: onTap,
              child: Text(buttonText),
            ),
          ),
        ],
      ),
    );
  }
}
