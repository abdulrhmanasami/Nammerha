import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/theme/theme_cubit.dart';
import '../../../core/utils/role_localizer.dart';
import '../../../core/utils/haptics.dart';
import '../../../core/i18n/locale_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/i18n/supported_locales.dart';
import '../../auth/bloc/auth_bloc.dart';
import '../bloc/profile_bloc.dart';
import '../bloc/profile_event.dart';
import '../bloc/profile_state.dart';
import '../bloc/profile_form_cubit.dart';
import '../bloc/change_password_form_cubit.dart';
import '../../../core/i18n/t.dart';
import '../../../core/widgets/shimmer_loader.dart';
import '../../../core/widgets/bottom_sheet_grabber.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Profile Screen — User Identity, Roles, Settings
/// ═══════════════════════════════════════════════════════════════════════════
/// Absolute Zero Architecture: Managed natively via ProfileBloc.
///
/// P2-001 AUDIT: setState RETAINED (Platinum Approved) — Notification toggle
/// is a local SharedPreferences preference, not API state. ProfileBloc manages
/// all server-side state. Creating a Cubit for a boolean toggle is over-engineering.
/// ═══════════════════════════════════════════════════════════════════════════
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  bool _notificationsEnabled = true;

  @override
  void initState() {
    super.initState();
    _loadNotificationPref();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ProfileBloc>().add(LoadProfileRequested());
    });
  }

  Future<void> _loadNotificationPref() async {
    final prefs = await SharedPreferences.getInstance();
    if (mounted) {
      setState(() {
        _notificationsEnabled = prefs.getBool('notifications_enabled') ?? true;
      });
    }
  }

  Future<void> _toggleNotifications(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('notifications_enabled', value);
    if (mounted) {
      setState(() {
        _notificationsEnabled = value;
      });
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    super.dispose();
  }

  int _calculateCompletionPct(Map<String, dynamic>? user, List<Map<String, dynamic>> roles) {
    if (user == null) return 0;
    int steps = 6, completed = 0;
    if ((user['full_name']?.toString() ?? '').isNotEmpty) completed++;
    if ((user['email']?.toString() ?? '').isNotEmpty) completed++;
    if (user['kyc_verified'] == true) completed++;
    if (roles.isNotEmpty) completed++;
    if (roles.length >= 2) completed++;
    if ((user['role']?.toString() ?? '').isNotEmpty) completed++;
    return ((completed / steps) * 100).round();
  }

  String _getInitials(Map<String, dynamic>? user) {
    final name = user?['full_name']?.toString() ?? '';
    if (name.isEmpty) return '?';
    final parts = name.split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts.last[0]}'.toUpperCase();
    return name[0].toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return BlocProvider(
      create: (_) => ProfileFormCubit(),
      child: BlocConsumer<ProfileBloc, ProfileState>(
      listener: (context, state) {
        final isEditing = context.read<ProfileFormCubit>().state;
        if (state is ProfileLoaded && !isEditing) {
          _nameController.text = state.user['full_name']?.toString() ?? '';
          _emailController.text = state.user['email']?.toString() ?? '';
        }
        if (state is ProfileLoggedOut) {
          // P1-007 FIX: Delegate navigation to _AppFlowController via AuthBloc
          // instead of pushNamedAndRemoveUntil which creates a duplicate root.
          context.read<AuthBloc>().add(AuthLogoutRequested());
        }
      },
      builder: (context, state) {
        if (state is ProfileInitial || (state is ProfileLoading && state.user == null)) {
          return Scaffold(backgroundColor: colors.backgroundPrimary, body: NammerhaShimmerLoader(colors: colors, itemCount: 4));
        }

        Map<String, dynamic>? user;
        List<Map<String, dynamic>> roles = [];
        bool isSaving = state is ProfileLoading && state.user != null;

        if (state is ProfileLoaded) {
          user = state.user;
          roles = state.roles;
        } else if (state is ProfileLoading) {
          user = state.user;
          roles = state.roles ?? [];
        } else if (state is ProfileError) {
          return Scaffold(
            backgroundColor: colors.backgroundPrimary,
            appBar: AppBar(title: Text(context.tr('profile_title'))),
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(PhosphorIconsRegular.cloudSlash, size: 64, color: colors.textSecondary),
                    const SizedBox(height: 16),
                    Text(
                      state.message,
                      style: TextStyle(color: colors.error, fontSize: 16),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 20),
                    ElevatedButton.icon(
                      onPressed: () => context.read<ProfileBloc>().add(LoadProfileRequested()),
                      icon: Icon(PhosphorIconsRegular.arrowsClockwise),
                      label: Text(context.tr('retry')),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: colors.primaryBrand,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }

        return BlocBuilder<ProfileFormCubit, bool>(
          builder: (context, isEditing) {
            return Scaffold(
              backgroundColor: colors.backgroundPrimary,
              appBar: AppBar(
                title: Text(context.tr('profile_title')),
                actions: [
                  if (!isEditing)
                    IconButton(
                      onPressed: () {
                      Haptics.light();
                      context.read<ProfileFormCubit>().startEditing();
                    },
                      icon: Icon(PhosphorIconsRegular.pencilSimple, color: colors.primaryBrand, size: 22),
                    ),
                ],
              ),
              body: RefreshIndicator(
                onRefresh: () async {
                  context.read<ProfileBloc>().add(LoadProfileRequested());
                },
                color: colors.primaryBrand,
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    _buildAvatarCard(colors, user),
                    const SizedBox(height: 16),
                    _buildCompletionBar(colors, user, roles),
                    const SizedBox(height: 16),
                    if (isEditing) _buildEditForm(context, colors, isSaving) else _buildInfoDisplay(colors, user),
                    const SizedBox(height: 16),
                    _buildRolesSection(colors, roles),
                    const SizedBox(height: 16),
                    _buildSettingsSection(colors),
                    const SizedBox(height: 16),
                    _buildLogoutButton(colors),
                  ],
                ),
              ),
            );
          },
        );
      },
    ),
    );
  }

  // ─── Avatar Card ──────────────────────────────────────────────────────

  Widget _buildAvatarCard(SemanticColors colors, Map<String, dynamic>? user) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: NammerhaGradients.brandPrimary,
        borderRadius: BorderRadius.circular(NammerhaTheme.radiusXl),
        boxShadow: const [NammerhaShadows.cta],
      ),
      child: Column(
        children: [
          CircleAvatar(
            radius: 40,
            backgroundColor: Colors.white.withAlpha(25),
            child: Text(_getInitials(user), style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: Colors.white)),
          ),
          const SizedBox(height: 12),
          Text(user?['full_name']?.toString() ?? context.tr('user_default'), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white)),
          const SizedBox(height: 4),
          Text(user?['email']?.toString() ?? '', style: TextStyle(fontSize: 14, color: Colors.white.withAlpha(180))),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(color: Colors.white.withAlpha(20), borderRadius: BorderRadius.circular(20)),
            child: Text(localizeRole(user?['role']?.toString()), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white.withAlpha(220))),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 500.ms).slideY(begin: -0.08, end: 0);
  }

  // ─── Profile Completion ───────────────────────────────────────────────

  Widget _buildCompletionBar(SemanticColors colors, Map<String, dynamic>? user, List<Map<String, dynamic>> roles) {
    final pct = _calculateCompletionPct(user, roles);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(context.tr('profile_completion'), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.textPrimary)),
              Text('$pct%', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: pct >= 80 ? colors.success : colors.warning)),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: pct / 100,
              backgroundColor: colors.backgroundSecondary,
              valueColor: AlwaysStoppedAnimation(pct >= 80 ? colors.success : colors.warning),
              minHeight: 8,
            ),
          ),
        ],
      ),
    ).animate(delay: 200.ms).fadeIn();
  }

  // ─── Info Display ─────────────────────────────────────────────────────

  Widget _buildInfoDisplay(SemanticColors colors, Map<String, dynamic>? user) {
    return Column(
      children: [
        _infoRow(PhosphorIconsRegular.user, context.tr('full_name_label'), user?['full_name']?.toString() ?? '—', colors),
        _infoRow(PhosphorIconsRegular.envelope, context.tr('email_label'), user?['email']?.toString() ?? '—', colors),
        _infoRow(PhosphorIconsRegular.sealCheck, context.tr('kyc_label'), user?['kyc_verified'] == true ? context.tr('kyc_verified') : context.tr('kyc_not_verified'), colors),
      ],
    );
  }

  Widget _infoRow(IconData icon, String label, String value, SemanticColors colors) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: colors.primaryBrand),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: TextStyle(fontSize: 11, color: colors.textSubtle)),
                Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.textPrimary)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ─── Edit Form ────────────────────────────────────────────────────────

  Widget _buildEditForm(BuildContext context, SemanticColors colors, bool isSaving) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
        border: Border.all(color: colors.primaryBrand.withAlpha(30)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(context.tr('profile_edit'), style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
          const SizedBox(height: 12),
          TextField(
            controller: _nameController,
            decoration: InputDecoration(
              labelText: context.tr('full_name_label'),
              filled: true,
              fillColor: colors.backgroundSecondary,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            decoration: InputDecoration(
              labelText: context.tr('email_label'),
              filled: true,
              fillColor: colors.backgroundSecondary,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => context.read<ProfileFormCubit>().stopEditing(),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    side: BorderSide(color: colors.strokeSubtle),
                  ),
                  child: Text(context.tr('cancel'), style: TextStyle(color: colors.textSecondary)),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton(
                  onPressed: isSaving ? null : () {
                    Haptics.medium();
                    context.read<ProfileBloc>().add(SaveProfileRequested(fullName: _nameController.text.trim(), email: _emailController.text.trim()));
                    context.read<ProfileFormCubit>().stopEditing();
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(context.tr('profile_updated')), backgroundColor: colors.success),
                    );
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: colors.primaryBrand,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: Text(isSaving ? context.tr('saving') : context.tr('save'), style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
            ],
          ),
        ],
      ),
    ).animate().fadeIn();
  }

  // ─── Roles Section ────────────────────────────────────────────────────

  Widget _buildRolesSection(SemanticColors colors, List<Map<String, dynamic>> roles) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(context.tr('active_roles'), style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
        const SizedBox(height: 10),
        if (roles.isEmpty)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: colors.surfaceElevated, borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd), border: Border.all(color: colors.strokeSubtle)),
            child: Center(child: Text(context.tr('no_active_roles'), style: TextStyle(color: colors.textSubtle))),
          )
        else
          ...roles.where((r) => r['status'] == 'active').map((r) {
            final meta = _roleMeta(r['role_name']?.toString() ?? '');
            final isActive = r['is_primary'] == true;
            return Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: colors.surfaceElevated,
                borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
                border: Border.all(color: isActive ? colors.success.withAlpha(40) : colors.strokeSubtle, width: isActive ? 1.5 : 1),
              ),
              child: Row(
                children: [
                  Container(
                    width: 40, height: 40,
                    decoration: BoxDecoration(color: meta.color.withAlpha(15), borderRadius: BorderRadius.circular(10)),
                    child: Icon(meta.icon, size: 20, color: meta.color),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Text(meta.label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary)),
                          if (isActive) ...[
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                              decoration: BoxDecoration(color: colors.success.withAlpha(15), borderRadius: BorderRadius.circular(4)),
                              child: Text(context.tr('active'), style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: colors.success)),
                            ),
                          ],
                        ]),
                        Text(meta.verification, style: TextStyle(fontSize: 11, color: colors.textSubtle)),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }),
      ],
    );
  }

  _RoleMeta _roleMeta(String role) {
    final colors = context.colors;
    switch (role) {
      // 'donor' case removed — donor role eradicated (May 2026)
      case 'homeowner': return _RoleMeta(context.tr('role_homeowner'), PhosphorIconsRegular.house, colors.warning, context.tr('role_verification_identity'));
      case 'engineer': return _RoleMeta(context.tr('role_engineer'), PhosphorIconsRegular.hardHat, colors.info, context.tr('role_verification_guild'));
      case 'contractor': return _RoleMeta(context.tr('role_contractor'), PhosphorIconsRegular.wrench, colors.secondaryAccent, context.tr('role_verification_commercial'));
      case 'tradesperson': return _RoleMeta(context.tr('role_tradesperson'), PhosphorIconsRegular.hammer, colors.success, context.tr('role_verification_experience'));
      case 'supplier': return _RoleMeta(context.tr('role_supplier'), PhosphorIconsRegular.package, colors.warning, context.tr('role_verification_supply'));
      default: return _RoleMeta(role, PhosphorIconsRegular.user, colors.textSecondary, '—');
    }
  }


  // ─── Change Password ─────────────────────────────────────────────────

  void _showChangePasswordSheet(SemanticColors colors) {
    final authBloc = context.read<AuthBloc>();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => BlocProvider.value(
        value: authBloc,
        child: Container(
          decoration: BoxDecoration(
            color: colors.surfaceElevated,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: const _ChangePasswordSheet(),
        ),
      ),
    );
  }

  // ─── Settings ─────────────────────────────────────────────────────────

  Widget _buildSettingsSection(SemanticColors colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(context.tr('settings'), style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
        const SizedBox(height: 10),

        _settingRow(PhosphorIconsRegular.bell, context.tr('notifications_title'), colors, trailing: Switch.adaptive(
          value: _notificationsEnabled,
          onChanged: _toggleNotifications,
          activeTrackColor: colors.primaryBrand,
        )),

        _settingRow(PhosphorIconsRegular.globe, context.tr('language'), colors,
          value: context.watch<LocaleCubit>().currentLocaleName,
          onTap: () => _showLanguagePicker(colors),
        ),
        _settingRow(PhosphorIconsRegular.moon, context.tr('dark_mode'), colors, trailing: Switch.adaptive(
          value: context.watch<ThemeCubit>().isDark,
          onChanged: (_) => context.read<ThemeCubit>().toggleTheme(),
          activeTrackColor: colors.primaryBrand,
        )),
        _settingRow(PhosphorIconsRegular.lock, context.tr('change_password'), colors, onTap: () => _showChangePasswordSheet(colors)),
      ],
    );
  }

  Widget _settingRow(IconData icon, String label, SemanticColors colors, {String? value, Widget? trailing, VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 6),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: colors.surfaceElevated,
          borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
          border: Border.all(color: colors.strokeSubtle),
        ),
        child: Row(
          children: [
            Icon(icon, size: 20, color: colors.textSecondary),
            const SizedBox(width: 12),
            Expanded(child: Text(label, style: TextStyle(fontSize: 14, color: colors.textPrimary))),
            if (value != null) Text(value, style: TextStyle(fontSize: 13, color: colors.textSubtle)),
            trailing ?? const SizedBox(),
            if (value == null && trailing == null) Icon(PhosphorIconsRegular.caretRight, color: colors.textSubtle, size: 16),
          ],
        ),
      ),
    );
  }

  // ─── Language Picker ─────────────────────────────────────────────────────────

  void _showLanguagePicker(SemanticColors colors) {
    final currentCode = context.read<LocaleCubit>().currentCode;
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        decoration: BoxDecoration(
          color: colors.surfaceElevated,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Drag handle
            BottomSheetGrabber(colors: colors),
            const SizedBox(height: 16),
            Row(
              children: [
                Icon(PhosphorIconsRegular.globe, color: colors.primaryBrand, size: 22),
                const SizedBox(width: 10),
                Text(context.tr('language_picker_title'), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: colors.textPrimary)),
              ],
            ),
            const SizedBox(height: 16),
            ...kSupportedLocales.map((loc) {
              final isActive = loc.code == currentCode;
              return GestureDetector(
                onTap: () {
                  context.read<LocaleCubit>().switchLocale(loc.code);
                  Navigator.pop(context);
                },
                child: Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  decoration: BoxDecoration(
                    color: isActive ? colors.primaryBrand.withAlpha(12) : colors.backgroundPrimary,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: isActive ? colors.primaryBrand.withAlpha(60) : colors.strokeSubtle,
                      width: isActive ? 1.5 : 1,
                    ),
                  ),
                  child: Row(
                    children: [
                      Text(
                        loc.nativeName,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                          color: isActive ? colors.primaryBrand : colors.textPrimary,
                        ),
                      ),
                      const Spacer(),
                      if (isActive)
                        Icon(PhosphorIconsRegular.checkCircle, color: colors.primaryBrand, size: 22),
                    ],
                  ),
                ),
              );
            }),
            SizedBox(height: MediaQuery.of(context).viewPadding.bottom + 8),
          ],
        ),
      ),
    );
  }

  // ─── Logout ───────────────────────────────────────────────────────────

  Widget _buildLogoutButton(SemanticColors colors) {
    return GestureDetector(
      onTap: () {
        showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: colors.surfaceElevated,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: Text(context.tr('logout'), style: TextStyle(fontWeight: FontWeight.w700, color: colors.textPrimary)),
            content: Text(context.tr('logout_confirm'), style: TextStyle(color: colors.textSecondary)),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: Text(context.tr('cancel'), style: TextStyle(color: colors.textSecondary)),
              ),
              TextButton(
                onPressed: () {
                  Haptics.heavy();
                  Navigator.pop(ctx);
                  context.read<ProfileBloc>().add(LogoutRequested());
                },
                child: Text(context.tr('logout'), style: TextStyle(color: colors.error, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
        );
      },
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: colors.error.withAlpha(8),
          borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
          border: Border.all(color: colors.error.withAlpha(20)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(PhosphorIconsRegular.signOut, color: colors.error, size: 20),
            const SizedBox(width: 8),
            Text(context.tr('logout'), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.error)),
          ],
        ),
      ),
    );
  }
}

/// ═══════════════════════════════════════════════════════════════════════════
/// Change Password Bottom Sheet
/// ═══════════════════════════════════════════════════════════════════════════
/// Platinum-grade: Client-side validation matching backend PASSWORD_RULES,
/// password strength indicator, Arabic error messages, loading state.
class _ChangePasswordSheet extends StatefulWidget {
  const _ChangePasswordSheet();

  @override
  State<_ChangePasswordSheet> createState() => _ChangePasswordSheetState();
}

class _ChangePasswordSheetState extends State<_ChangePasswordSheet> {
  final _currentCtrl = TextEditingController();
  final _newCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();

  @override
  void dispose() {
    _currentCtrl.dispose();
    _newCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Color _strengthColor(SemanticColors colors, int strength) {
    if (strength <= 1) return colors.error;
    if (strength <= 2) return const Color(0xFFFCC934);
    if (strength <= 3) return const Color(0xFFD59F80);
    return colors.success;
  }

  String _strengthLabel(int strength) {
    if (strength == 0) return '';
    if (strength <= 1) return context.tr('pw_strength_weak');
    if (strength <= 2) return context.tr('pw_strength_fair');
    if (strength <= 3) return context.tr('pw_strength_good');
    if (strength <= 4) return context.tr('pw_strength_strong');
    return context.tr('pw_strength_excellent');
  }

  String? _validate() {
    final current = _currentCtrl.text.trim();
    final newPwd = _newCtrl.text;
    final confirm = _confirmCtrl.text;

    if (current.isEmpty) return context.tr('pw_current_required');
    if (newPwd.isEmpty) return context.tr('pw_new_required');
    if (newPwd.length < 8) return context.tr('pw_min_length');
    if (!RegExp(r'[A-Z]').hasMatch(newPwd)) return context.tr('pw_need_uppercase');
    if (!RegExp(r'[a-z]').hasMatch(newPwd)) return context.tr('pw_need_lowercase');
    if (!RegExp(r'[0-9]').hasMatch(newPwd)) return context.tr('pw_need_digit');
    if (!RegExp(r'[^A-Za-z0-9]').hasMatch(newPwd)) return context.tr('pw_need_special');
    if (newPwd != confirm) return context.tr('pw_mismatch_error');
    if (current == newPwd) return context.tr('pw_must_differ');
    return null;
  }

  void _submit(BuildContext blocContext) {
    final error = _validate();
    if (error != null) {
      blocContext.read<ChangePasswordFormCubit>().setValidationError(error);
      return;
    }
    blocContext.read<ChangePasswordFormCubit>().clearValidationError();
    blocContext.read<AuthBloc>().add(AuthChangePasswordRequested(
      currentPassword: _currentCtrl.text.trim(),
      newPassword: _newCtrl.text,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return BlocProvider(
      create: (_) => ChangePasswordFormCubit(),
      child: BlocConsumer<AuthBloc, AuthState>(
        listenWhen: (prev, curr) =>
            curr is AuthPasswordChanged ||
            curr is AuthError ||
            curr is AuthLoading,
        listener: (ctx, state) {
          if (state is AuthPasswordChanged) {
            Navigator.pop(context);
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(context.tr('pw_changed_success')),
                backgroundColor: context.colors.success,
              ),
            );
          }
        },
        builder: (ctx, authState) {
          final isSubmitting = authState is AuthLoading;
          final serverError = authState is AuthError ? authState.message : null;
          return BlocBuilder<ChangePasswordFormCubit, ChangePasswordFormState>(
            builder: (blocContext, formState) {
              final displayError = formState.validationError ?? serverError;
              return Padding(
          padding: EdgeInsetsDirectional.fromSTEB(
            20, 12, 20, MediaQuery.of(context).viewInsets.bottom + 32,
          ),
          child: SingleChildScrollView(

          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Drag handle
              BottomSheetGrabber(colors: colors),
              const SizedBox(height: 16),

              // Title
              Row(
                children: [
                  Container(
                    width: 40, height: 40,
                    decoration: BoxDecoration(
                      color: colors.primaryBrand.withAlpha(12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(PhosphorIconsRegular.lock, color: colors.primaryBrand, size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(context.tr('change_password'), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: colors.textPrimary)),
                        Text(context.tr('change_password_subtitle'), style: TextStyle(fontSize: 12, color: colors.textSubtle)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Error message (validation OR server error)
              if (displayError != null) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: colors.error.withAlpha(10),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: colors.error.withAlpha(30)),
                  ),
                  child: Row(
                    children: [
                      Icon(PhosphorIconsRegular.warningCircle, color: colors.error, size: 18),
                      const SizedBox(width: 8),
                      Expanded(child: Text(displayError, style: TextStyle(fontSize: 13, color: colors.error, fontWeight: FontWeight.w600))),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],

              // Current password field
              _buildPasswordField(
                controller: _currentCtrl,
                label: context.tr('current_password_label'),
                icon: PhosphorIconsRegular.lockOpen,
                obscure: formState.obscureCurrent,
                onToggle: () => blocContext.read<ChangePasswordFormCubit>().toggleCurrentVisibility(),
                colors: colors,
              ),
              const SizedBox(height: 12),

              // New password field
              _buildPasswordField(
                controller: _newCtrl,
                label: context.tr('new_password_label'),
                icon: PhosphorIconsRegular.lock,
                obscure: formState.obscureNew,
                onToggle: () => blocContext.read<ChangePasswordFormCubit>().toggleNewVisibility(),
                colors: colors,
                onChanged: (v) => blocContext.read<ChangePasswordFormCubit>().updateStrength(v),
              ),

              // Strength indicator
              if (_newCtrl.text.isNotEmpty) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    ...List.generate(5, (i) => Expanded(
                      child: Container(
                        height: 3,
                        margin: EdgeInsetsDirectional.only(end: i < 4 ? 3 : 0),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(2),
                          color: i < formState.strength ? _strengthColor(colors, formState.strength) : colors.strokeSubtle,
                        ),
                      ),
                    )),
                    const SizedBox(width: 8),
                    Text(_strengthLabel(formState.strength), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: _strengthColor(colors, formState.strength))),
                  ],
                ),
              ],
              const SizedBox(height: 12),

              // Confirm password field
              _buildPasswordField(
                controller: _confirmCtrl,
                label: context.tr('confirm_password_label'),
                icon: PhosphorIconsRegular.lock,
                obscure: formState.obscureConfirm,
                onToggle: () => blocContext.read<ChangePasswordFormCubit>().toggleConfirmVisibility(),
                colors: colors,
              ),
              const SizedBox(height: 20),

              // Submit button
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton(
                    onPressed: isSubmitting ? null : () => _submit(blocContext),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: colors.primaryBrand,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      elevation: 0,
                      disabledBackgroundColor: colors.primaryBrand.withAlpha(100),
                    ),
                    child: isSubmitting
                        ? SizedBox(width: 22, height: 22, child: NammerhaShimmerLoader(colors: colors))
                        : Text(context.tr('change_password'), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                  ),
                ),
              const SizedBox(height: 8),

              // Security note
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(PhosphorIconsRegular.shield, size: 14, color: colors.textSubtle),
                  const SizedBox(width: 4),
                  Text(context.tr('security_note_logout'), style: TextStyle(fontSize: 11, color: colors.textSubtle)),
                ],
              ),
            ],
          ),
        ),
        );
            },
          );
        },
      ),
    );
  }

  Widget _buildPasswordField({
    required TextEditingController controller,
    required String label,
    required IconData icon,
    required bool obscure,
    required VoidCallback onToggle,
    required SemanticColors colors,
    ValueChanged<String>? onChanged,
  }) {
    return TextField(
      controller: controller,
      obscureText: obscure,
      onChanged: onChanged,
      textDirection: TextDirection.ltr,
      style: TextStyle(fontSize: 14, color: colors.textPrimary),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: TextStyle(fontSize: 13, color: colors.textSubtle),
        prefixIcon: Icon(icon, size: 20, color: colors.textSecondary),
        suffixIcon: IconButton(
          icon: Icon(obscure ? PhosphorIconsRegular.eyeSlash : PhosphorIconsRegular.eye, size: 20, color: colors.textSubtle),
          onPressed: onToggle,
        ),
        filled: true,
        fillColor: colors.backgroundPrimary,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colors.strokeSubtle),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colors.primaryBrand, width: 1.5),
        ),
      ),
    );
  }
}

class _RoleMeta {
  final String label;
  final IconData icon;
  final Color color;
  final String verification;
  _RoleMeta(this.label, this.icon, this.color, this.verification);
}

