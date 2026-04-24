/// ══════════════════════════════════════════════════════════════════════
/// Nammerha — Role Localizer Utility
/// Maps English role codes to Arabic display names and metadata.
/// Single source of truth — used by dashboard, profile, and role switcher.
/// ══════════════════════════════════════════════════════════════════════
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
  'donor': RoleMeta(
    nameAr: 'متبرع',
    nameEn: 'Donor',
    icon: Icons.volunteer_activism_rounded,
    color: Color(0xFF1558D6), // Trust Blue
  ),
  'homeowner': RoleMeta(
    nameAr: 'صاحب منزل',
    nameEn: 'Homeowner',
    icon: Icons.home_rounded,
    color: Color(0xFF0A6E55), // Smoky Jade
  ),
  'engineer': RoleMeta(
    nameAr: 'مهندس',
    nameEn: 'Engineer',
    icon: Icons.engineering_rounded,
    color: Color(0xFF0D47A1), // Deep Trust Blue
  ),
  'contractor': RoleMeta(
    nameAr: 'مقاول',
    nameEn: 'Contractor',
    icon: Icons.construction_rounded,
    color: Color(0xFFD59F80), // Earth Tone
  ),
  'supplier': RoleMeta(
    nameAr: 'مورّد',
    nameEn: 'Supplier',
    icon: Icons.local_shipping_rounded,
    color: Color(0xFF085A46), // Deep Jade
  ),
  'tradesperson': RoleMeta(
    nameAr: 'صاحب مهنة',
    nameEn: 'Tradesperson',
    icon: Icons.plumbing_rounded,
    color: Color(0xFFFCC934), // Warning Yellow
  ),
  'admin': RoleMeta(
    nameAr: 'مدير',
    nameEn: 'Admin',
    icon: Icons.admin_panel_settings_rounded,
    color: Color(0xFF242424), // Tech Dark
  ),
  'auditor': RoleMeta(
    nameAr: 'مدقق',
    nameEn: 'Auditor',
    icon: Icons.verified_user_rounded,
    color: Color(0xFF242424), // Tech Dark
  ),
};

/// Returns the Arabic display name for a role code.
/// Falls back to the raw role string if unknown.
String localizeRole(String? role) {
  if (role == null || role.isEmpty) return 'متبرع';
  return roleMeta[role.toLowerCase()]?.nameAr ?? role;
}

/// Returns the RoleMeta for a given role code.
RoleMeta? getRoleMeta(String? role) {
  if (role == null || role.isEmpty) return roleMeta['donor'];
  return roleMeta[role.toLowerCase()];
}
