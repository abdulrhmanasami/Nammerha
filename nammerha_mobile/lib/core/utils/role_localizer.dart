import 'package:phosphor_flutter/phosphor_flutter.dart';
// ══════════════════════════════════════════════════════════════════════
// Nammerha — Role Localizer Utility
// Maps English role codes to Arabic display names and metadata.
// Single source of truth — used by dashboard and profile.
// ══════════════════════════════════════════════════════════════════════
import 'package:flutter/material.dart';

class RoleMeta {
  final String nameAr;
  final String nameEn;
  final IconData icon;
  final Color color;

  const RoleMeta({
    required this.nameAr,
    required this.nameEn,
    required this.icon,
    required this.color,
  });
}

/// Static metadata for all platform roles.
/// Colors are from the Nammerha design system (WCAG AAA compliant).
const Map<String, RoleMeta> roleMeta = {
  // SUSPENDED: Donor role suspended indefinitely (May 2026 strategic decision)
  // 'donor': RoleMeta(
  //   nameAr: 'متبرع',
  //   nameEn: 'Donor',
  //   icon: PhosphorIconsRegular.heart,
  //   color: Color(0xFF1558D6), // Trust Blue
  // ),
  'homeowner': RoleMeta(
    nameAr: 'صاحب منزل',
    nameEn: 'Homeowner',
    icon: PhosphorIconsRegular.house,
    color: Color(0xFF0A6E55), // Smoky Jade
  ),
  'engineer': RoleMeta(
    nameAr: 'مهندس',
    nameEn: 'Engineer',
    icon: PhosphorIconsRegular.hardHat,
    color: Color(0xFF0D47A1), // Deep Trust Blue
  ),
  'contractor': RoleMeta(
    nameAr: 'مقاول',
    nameEn: 'Contractor',
    icon: PhosphorIconsRegular.wrench,
    color: Color(0xFFD59F80), // Earth Tone
  ),
  'supplier': RoleMeta(
    nameAr: 'مورّد',
    nameEn: 'Supplier',
    icon: PhosphorIconsRegular.truck,
    color: Color(0xFF085A46), // Deep Jade
  ),
  'tradesperson': RoleMeta(
    nameAr: 'صاحب مهنة',
    nameEn: 'Tradesperson',
    icon: PhosphorIconsRegular.warningCircle,
    color: Color(0xFFFCC934), // Warning Yellow
  ),
  'admin': RoleMeta(
    nameAr: 'مدير',
    nameEn: 'Admin',
    icon: PhosphorIconsRegular.warningCircle,
    color: Color(0xFF242424), // Tech Dark
  ),
  'auditor': RoleMeta(
    nameAr: 'مدقق',
    nameEn: 'Auditor',
    icon: PhosphorIconsRegular.shieldCheck,
    color: Color(0xFF242424), // Tech Dark
  ),
};

/// Returns the Arabic display name for a role code.
/// Falls back to the raw role string if unknown.
String localizeRole(String? role) {
  if (role == null || role.isEmpty) return 'مستخدم';
  return roleMeta[role.toLowerCase()]?.nameAr ?? role;
}

/// Returns the RoleMeta for a given role code.
RoleMeta? getRoleMeta(String? role) {
  if (role == null || role.isEmpty) return null;
  return roleMeta[role.toLowerCase()];
}
