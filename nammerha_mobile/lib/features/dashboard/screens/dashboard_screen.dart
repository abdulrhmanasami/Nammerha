import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/glass_card.dart';
import '../../../core/services/api_services.dart';
// UNIFIED: NammerhaApiClient, role_localizer, AuthBloc imports removed
// (were used by the now-removed role-switcher bottom sheet)
import '../../auth/repositories/auth_repository.dart';
import '../bloc/dashboard_home_bloc.dart';
import '../../profile/screens/profile_screen.dart';
import '../../profile/bloc/profile_bloc.dart';
import '../../notifications/screens/notifications_screen.dart';
import '../../spatial_proof/screens/spatial_camera_screen.dart';
import '../../wallet/screens/wallet_screen.dart';
import '../../open_data/screens/open_data_screen.dart';
import '../../damage_report/screens/damage_report_screen.dart';
import '../../admin/screens/admin_hub_screen.dart';
import '../../admin/screens/admin_dashboard_screen.dart';
import '../../admin/screens/admin_escrow_screen.dart';
import '../../admin/screens/admin_kyc_screen.dart';
import '../../project/screens/marketplace_screen.dart';
import '../../cart/state/cart_store.dart';
import '../../cart/screens/cart_screen.dart';
import '../../../core/widgets/connectivity_banner.dart';
import 'package:shimmer/shimmer.dart';
// UNIFIED: ContractorPortalScreen, TradespersonPortalScreen — features accessible via unified tabs
import '../../../core/i18n/t.dart';
import '../../../core/bloc/page_index_cubit.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';

class DashboardScreen extends StatefulWidget {
  final NammerhaUser user;
  final VoidCallback? onLogout;
  const DashboardScreen({super.key, required this.user, this.onLogout});

  /// Convenience getter for legacy role string
  String get role => user.role.toUpperCase();

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  // ═══════════════════════════════════════════════════════════════════════════
  // UNIFIED DASHBOARD: All users see the same navigation.
  // Admin/Auditor get admin-specific pages. Everyone else gets unified tabs.
  // No role switching — all tools accessible from Quick Actions.
  // ═══════════════════════════════════════════════════════════════════════════

  bool get _isAdmin => widget.role == 'ADMIN' || widget.role == 'AUDITOR';

  List<Widget> _getPages() {
    if (_isAdmin) {
      return [
        _DashboardHome(role: widget.role, userName: widget.user.fullName),
        const AdminHubScreen(),
        BlocProvider(
          create: (_) => ProfileBloc(),
          child: const ProfileScreen(),
        ),
      ];
    }
    // Unified layout for ALL non-admin users
    return [
      _DashboardHome(role: 'UNIFIED', userName: widget.user.fullName),
      const MarketplaceScreen(),
      const WalletScreen(),
      const OpenDataScreen(),
      BlocProvider(create: (_) => ProfileBloc(), child: const ProfileScreen()),
    ];
  }

  List<BottomNavigationBarItem> _getNavItems() {
    if (_isAdmin) {
      return [
        BottomNavigationBarItem(
          icon: Icon(PhosphorIconsRegular.squaresFour),
          label: context.tr('nav_home'),
        ),
        BottomNavigationBarItem(
          icon: Icon(PhosphorIconsRegular.shield),
          label: context.tr('nav_admin'),
        ),
        BottomNavigationBarItem(
          icon: Icon(PhosphorIconsRegular.user),
          label: context.tr('nav_profile'),
        ),
      ];
    }
    // Unified navigation for ALL non-admin users
    return [
      BottomNavigationBarItem(
        icon: Icon(PhosphorIconsRegular.squaresFour),
        label: context.tr('nav_home'),
      ),
      BottomNavigationBarItem(
        icon: Icon(PhosphorIconsRegular.compass),
        label: context.tr('nav_discover'),
      ),
      BottomNavigationBarItem(
        icon: Icon(PhosphorIconsRegular.wallet),
        label: context.tr('nav_wallet'),
      ),
      BottomNavigationBarItem(
        icon: Icon(PhosphorIconsRegular.warningCircle),
        label: context.tr('nav_impact'),
      ),
      BottomNavigationBarItem(
        icon: Icon(PhosphorIconsRegular.user),
        label: context.tr('nav_profile'),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final pages = _getPages();
    final navItems = _getNavItems();

    return BlocProvider(
      create: (_) => PageIndexCubit(),
      child: BlocBuilder<PageIndexCubit, int>(
        builder: (context, currentIndex) {
          final safeIndex = currentIndex >= pages.length ? 0 : currentIndex;
          return Scaffold(
            body: IndexedStack(index: safeIndex, children: pages),
            bottomNavigationBar: Container(
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(color: context.colors.strokeSubtle, width: 1),
                ),
              ),
              child: BottomNavigationBar(
                currentIndex: safeIndex,
                onTap: (i) {
                  HapticFeedback.lightImpact();
                  context.read<PageIndexCubit>().setPage(i);
                },
                items: navItems,
              ),
            ),
          );
        },
      ),
    );
  }
}

// ─── DASHBOARD HOME TAB ─────────────────────────────────────────
// PLATINUM v2: Fully BLoC-driven — zero setState, zero direct API calls.
// DashboardHomeBloc is provided locally here and dispatches LoadDashboardHome
// on first build. RefreshIndicator re-dispatches the same event.
class _DashboardHome extends StatelessWidget {
  final String role;
  final String userName;
  const _DashboardHome({required this.role, required this.userName});

  @override
  Widget build(BuildContext context) {
    return BlocProvider<DashboardHomeBloc>(
      create: (_) => DashboardHomeBloc()..add(LoadDashboardHome(role)),
      child: _DashboardHomeView(role: role, userName: userName),
    );
  }
}

/// Inner view widget — consumes DashboardHomeBloc. Zero setState.
class _DashboardHomeView extends StatelessWidget {
  final String role;
  final String userName;
  const _DashboardHomeView({required this.role, required this.userName});

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      body: SafeArea(
        child: BlocBuilder<DashboardHomeBloc, DashboardHomeState>(
          builder: (context, state) {
            final isLoading =
                state is DashboardHomeLoading || state is DashboardHomeInitial;
            final stats = state is DashboardHomeLoaded
                ? state.stats
                : <String, dynamic>{};
            final recentActivity = state is DashboardHomeLoaded
                ? state.recentActivity
                : <Map<String, dynamic>>[];
            final isLoadingActivity = isLoading;

            return ConnectivityBanner(
              child: RefreshIndicator(
                onRefresh: () async {
                  context.read<DashboardHomeBloc>().add(
                    LoadDashboardHome(role),
                  );
                },
                color: colors.primaryBrand,
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsetsDirectional.fromSTEB(20, 16, 20, 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Header
                      Row(
                            children: [
                              Container(
                                width: 52,
                                height: 52,
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    colors: [
                                      colors.primaryBrand,
                                      colors.secondaryAccent,
                                    ],
                                  ),
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                child: Center(
                                  child: Text(
                                    userName.isNotEmpty ? userName[0] : 'U',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 22,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      _timeAwareGreeting(context, userName),
                                      style: TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.w700,
                                        color: colors.textPrimary,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    // UNIFIED: Simple welcome subtitle — no role switching
                                    Text(
                                      context.tr('dashboard_subtitle_default'),
                                      style: TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w500,
                                        color: colors.textSecondary,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              // Cart Badge Icon
                              ListenableBuilder(
                                listenable: CartStore.instance,
                                builder: (context, _) {
                                  final count = CartStore.instance.items.length;
                                  return Stack(
                                    alignment: Alignment.center,
                                    children: [
                                      IconButton(
                                        icon: Icon(
                                          PhosphorIconsRegular.warningCircle,
                                          color: colors.textSecondary,
                                        ),
                                        onPressed: () {
                                          Navigator.push(
                                            context,
                                            MaterialPageRoute(
                                              builder: (_) =>
                                                  const CartScreen(),
                                            ),
                                          );
                                        },
                                      ),
                                      if (count > 0)
                                        PositionedDirectional(
                                          top: 8,
                                          end: 8,
                                          child: Container(
                                            padding: const EdgeInsets.all(4),
                                            decoration: BoxDecoration(
                                              color: colors.error,
                                              shape: BoxShape.circle,
                                            ),
                                            child: Text(
                                              '$count',
                                              style: const TextStyle(
                                                fontSize: 10,
                                                fontWeight: FontWeight.bold,
                                                color: Colors.white,
                                              ),
                                            ),
                                          ),
                                        ),
                                    ],
                                  );
                                },
                              ),
                              IconButton(
                                icon: Icon(
                                  PhosphorIconsRegular.warningCircle,
                                  color: colors.textSecondary,
                                ),
                                onPressed: () {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) =>
                                          const NotificationsScreen(),
                                    ),
                                  );
                                },
                              ),
                            ],
                          )
                          .animate()
                          .fadeIn(duration: 400.ms)
                          .slideY(begin: -0.1, end: 0),
                      const SizedBox(height: 28),

                      // Stats Cards
                      if (isLoading)
                        Center(
                          child: Padding(
                            padding: const EdgeInsets.all(20),
                            child: NammerhaShimmerLoader(
                              colors: colors,
                              isList: false,
                            ),
                          ),
                        )
                      else if (state is DashboardHomeError)
                        Center(
                          child: Padding(
                            padding: const EdgeInsets.all(20),
                            child: Column(
                              children: [
                                Icon(
                                  PhosphorIconsRegular.warningCircle,
                                  color: colors.error,
                                  size: 32,
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  state.message,
                                  style: TextStyle(color: colors.error),
                                ),
                              ],
                            ),
                          ),
                        )
                      else
                        _buildStatsSection(context, stats, role),
                      const SizedBox(height: 28),

                      // Workspaces (Bento Grid)
                      Text(
                        'مساحات العمل', // Fallback context.tr('workspaces') if available, but hardcoding for safety
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: colors.textPrimary,
                        ),
                      ).animate(delay: 600.ms).fadeIn(),
                      const SizedBox(height: 14),
                      if (isLoading)
                        GridView.count(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          crossAxisCount: 2,
                          mainAxisSpacing: 12,
                          crossAxisSpacing: 12,
                          childAspectRatio: 1.2,
                          children: List.generate(
                            4,
                            (index) => Shimmer.fromColors(
                              baseColor: colors.surfaceElevated,
                              highlightColor: colors.strokeSubtle,
                              child: Container(
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(16),
                                ),
                              ),
                            ),
                          ),
                        )
                      else
                        _buildWorkspacesBento(context, role),
                      const SizedBox(height: 28),

                      // Recent Activity
                      Text(
                        context.tr('recent_activity'),
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: colors.textPrimary,
                        ),
                      ).animate(delay: 800.ms).fadeIn(),
                      const SizedBox(height: 14),
                      _buildRecentActivity(
                        context,
                        role,
                        recentActivity,
                        isLoadingActivity,
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  String _timeAwareGreeting(BuildContext context, String userName) {
    final hour = DateTime.now().hour;
    String greeting;
    if (hour < 12) {
      greeting = context.tr('greeting_morning');
    } else if (hour < 18) {
      greeting = context.tr('greeting_afternoon');
    } else {
      greeting = context.tr('greeting_evening');
    }
    return '$greeting، $userName';
  }

  Widget _buildStatsSection(
    BuildContext context,
    Map<String, dynamic> stats,
    String role,
  ) {
    final colors = context.colors;

    // UNIFIED: Show combined stats for all users
    // Admin/Auditor keep their specific stats via _isAdmin check above
    final List<_StatItem> items = [
      _StatItem(
        context.tr('my_projects'),
        '${stats['total_projects'] ?? stats['totalProjects'] ?? stats['assignedProjects'] ?? stats['assigned_projects'] ?? 0}',
        PhosphorIconsRegular.warningCircle,
        colors.primaryBrand,
      ),
      _StatItem(
        'عروض نشطة',
        '${stats['pending_bids'] ?? stats['pendingBids'] ?? stats['pendingOrders'] ?? stats['pending_orders'] ?? 0}',
        PhosphorIconsRegular.gavel,
        colors.warning,
      ),
      _StatItem(
        'إثباتات مُوثّقة',
        '${stats['verifiedProofs'] ?? stats['verified_proofs'] ?? stats['proofsSeen'] ?? stats['proofs_seen'] ?? 0}',
        PhosphorIconsRegular.sealCheck,
        colors.success,
      ),
      _StatItem(
        context.tr('wallet'),
        formatCurrency(
          stats['totalRevenue'] ??
              stats['total_revenue'] ??
              stats['escrow_total'] ??
              stats['escrowTotal'] ??
              0,
        ),
        PhosphorIconsRegular.wallet,
        colors.goldFunding,
      ),
    ];

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 1.55,
      ),
      itemCount: items.length,
      itemBuilder: (context, index) {
        final item = items[index];
        return Semantics(
              // GAP-M4: Each stat card announces its label and value to TalkBack/VoiceOver
              label: '${item.label}: ${item.value}',
              child: GlassCard(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    ExcludeSemantics(
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: item.color.withAlpha(20),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(item.icon, size: 20, color: item.color),
                      ),
                    ),
                    ExcludeSemantics(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.value,
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: colors.textPrimary,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            item.label,
                            style: TextStyle(
                              fontSize: 11,
                              color: colors.textSecondary,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            )
            .animate(delay: (300 + index * 100).ms)
            .fadeIn()
            .scale(begin: const Offset(0.9, 0.9), duration: 400.ms);
      },
    );
  }

  Widget _buildWorkspacesBento(BuildContext context, String role) {
    final colors = context.colors;

    if (role == 'ADMIN' || role == 'AUDITOR') {
      final adminActions = [
        _WorkspaceItem(
          'لوحة القيادة',
          PhosphorIconsRegular.squaresFour,
          colors.primaryBrand,
          const AdminDashboardScreen(),
        ),
        _WorkspaceItem(
          context.tr('escrow_label'),
          PhosphorIconsRegular.wallet,
          colors.secondaryAccent,
          const AdminEscrowScreen(),
        ),
        _WorkspaceItem(
          'التحقق KYC',
          PhosphorIconsRegular.shieldCheck,
          colors.warmEarth,
          const AdminKycScreen(),
        ),
      ];
      return Row(
        children: List.generate(adminActions.length, (index) {
          final action = adminActions[index];
          return Expanded(
            child: Padding(
              padding: EdgeInsetsDirectional.only(
                start: index == 0 ? 0 : 6,
                end: index == adminActions.length - 1 ? 0 : 6,
              ),
              child: _buildBentoCard(context, action, index),
            ),
          );
        }),
      );
    }

    // UNIFIED BENTO GRID (Role-less Contextual Workspaces)
    final projectsWorkspace = [
      _WorkspaceItem(
        'إنشاء مشروع',
        PhosphorIconsRegular.plusCircle,
        colors.primaryBrand,
        const MarketplaceScreen(),
      ), // Using Marketplace as placeholder
      _WorkspaceItem(
        'مشاريعي',
        PhosphorIconsRegular.buildings,
        colors.primaryBrand,
        const MarketplaceScreen(),
      ),
    ];

    final tendersWorkspace = [
      _WorkspaceItem(
        'تصفح العطاءات',
        PhosphorIconsRegular.magnifyingGlass,
        colors.goldFunding,
        const MarketplaceScreen(),
      ),
      _WorkspaceItem(
        'عروضي',
        PhosphorIconsRegular.gavel,
        colors.goldFunding,
        const MarketplaceScreen(),
      ),
    ];

    final fieldWorkspace = [
      _WorkspaceItem(
        'كاميرا مكانية',
        PhosphorIconsRegular.camera,
        colors.success,
        const SpatialCameraScreen(projectId: '', itemId: ''),
      ),
      _WorkspaceItem(
        'تقرير ضرر',
        PhosphorIconsRegular.warningCircle,
        colors.warning,
        const DamageReportScreen(),
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Top Row: Projects & Tenders
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _buildBentoSection(
                context,
                'مشاريع وملكيات',
                projectsWorkspace,
                colors.primaryBrand,
                700,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildBentoSection(
                context,
                'مناقصات وتوريد',
                tendersWorkspace,
                colors.goldFunding,
                800,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        // Bottom Row: Field Tools (Full Width)
        _buildBentoSection(
          context,
          'مهام ميدانية وهندسية',
          fieldWorkspace,
          colors.success,
          900,
          isHorizontal: true,
        ),
      ],
    );
  }

  Widget _buildBentoSection(
    BuildContext context,
    String title,
    List<_WorkspaceItem> items,
    Color themeColor,
    int animDelay, {
    bool isHorizontal = false,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: themeColor.withAlpha(12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: themeColor.withAlpha(30)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: themeColor,
            ),
          ),
          const SizedBox(height: 12),
          if (isHorizontal)
            Row(
              children: List.generate(items.length, (index) {
                return Expanded(
                  child: Padding(
                    padding: EdgeInsetsDirectional.only(
                      start: index == 0 ? 0 : 6,
                      end: index == items.length - 1 ? 0 : 6,
                    ),
                    child: _buildBentoCard(
                      context,
                      items[index],
                      0,
                      isCompact: true,
                    ),
                  ),
                );
              }),
            )
          else
            Column(
              children: List.generate(items.length, (index) {
                return Padding(
                  padding: EdgeInsets.only(
                    bottom: index == items.length - 1 ? 0 : 8,
                  ),
                  child: _buildBentoCard(
                    context,
                    items[index],
                    0,
                    isFullWidth: true,
                  ),
                );
              }),
            ),
        ],
      ),
    ).animate(delay: animDelay.ms).fadeIn().slideY(begin: 0.1, end: 0);
  }

  Widget _buildBentoCard(
    BuildContext context,
    _WorkspaceItem action,
    int index, {
    bool isCompact = false,
    bool isFullWidth = false,
  }) {
    final colors = context.colors;
    return Semantics(
      label: action.label,
      button: true,
      child: GestureDetector(
        onTap: () {
          HapticFeedback.lightImpact();
          Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => action.screen),
          );
        },
        child: Container(
          padding: EdgeInsets.symmetric(
            vertical: isCompact ? 12 : 16,
            horizontal: 12,
          ),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: colors.strokeSubtle),
            boxShadow: [
              BoxShadow(
                color: colors.strokeSubtle.withAlpha(20),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: isFullWidth
              ? Row(
                  children: [
                    Icon(action.icon, color: action.color, size: 22),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        action.label,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: colors.textPrimary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                )
              : Column(
                  children: [
                    Icon(
                      action.icon,
                      color: action.color,
                      size: isCompact ? 24 : 28,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      action.label,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: colors.textPrimary,
                      ),
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
        ),
      ),
    );
  }

  Widget _buildRecentActivity(
    BuildContext context,
    String role,
    List<Map<String, dynamic>> recentActivity,
    bool isLoadingActivity,
  ) {
    final colors = context.colors;

    if (isLoadingActivity) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 40),
        child: NammerhaShimmerLoader(colors: colors),
      );
    }

    if (recentActivity.isEmpty) {
      return Container(
        padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 24),
        decoration: BoxDecoration(
          color: colors.surfaceElevated,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: colors.strokeSubtle),
        ),
        child: Column(
          children: [
            Icon(
              PhosphorIconsRegular.warningCircle,
              size: 48,
              color: colors.textSecondary.withAlpha(80),
            ),
            const SizedBox(height: 12),
            Text(
              'لا توجد نشاطات حديثة',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: colors.textSecondary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'ستظهر هنا آخر النشاطات عند بدء العمل على المشاريع',
              style: TextStyle(
                fontSize: 12,
                color: colors.textSecondary.withAlpha(150),
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ).animate(delay: 900.ms).fadeIn();
    }

    return Column(
      children: List.generate(recentActivity.length, (index) {
        final item = recentActivity[index];
        final type = item['type'] as String? ?? 'info';
        final title = item['title'] as String? ?? '';
        final body =
            item['body'] as String? ?? item['message'] as String? ?? '';
        final createdAt = item['created_at'] as String?;
        final isRead = item['is_read'] as bool? ?? false;

        final actMeta = _activityMeta(type, colors);

        String timeAgo = '';
        if (createdAt != null) {
          try {
            final diff = DateTime.now().difference(DateTime.parse(createdAt));
            if (diff.inMinutes < 60) {
              timeAgo = 'منذ ${diff.inMinutes} دقيقة';
            } else if (diff.inHours < 24) {
              timeAgo = 'منذ ${diff.inHours} ساعة';
            } else {
              timeAgo = 'منذ ${diff.inDays} يوم';
            }
          } catch (_) {}
        }

        return Container(
              margin: EdgeInsets.only(
                bottom: index < recentActivity.length - 1 ? 10 : 0,
              ),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: isRead
                    ? colors.surfaceElevated
                    : actMeta.color.withAlpha(8),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isRead
                      ? colors.strokeSubtle
                      : actMeta.color.withAlpha(30),
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: actMeta.color.withAlpha(20),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(actMeta.icon, size: 20, color: actMeta.color),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: isRead
                                ? FontWeight.w500
                                : FontWeight.w700,
                            color: colors.textPrimary,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (body.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            body,
                            style: TextStyle(
                              fontSize: 12,
                              color: colors.textSecondary,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                        if (timeAgo.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            timeAgo,
                            style: TextStyle(
                              fontSize: 10,
                              color: colors.textSubtle,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (!isRead)
                    Container(
                      width: 8,
                      height: 8,
                      margin: const EdgeInsetsDirectional.only(
                        start: 8,
                        top: 4,
                      ),
                      decoration: BoxDecoration(
                        color: actMeta.color,
                        shape: BoxShape.circle,
                      ),
                    ),
                ],
              ),
            )
            .animate(delay: (900 + index * 80).ms)
            .fadeIn()
            .slideX(begin: 0.05, end: 0);
      }),
    );
  }

  _ActivityMeta _activityMeta(String type, SemanticColors colors) {
    switch (type) {
      case 'escrow_locked':
      // SUSPENDED: donation_received removed (May 2026 strategic decision)
      case 'escrow_released':
      case 'payment_completed':
        return _ActivityMeta(PhosphorIconsRegular.lockKey, colors.success);
      case 'proof_submitted':
      case 'proof_verified':
        return _ActivityMeta(
          PhosphorIconsRegular.sealCheck,
          colors.primaryBrand,
        );
      case 'bid_received':
      case 'bid_accepted':
        return _ActivityMeta(PhosphorIconsRegular.gavel, colors.goldFunding);
      case 'project_published':
      case 'project_funded':
        return _ActivityMeta(PhosphorIconsRegular.warningCircle, colors.info);
      case 'kyc_verified':
        return _ActivityMeta(
          PhosphorIconsRegular.warningCircle,
          colors.success,
        );
      case 'kyc_rejected':
        return _ActivityMeta(PhosphorIconsRegular.warningCircle, colors.error);
      case 'order_status':
        return _ActivityMeta(PhosphorIconsRegular.truck, colors.info);
      default:
        return _ActivityMeta(PhosphorIconsRegular.bell, colors.textSecondary);
    }
  }

  // UNIFIED: _showRoleSwitcher, _showAddRoleSheet, and _activateRole
  // have been removed. Role switching is no longer a user-facing concept.
  // All users see all features through the unified dashboard tabs.
}

class _StatItem {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  const _StatItem(this.label, this.value, this.icon, this.color);
}

class _WorkspaceItem {
  final String label;
  final IconData icon;
  final Color color;
  final Widget screen;
  const _WorkspaceItem(this.label, this.icon, this.color, this.screen);
}

class _ActivityMeta {
  final IconData icon;
  final Color color;
  const _ActivityMeta(this.icon, this.color);
}
