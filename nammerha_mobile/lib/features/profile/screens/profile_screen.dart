import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/utils/role_localizer.dart';
import '../../auth/bloc/auth_bloc.dart';
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
            appBar: AppBar(title: const Text('الملف الشخصي')),
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.person_off_rounded, size: 64, color: colors.textSecondary),
                    const SizedBox(height: 16),
                    Text(
                      state.message,
                      style: TextStyle(color: colors.error, fontSize: 16),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 20),
                    ElevatedButton.icon(
                      onPressed: () => context.read<ProfileBloc>().add(LoadProfileRequested()),
                      icon: const Icon(Icons.refresh_rounded),
                      label: const Text('إعادة المحاولة'),
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
        _settingRow(Icons.lock_rounded, 'تغيير كلمة المرور', colors, onTap: () => _showChangePasswordSheet(colors)),
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
  bool _obscureCurrent = true;
  bool _obscureNew = true;
  bool _obscureConfirm = true;
  bool _isSubmitting = false;
  String? _errorMessage;
  int _strength = 0;

  @override
  void dispose() {
    _currentCtrl.dispose();
    _newCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  /// Calculates password strength (0-4) matching backend PASSWORD_RULES:
  /// 1. >= 8 chars  2. uppercase  3. lowercase  4. digit  5. special
  void _updateStrength(String value) {
    int s = 0;
    if (value.length >= 8) s++;
    if (RegExp(r'[A-Z]').hasMatch(value)) s++;
    if (RegExp(r'[a-z]').hasMatch(value)) s++;
    if (RegExp(r'[0-9]').hasMatch(value)) s++;
    if (RegExp(r'[^A-Za-z0-9]').hasMatch(value)) s++;
    setState(() => _strength = s);
  }

  Color _strengthColor(SemanticColors colors) {
    if (_strength <= 1) return colors.error;
    if (_strength <= 2) return const Color(0xFFFCC934);
    if (_strength <= 3) return const Color(0xFFD59F80);
    return colors.success;
  }

  String _strengthLabel() {
    if (_strength == 0) return '';
    if (_strength <= 1) return 'ضعيفة جداً';
    if (_strength <= 2) return 'ضعيفة';
    if (_strength <= 3) return 'متوسطة';
    if (_strength <= 4) return 'قوية';
    return 'ممتازة ✓';
  }

  String? _validate() {
    final current = _currentCtrl.text.trim();
    final newPwd = _newCtrl.text;
    final confirm = _confirmCtrl.text;

    if (current.isEmpty) return 'يرجى إدخال كلمة المرور الحالية';
    if (newPwd.isEmpty) return 'يرجى إدخال كلمة المرور الجديدة';
    if (newPwd.length < 8) return 'كلمة المرور يجب أن تكون 8 أحرف على الأقل';
    if (!RegExp(r'[A-Z]').hasMatch(newPwd)) return 'يجب أن تحتوي على حرف كبير واحد على الأقل';
    if (!RegExp(r'[a-z]').hasMatch(newPwd)) return 'يجب أن تحتوي على حرف صغير واحد على الأقل';
    if (!RegExp(r'[0-9]').hasMatch(newPwd)) return 'يجب أن تحتوي على رقم واحد على الأقل';
    if (!RegExp(r'[^A-Za-z0-9]').hasMatch(newPwd)) return 'يجب أن تحتوي على رمز خاص واحد على الأقل';
    if (newPwd != confirm) return 'كلمات المرور غير متطابقة';
    if (current == newPwd) return 'كلمة المرور الجديدة يجب أن تكون مختلفة';
    return null;
  }

  Future<void> _submit() async {
    final error = _validate();
    if (error != null) {
      setState(() => _errorMessage = error);
      return;
    }

    setState(() { _isSubmitting = true; _errorMessage = null; });

    context.read<AuthBloc>().add(AuthChangePasswordRequested(
      currentPassword: _currentCtrl.text.trim(),
      newPassword: _newCtrl.text,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return BlocListener<AuthBloc, AuthState>(
      listener: (ctx, state) {
        if (state is AuthPasswordChanged) {
          setState(() => _isSubmitting = false);
          Navigator.pop(context);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text('✅ تم تغيير كلمة المرور بنجاح'),
              backgroundColor: colors.success,
            ),
          );
        } else if (state is AuthError) {
          setState(() {
            _isSubmitting = false;
            _errorMessage = state.message;
          });
        } else if (state is AuthLoading) {
          setState(() => _isSubmitting = true);
        }
      },
      child: Padding(
        padding: EdgeInsets.only(
          left: 20, right: 20, top: 12, bottom: MediaQuery.of(context).viewInsets.bottom + 32,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Drag handle
              Container(
                width: 36, height: 4,
                decoration: BoxDecoration(color: colors.strokeSubtle, borderRadius: BorderRadius.circular(2)),
              ),
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
                    child: Icon(Icons.lock_rounded, color: colors.primaryBrand, size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('تغيير كلمة المرور', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: colors.textPrimary)),
                        Text('ادخل كلمة المرور الحالية والجديدة', style: TextStyle(fontSize: 12, color: colors.textSubtle)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Error message
              if (_errorMessage != null) ...[
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
                      Icon(Icons.error_outline_rounded, color: colors.error, size: 18),
                      const SizedBox(width: 8),
                      Expanded(child: Text(_errorMessage!, style: TextStyle(fontSize: 13, color: colors.error, fontWeight: FontWeight.w600))),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],

              // Current password field
              _buildPasswordField(
                controller: _currentCtrl,
                label: 'كلمة المرور الحالية',
                icon: Icons.lock_open_rounded,
                obscure: _obscureCurrent,
                onToggle: () => setState(() => _obscureCurrent = !_obscureCurrent),
                colors: colors,
              ),
              const SizedBox(height: 12),

              // New password field
              _buildPasswordField(
                controller: _newCtrl,
                label: 'كلمة المرور الجديدة',
                icon: Icons.lock_rounded,
                obscure: _obscureNew,
                onToggle: () => setState(() => _obscureNew = !_obscureNew),
                colors: colors,
                onChanged: _updateStrength,
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
                          color: i < _strength ? _strengthColor(colors) : colors.strokeSubtle,
                        ),
                      ),
                    )),
                    const SizedBox(width: 8),
                    Text(_strengthLabel(), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: _strengthColor(colors))),
                  ],
                ),
              ],
              const SizedBox(height: 12),

              // Confirm password field
              _buildPasswordField(
                controller: _confirmCtrl,
                label: 'تأكيد كلمة المرور',
                icon: Icons.lock_rounded,
                obscure: _obscureConfirm,
                onToggle: () => setState(() => _obscureConfirm = !_obscureConfirm),
                colors: colors,
              ),
              const SizedBox(height: 20),

              // Submit button
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: _isSubmitting ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: colors.primaryBrand,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    elevation: 0,
                    disabledBackgroundColor: colors.primaryBrand.withAlpha(100),
                  ),
                  child: _isSubmitting
                      ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('تغيير كلمة المرور', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                ),
              ),
              const SizedBox(height: 8),

              // Security note
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.shield_rounded, size: 14, color: colors.textSubtle),
                  const SizedBox(width: 4),
                  Text('سيتم تسجيل الخروج من الأجهزة الأخرى', style: TextStyle(fontSize: 11, color: colors.textSubtle)),
                ],
              ),
            ],
          ),
        ),
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
          icon: Icon(obscure ? Icons.visibility_off_rounded : Icons.visibility_rounded, size: 20, color: colors.textSubtle),
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

