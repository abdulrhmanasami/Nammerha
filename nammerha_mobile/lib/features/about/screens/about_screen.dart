import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/theme/semantic_colors.dart';
import '../../../core/i18n/t.dart';

/// About Screen — platform info, mission, team, and legal links.
/// GAP-M5 FIX: Previously web-only (about.ts).
class AboutScreen extends StatefulWidget {
  const AboutScreen({super.key});

  @override
  State<AboutScreen> createState() => _AboutScreenState();
}

class _AboutScreenState extends State<AboutScreen> {
  String _version = '';

  @override
  void initState() {
    super.initState();
    _loadVersion();
  }

  Future<void> _loadVersion() async {
    final info = await PackageInfo.fromPlatform();
    if (mounted) setState(() => _version = '${info.version}+${info.buildNumber}');
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text('حول نعمّرها', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.textPrimary)),
        backgroundColor: colors.backgroundPrimary, elevation: 0,
        iconTheme: IconThemeData(color: colors.textPrimary),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          // Logo + Version
          Center(child: Column(children: [
            SvgPicture.asset(isDark ? 'assets/brand/Nammerha_logo_Full_dark.svg' : 'assets/brand/Nammerha_logo_Full.svg', width: 180, height: 65),
            const SizedBox(height: 8),
            if (_version.isNotEmpty) Text('الإصدار $_version', style: TextStyle(fontSize: 12, color: colors.textSubtle)),
          ])).animate().fadeIn(duration: 500.ms),
          const SizedBox(height: 28),

          // Mission
          _sectionCard(colors, icon: PhosphorIconsRegular.flag, title: context.tr('str_55da8344'), body:
            'نعمّرها هي منصة إعادة إعمار سوريا الرقمية الأولى، مبنية على الشفافية الجذرية ومعيار البيانات المفتوحة للتعاقد (OCDS). '
            'نضمن وصول كل ليرة إلى حيث يجب عبر آلية ضمان إسكرو مع إثبات مكاني بالـ GPS.',
          ),
          const SizedBox(height: 14),

          // How it works
          _sectionCard(colors, icon: PhosphorIconsRegular.compassTool, title: 'كيف تعمل المنصة', body:
            '١. أصحاب المنازل المتضررة يسجّلون مشاريعهم بتقارير أضرار مصوّرة\n'
            '٢. المانحون يموّلون المشاريع عبر ضمان إسكرو آمن\n'
            '٣. المقاولون والمهندسون ينفذون الأعمال مع إثباتات مكانية حيّة\n'
            '٤. الأموال تُفرَج فقط بعد التحقق من الإنجاز بالصور و GPS',
          ),
          const SizedBox(height: 14),

          // Values
          _sectionCard(colors, icon: PhosphorIconsRegular.shieldCheck, title: context.tr('str_6874f4fa'), body:
            '• الشفافية الجذرية — كل معاملة مرئية ومتتبَّعة\n'
            '• الأمان المالي — إسكرو معتمد، لا تحويلات مباشرة\n'
            '• إثبات الواقع — تحقق GPS + SHA-256 للصور\n'
            '• العدالة — نظام مطابقة ذكي يمنع تضارب المصالح',
          ),
          const SizedBox(height: 14),

          // Standards
          _sectionCard(colors, icon: PhosphorIconsRegular.warningCircle, title: 'المعايير الدولية', body:
            '• OCDS — معيار البيانات المفتوحة للتعاقد\n'
            '• FIDIC 13.8 — تعديل الأسعار الديناميكي\n'
            '• OFAC GL25 / FATF 8 — فحص العقوبات\n'
            '• ISO 25010 — جودة البرمجيات البلاتينية',
          ),
          const SizedBox(height: 24),

          // Links
          _linkTile(colors, PhosphorIconsRegular.warningCircle, 'سياسة الخصوصية', 'https://nammerha.com/privacy'),
          _linkTile(colors, PhosphorIconsRegular.fileText, 'شروط الاستخدام', 'https://nammerha.com/terms'),
          _linkTile(colors, PhosphorIconsRegular.warningCircle, 'البيانات المفتوحة (OCDS)', 'https://nammerha.com/open-data'),
          const SizedBox(height: 20),

          // Copyright
          Center(child: Text(
            '© ${DateTime.now().year} نعمّرها — جميع الحقوق محفوظة',
            style: TextStyle(fontSize: 11, color: colors.textSubtle),
          )),
          const SizedBox(height: 20),
        ]),
      ),
    );
  }

  Widget _sectionCard(SemanticColors colors, {required IconData icon, required String title, required String body}) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(width: 36, height: 36,
            decoration: BoxDecoration(color: colors.primaryBrand.withAlpha(15), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, size: 18, color: colors.primaryBrand)),
          const SizedBox(width: 10),
          Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
        ]),
        const SizedBox(height: 12),
        Text(body, style: TextStyle(fontSize: 13, color: colors.textPrimary, height: 1.7)),
      ]),
    ).animate(delay: 200.ms).fadeIn().slideY(begin: 0.03, end: 0);
  }

  Widget _linkTile(SemanticColors colors, IconData icon, String label, String url) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: () => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication),
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(children: [
              Icon(icon, size: 20, color: colors.primaryBrand),
              const SizedBox(width: 12),
              Expanded(child: Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.textPrimary))),
              Icon(PhosphorIconsRegular.caretRight, size: 14, color: colors.textSubtle),
            ]),
          ),
        ),
      ),
    );
  }
}
