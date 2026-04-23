import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../bloc/profile_bloc.dart';
import '../bloc/profile_event.dart';
import '../bloc/profile_state.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Profile Screen — User Identity, Roles, Settings
/// ═══════════════════════════════════════════════════════════════════════════
/// Absolute Zero Architecture: Managed natively via ProfileBloc.
/// ═══════════════════════════════════════════════════════════════════════════
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _isEditing = false;
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ProfileBloc>().add(LoadProfileRequested());
    });
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

    return BlocConsumer<ProfileBloc, ProfileState>(
      listener: (context, state) {
        if (state is ProfileLoaded && !_isEditing) {
          _nameController.text = state.user['full_name']?.toString() ?? '';
          _emailController.text = state.user['email']?.toString() ?? '';
        }
        if (state is ProfileLoggedOut) {
          Navigator.pushNamedAndRemoveUntil(context, '/', (_) => false);
        }
      },
      builder: (context, state) {
        if (state is ProfileInitial || (state is ProfileLoading && state.user == null)) {
          return Scaffold(backgroundColor: colors.backgroundPrimary, body: Center(child: CircularProgressIndicator(color: colors.primaryBrand)));
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
            body: Center(
              child: Text(state.message, style: TextStyle(color: colors.error)),
            )
          );
        }

        return Scaffold(
          backgroundColor: colors.backgroundPrimary,
          appBar: AppBar(
            title: const Text('الملف الشخصي'),
            actions: [
              if (!_isEditing)
                IconButton(
                  onPressed: () => setState(() => _isEditing = true),
                  icon: Icon(Icons.edit_rounded, color: colors.primaryBrand, size: 22),
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
                if (_isEditing) _buildEditForm(colors, isSaving) else _buildInfoDisplay(colors, user),
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
          Text(user?['full_name']?.toString() ?? 'مستخدم', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white)),
          const SizedBox(height: 4),
          Text(user?['email']?.toString() ?? '', style: TextStyle(fontSize: 14, color: Colors.white.withAlpha(180))),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(color: Colors.white.withAlpha(20), borderRadius: BorderRadius.circular(20)),
            child: Text(user?['role']?.toString() ?? 'donor', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white.withAlpha(220))),
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
              Text('اكمال الملف', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.textPrimary)),
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
        _infoRow(Icons.person_rounded, 'الاسم الكامل', user?['full_name']?.toString() ?? '—', colors),
        _infoRow(Icons.email_rounded, 'البريد الإلكتروني', user?['email']?.toString() ?? '—', colors),
        _infoRow(Icons.verified_user_rounded, 'التحقق KYC', user?['kyc_verified'] == true ? 'مُتحقق ✓' : 'غير مُتحقق', colors),
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

  Widget _buildEditForm(SemanticColors colors, bool isSaving) {
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
          Text('تعديل الملف', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
          const SizedBox(height: 12),
          TextField(
            controller: _nameController,
            decoration: InputDecoration(
              labelText: 'الاسم الكامل',
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
              labelText: 'البريد الإلكتروني',
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
                  onPressed: () => setState(() => _isEditing = false),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    side: BorderSide(color: colors.strokeSubtle),
                  ),
                  child: Text('إلغاء', style: TextStyle(color: colors.textSecondary)),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton(
                  onPressed: isSaving ? null : () {
                    context.read<ProfileBloc>().add(SaveProfileRequested(fullName: _nameController.text.trim(), email: _emailController.text.trim()));
                    setState(() => _isEditing = false);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: const Text('تم تحديث الملف بنجاح ✓'), backgroundColor: colors.success),
                    );
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: colors.primaryBrand,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: Text(isSaving ? 'جارِ الحفظ...' : 'حفظ', style: const TextStyle(fontWeight: FontWeight.w700)),
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
        Text('الأدوار النشطة', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
        const SizedBox(height: 10),
        if (roles.isEmpty)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: colors.surfaceElevated, borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd), border: Border.all(color: colors.strokeSubtle)),
            child: Center(child: Text('لا توجد أدوار مفعلة', style: TextStyle(color: colors.textSubtle))),
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
                              child: Text('نشط', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: colors.success)),
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
      case 'donor': return _RoleMeta('متبرع', Icons.volunteer_activism_rounded, colors.primaryBrand, 'تحقق مالي');
      case 'homeowner': return _RoleMeta('متضرر', Icons.house_rounded, colors.warning, 'تحقق هوية');
      case 'engineer': return _RoleMeta('مهندس', Icons.engineering_rounded, colors.info, 'رقم نقابة');
      case 'contractor': return _RoleMeta('مقاول', Icons.construction_rounded, colors.secondaryAccent, 'سجل تجاري');
      case 'tradesperson': return _RoleMeta('حرفي', Icons.handyman_rounded, colors.success, 'خبرة مهنية');
      case 'supplier': return _RoleMeta('مورّد', Icons.inventory_rounded, colors.warning, 'وثائق توريد');
      default: return _RoleMeta(role, Icons.person_rounded, colors.textSecondary, '—');
    }
  }

  // ─── Settings ─────────────────────────────────────────────────────────

  Widget _buildSettingsSection(SemanticColors colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('الإعدادات', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
        const SizedBox(height: 10),
        _settingRow(Icons.notifications_rounded, 'الإشعارات', colors, trailing: Switch.adaptive(
          value: true,
          onChanged: (_) {},
          activeTrackColor: colors.primaryBrand,
        )),
        _settingRow(Icons.language_rounded, 'اللغة', colors, value: 'العربية'),
        _settingRow(Icons.dark_mode_rounded, 'الوضع الداكن', colors, trailing: Switch.adaptive(
          value: Theme.of(context).brightness == Brightness.dark,
          onChanged: (_) {},
          activeTrackColor: colors.primaryBrand,
        )),
        _settingRow(Icons.lock_rounded, 'تغيير كلمة المرور', colors, onTap: () {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: const Text('تغيير كلمة المرور — قريباً'), backgroundColor: context.colors.info),
          );
        }),
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
            if (trailing != null) trailing,
            if (value == null && trailing == null) Icon(Icons.chevron_right_rounded, color: colors.textSubtle, size: 20),
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
            title: Text('تسجيل الخروج', style: TextStyle(fontWeight: FontWeight.w700, color: colors.textPrimary)),
            content: Text('هل أنت متأكد من تسجيل الخروج؟', style: TextStyle(color: colors.textSecondary)),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: Text('إلغاء', style: TextStyle(color: colors.textSecondary)),
              ),
              TextButton(
                onPressed: () {
                  Navigator.pop(ctx);
                  context.read<ProfileBloc>().add(LogoutRequested());
                },
                child: Text('خروج', style: TextStyle(color: colors.error, fontWeight: FontWeight.w700)),
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
            Icon(Icons.logout_rounded, color: colors.error, size: 20),
            const SizedBox(width: 8),
            Text('تسجيل الخروج', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.error)),
          ],
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

