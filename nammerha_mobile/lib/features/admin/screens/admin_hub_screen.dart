import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import '../../../core/theme/semantic_colors.dart';
import 'admin_dashboard_screen.dart';
import 'admin_escrow_screen.dart';
import 'admin_kyc_screen.dart';
import 'admin_revenue_screen.dart';
import 'admin_fintech_screen.dart';
import 'admin_oracle_screen.dart';
import '../../../core/i18n/t.dart';

/// Admin Hub — Entry point with 6 section cards.
/// Only accessible for admin/auditor roles.
class AdminHubScreen extends StatelessWidget {
  const AdminHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text(
          'لوحة الإدارة',
          style: TextStyle(
            fontWeight: FontWeight.w800,
            color: colors.textHeading,
          ),
        ),
        backgroundColor: colors.surfaceElevated,
        elevation: 0,
        centerTitle: true,
        iconTheme: IconThemeData(color: colors.textHeading),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          color: colors.primaryBrand,
          onRefresh: () async {},
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Header
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: AlignmentDirectional.topStart,
                    end: AlignmentDirectional.bottomEnd,
                    colors: [
                      colors.primaryBrand,
                      colors.primaryBrandHover,
                    ],
                  ),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Icon(PhosphorIconsRegular.shield, color: Colors.white, size: 24),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'مركز القيادة',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              Text(
                                'إدارة المنصة والحوكمة',
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.8),
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 20),

              // Grid of 6 sections
              GridView.count(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.1,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _SectionCard(
                    title: 'لوحة القيادة',
                    subtitle: 'إحصائيات المنصة',
                    icon: PhosphorIconsRegular.squaresFour,
                    accentColor: colors.primaryBrand,
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AdminDashboardScreen())),
                  ),
                  _SectionCard(
                    title: 'الضمان المالي',
                    subtitle: 'مراجعة الإثباتات',
                    icon: PhosphorIconsRegular.wallet,
                    accentColor: colors.secondaryAccent,
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AdminEscrowScreen())),
                  ),
                  _SectionCard(
                    title: 'التحقق (KYC)',
                    subtitle: 'الهوية والوثائق',
                    icon: PhosphorIconsRegular.shieldCheck,
                    accentColor: colors.warmEarth,
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AdminKycScreen())),
                  ),
                  _SectionCard(
                    title: context.tr('admin_revenue'),
                    subtitle: 'عمولات وإكراميات',
                    icon: PhosphorIconsRegular.trendUp,
                    accentColor: colors.success,
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AdminRevenueScreen())),
                  ),
                  _SectionCard(
                    title: 'الرسوم المالية',
                    subtitle: 'إعدادات ومؤسسات',
                    icon: PhosphorIconsRegular.receipt,
                    accentColor: colors.info,
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AdminFintechScreen())),
                  ),
                  _SectionCard(
                    title: 'أسعار المواد',
                    subtitle: 'أوراكل FIDIC',
                    icon: PhosphorIconsRegular.tag,
                    accentColor: colors.goldFunding,
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AdminOracleScreen())),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final Color accentColor;
  final VoidCallback onTap;

  const _SectionCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.accentColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Material(
      color: colors.surfaceElevated,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: colors.strokeBorder.withValues(alpha: 0.5)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: accentColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: accentColor, size: 22),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: colors.textHeading,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: TextStyle(
                      fontSize: 11,
                      color: colors.textMuted,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
