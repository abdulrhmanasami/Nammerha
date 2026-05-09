import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/glass_card.dart';
import '../../../core/services/api_services.dart';
import '../../../core/network/api_client.dart'; // NammerhaApiClient for role activation
import '../../../core/utils/role_localizer.dart';
import '../../auth/repositories/auth_repository.dart';
import '../../auth/bloc/auth_bloc.dart';
import '../bloc/dashboard_home_bloc.dart';

import '../../search/screens/search_screen.dart';
import '../../donations/screens/donations_screen.dart';
import '../../bids/screens/bids_screen.dart';
import '../../supplier/screens/supplier_portal_screen.dart';
import '../../profile/screens/profile_screen.dart';
import '../../profile/bloc/profile_bloc.dart';
import '../../notifications/screens/notifications_screen.dart';
import '../../homeowner/screens/homeowner_projects_screen.dart';
import '../../spatial_proof/screens/spatial_camera_screen.dart';
import '../../escrow/screens/escrow_summary_screen.dart';
import '../../donor_proof/screens/donor_proof_screen.dart';
import '../../wallet/screens/wallet_screen.dart';
import '../../damage_report/screens/damage_report_screen.dart';
import '../../map/screens/project_map_screen.dart';
import '../../admin/screens/admin_hub_screen.dart';
import '../../admin/screens/admin_dashboard_screen.dart';
import '../../admin/screens/admin_escrow_screen.dart';
import '../../admin/screens/admin_kyc_screen.dart';
import '../../contractor/screens/contractor_portal_screen.dart';
import '../../tradesperson/screens/tradesperson_portal_screen.dart';
import '../../../core/i18n/t.dart';
import '../../../core/bloc/page_index_cubit.dart';

class DashboardScreen extends StatefulWidget {
  final NammerhaUser user;
  final VoidCallback? onLogout;
  const DashboardScreen({super.key, required this.user, this.onLogout});

  /// Convenience getter for legacy role string
  String get role => user.activeRole.toUpperCase();

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {

  List<Widget> _getPages() {
    switch (widget.role) {
      case 'ADMIN':
      case 'AUDITOR':
        return [
          _DashboardHome(role: widget.role, userName: widget.user.fullName),
          const AdminHubScreen(),
          BlocProvider(
            create: (_) => ProfileBloc(),
            child: const ProfileScreen(),
          ),
        ];
      case 'ENGINEER':
        return [
          _DashboardHome(role: widget.role, userName: widget.user.fullName),
          const BidsScreen(),
          BlocProvider(
            create: (_) => ProfileBloc(),
            child: const ProfileScreen(),
          ),
        ];
      case 'SUPPLIER':
        return [
          _DashboardHome(role: widget.role, userName: widget.user.fullName),
          const SupplierPortalScreen(),
          BlocProvider(
            create: (_) => ProfileBloc(),
            child: const ProfileScreen(),
          ),
        ];
      case 'HOMEOWNER':
        return [
          _DashboardHome(role: widget.role, userName: widget.user.fullName),
          const HomeownerProjectsScreen(),
          BlocProvider(
            create: (_) => ProfileBloc(),
            child: const ProfileScreen(),
          ),
        ];
      case 'CONTRACTOR':
        return [
          _DashboardHome(role: widget.role, userName: widget.user.fullName),
          const ContractorPortalScreen(),
          BlocProvider(
            create: (_) => ProfileBloc(),
            child: const ProfileScreen(),
          ),
        ];
      case 'TRADESPERSON':
        return [
          _DashboardHome(role: widget.role, userName: widget.user.fullName),
          const TradespersonPortalScreen(),
          BlocProvider(
            create: (_) => ProfileBloc(),
            child: const ProfileScreen(),
          ),
        ];
      default:
        return [
          _DashboardHome(role: widget.role, userName: widget.user.fullName),
          const SearchScreen(),
          const DonationsScreen(),
          BlocProvider(
            create: (_) => ProfileBloc(),
            child: const ProfileScreen(),
          ),
        ];
    }
  }

  List<BottomNavigationBarItem> _getNavItems() {
    switch (widget.role) {
      case 'ADMIN':
      case 'AUDITOR':
        return const [
          BottomNavigationBarItem(icon: Icon(Icons.dashboard_rounded), label: 'الرئيسية'),
          BottomNavigationBarItem(icon: Icon(Icons.shield_rounded), label: 'الإدارة'),
          BottomNavigationBarItem(icon: Icon(Icons.person_rounded), label: 'حسابي'),
        ];
      case 'ENGINEER':
        return const [
          BottomNavigationBarItem(icon: Icon(Icons.dashboard_rounded), label: 'الرئيسية'),
          BottomNavigationBarItem(icon: Icon(Icons.gavel_rounded), label: 'عروضي'),
          BottomNavigationBarItem(icon: Icon(Icons.person_rounded), label: 'حسابي'),
        ];
      case 'HOMEOWNER':
        return const [
          BottomNavigationBarItem(icon: Icon(Icons.dashboard_rounded), label: 'الرئيسية'),
          BottomNavigationBarItem(icon: Icon(Icons.home_work_rounded), label: 'المشاريع'),
          BottomNavigationBarItem(icon: Icon(Icons.person_rounded), label: 'حسابي'),
        ];
      case 'SUPPLIER':
        return const [
          BottomNavigationBarItem(icon: Icon(Icons.dashboard_rounded), label: 'الرئيسية'),
          BottomNavigationBarItem(icon: Icon(Icons.local_shipping_rounded), label: 'الطلبات'),
          BottomNavigationBarItem(icon: Icon(Icons.person_rounded), label: 'حسابي'),
        ];
      case 'CONTRACTOR':
        return const [
          BottomNavigationBarItem(icon: Icon(Icons.dashboard_rounded), label: 'الرئيسية'),
          BottomNavigationBarItem(icon: Icon(Icons.construction_rounded), label: 'عروضي'),
          BottomNavigationBarItem(icon: Icon(Icons.person_rounded), label: 'حسابي'),
        ];
      case 'TRADESPERSON':
        return const [
          BottomNavigationBarItem(icon: Icon(Icons.dashboard_rounded), label: 'الرئيسية'),
          BottomNavigationBarItem(icon: Icon(Icons.handyman_rounded), label: 'المهام'),
          BottomNavigationBarItem(icon: Icon(Icons.person_rounded), label: 'حسابي'),
        ];
      default:
        return const [
          BottomNavigationBarItem(icon: Icon(Icons.dashboard_rounded), label: 'الرئيسية'),
          BottomNavigationBarItem(icon: Icon(Icons.storefront_rounded), label: 'المشاريع'),
          BottomNavigationBarItem(icon: Icon(Icons.favorite_rounded), label: 'تبرعاتي'),
          BottomNavigationBarItem(icon: Icon(Icons.person_rounded), label: 'حسابي'),
        ];
    }
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
            body: IndexedStack(
              index: safeIndex,
              children: pages,
            ),
            bottomNavigationBar: Container(
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(color: context.colors.strokeSubtle, width: 1),
                ),
              ),
              child: BottomNavigationBar(
                currentIndex: safeIndex,
                onTap: (i) => context.read<PageIndexCubit>().setPage(i),
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
            final isLoading = state is DashboardHomeLoading || state is DashboardHomeInitial;
            final stats = state is DashboardHomeLoaded ? state.stats : <String, dynamic>{};
            final recentActivity = state is DashboardHomeLoaded ? state.recentActivity : <Map<String, dynamic>>[];
            final isLoadingActivity = isLoading;

            return RefreshIndicator(
              onRefresh: () async {
                context.read<DashboardHomeBloc>().add(LoadDashboardHome(role));
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
                              colors: [colors.primaryBrand, colors.secondaryAccent],
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
                                'أهلاً، $userName',
                                style: TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w700,
                                  color: colors.textPrimary,
                                ),
                              ),
                              const SizedBox(height: 2),
                              GestureDetector(
                                onTap: () => _showRoleSwitcher(context),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: colors.successLight,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        _getRoleLabel(role),
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                          color: colors.success,
                                        ),
                                      ),
                                      const SizedBox(width: 4),
                                      Icon(Icons.swap_horiz_rounded, size: 14, color: colors.success),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: Icon(Icons.notifications_outlined, color: colors.textSecondary),
                          onPressed: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => const NotificationsScreen()),
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
                    isLoading
                        ? Center(
                            child: Padding(
                              padding: const EdgeInsets.all(20),
                              child: CircularProgressIndicator(
                                color: colors.primaryBrand,
                                strokeWidth: 2,
                              ),
                            ),
                          )
                        : _buildStatsSection(context, stats, role),
                    const SizedBox(height: 28),

                    // Quick Actions
                    Text(
                      'إجراءات سريعة',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: colors.textPrimary,
                      ),
                    ).animate(delay: 600.ms).fadeIn(),
                    const SizedBox(height: 14),
                    _buildQuickActions(context, role),
                    const SizedBox(height: 28),

                    // Recent Activity
                    Text(
                      'آخر النشاطات',
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
            );
          },
        ),
      ),
    );
  }

  Widget _buildStatsSection(BuildContext context, Map<String, dynamic> stats, String role) {
    final colors = context.colors;

    List<_StatItem> items;
    switch (role) {
      case 'ENGINEER':
        items = [
          _StatItem('مشاريع معيّنة', '${stats['assignedProjects'] ?? stats['assigned_projects'] ?? 0}', Icons.architecture_rounded, colors.primaryBrand),
          _StatItem('إثباتات معلّقة', '${stats['pendingProofs'] ?? stats['pending_proofs'] ?? 0}', Icons.pending_actions_rounded, colors.warning),
          _StatItem('إثباتات مُوثّقة', '${stats['verifiedProofs'] ?? stats['verified_proofs'] ?? 0}', Icons.verified_rounded, colors.success),
          _StatItem(context.tr('admin_revenue'), formatCurrency(stats['totalRevenue'] ?? stats['total_revenue'] ?? 0), Icons.account_balance_wallet_rounded, colors.goldFunding),
        ];
        break;
      case 'SUPPLIER':
        items = [
          _StatItem('طلبات معلّقة', '${stats['pendingOrders'] ?? stats['pending_orders'] ?? 0}', Icons.hourglass_top_rounded, colors.warning),
          _StatItem('قيد التوصيل', '${stats['inTransit'] ?? stats['in_transit'] ?? 0}', Icons.local_shipping_rounded, colors.info),
          _StatItem('تم التسليم', '${stats['delivered'] ?? 0}', Icons.check_circle_rounded, colors.success),
          _StatItem(context.tr('admin_revenue'), formatCurrency(stats['totalRevenue'] ?? stats['total_revenue'] ?? 0), Icons.account_balance_wallet_rounded, colors.goldFunding),
        ];
        break;
      case 'HOMEOWNER':
        items = [
          _StatItem(context.tr('my_projects'), '${stats['total_projects'] ?? stats['totalProjects'] ?? 0}', Icons.home_work_rounded, colors.primaryBrand),
          _StatItem('عروض واردة', '${stats['pending_bids'] ?? stats['pendingBids'] ?? 0}', Icons.gavel_rounded, colors.warning),
          _StatItem(context.tr('str_00675587'), '${stats['funding_percentage'] ?? stats['fundingPercentage'] ?? 0}%', Icons.trending_up_rounded, colors.success),
          _StatItem(context.tr('escrow_label'), formatCurrency(stats['escrow_total'] ?? stats['escrowTotal'] ?? 0), Icons.lock_rounded, colors.goldFunding),
        ];
        break;
      default:
        items = [
          _StatItem('إجمالي التبرعات', formatCurrency(stats['totalDonated'] ?? stats['total_donated'] ?? 0), Icons.favorite_rounded, colors.primaryBrand),
          _StatItem('مشاريع نشطة', '${stats['activeProjects'] ?? stats['active_projects'] ?? 0}', Icons.home_work_rounded, colors.info),
          _StatItem('إثباتات مُستلمة', '${stats['proofsSeen'] ?? stats['proofs_seen'] ?? 0}', Icons.verified_rounded, colors.success),
          _StatItem('معدل الأثر', '${stats['impactScore'] ?? stats['impact_score'] ?? 0}%', Icons.trending_up_rounded, colors.goldFunding),
        ];
    }

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

  Widget _buildQuickActions(BuildContext context, String role) {
    final colors = context.colors;
    List<_QuickAction> actions;

    switch (role) {
      case 'ADMIN':
      case 'AUDITOR':
        actions = [
          _QuickAction('لوحة القيادة', Icons.dashboard_rounded, colors.primaryBrand, const AdminDashboardScreen()),
          _QuickAction(context.tr('escrow_label'), Icons.account_balance_wallet_rounded, colors.secondaryAccent, const AdminEscrowScreen()),
          _QuickAction('التحقق KYC', Icons.verified_user_rounded, colors.warmEarth, const AdminKycScreen()),
        ];
        break;
      case 'ENGINEER':
        actions = [
          _QuickAction('كاميرا مكانية', Icons.camera_alt_rounded, colors.primaryBrand, const SpatialCameraScreen(projectId: '', itemId: '')),
          _QuickAction('بوابة العروض', Icons.gavel_rounded, colors.info, const BidsScreen()),
          _QuickAction(context.tr('wallet'), Icons.account_balance_wallet_rounded, colors.success, const WalletScreen()),
        ];
        break;
      case 'SUPPLIER':
        actions = [
          _QuickAction('بوابة المورد', Icons.storefront_rounded, colors.warning, const SupplierPortalScreen()),
          _QuickAction('حساب الضمان', Icons.lock_rounded, colors.primaryBrand, const EscrowSummaryScreen()),
          _QuickAction('سجل التوصيل', Icons.receipt_long_rounded, colors.success, const WalletScreen()),
        ];
        break;
      case 'HOMEOWNER':
        actions = [
          _QuickAction('تقرير ضرر', Icons.report_rounded, colors.warning, const DamageReportScreen()),
          _QuickAction(context.tr('wallet'), Icons.account_balance_wallet_rounded, colors.success, const WalletScreen()),
          _QuickAction('خريطة المشاريع', Icons.map_rounded, colors.primaryBrand, const ProjectMapScreen()),
        ];
        break;
      default:
        actions = [
          _QuickAction('تصفح المشاريع', Icons.search_rounded, colors.primaryBrand, const SearchScreen()),
          _QuickAction('حساب الضمان', Icons.lock_rounded, colors.success, const EscrowSummaryScreen()),
          _QuickAction('آخر الإثباتات', Icons.verified_user_rounded, colors.info, const DonorProofScreen()),
        ];
    }

    return Row(
      children: List.generate(actions.length, (index) {
        final action = actions[index];
        return Expanded(
          child: Padding(
            padding: EdgeInsetsDirectional.only(
              start: index == 0 ? 0 : 6,
              end: index == actions.length - 1 ? 0 : 6,
            ),
            child: Semantics(
              // GAP-M4: Quick action buttons announce their label to screen readers
              label: action.label,
              button: true,
              child: GestureDetector(
                onTap: () {
                  Navigator.push(context, MaterialPageRoute(builder: (_) => action.screen));
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 18),
                  decoration: BoxDecoration(
                    color: action.color.withAlpha(12),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: action.color.withAlpha(30)),
                  ),
                  child: Column(
                    children: [
                      Icon(action.icon, color: action.color, size: 28),
                      const SizedBox(height: 8),
                      Text(
                        action.label,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: colors.textPrimary,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          )
              .animate(delay: (700 + index * 100).ms)
              .fadeIn()
              .slideY(begin: 0.2, end: 0),
        );
      }),
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
        child: Center(
          child: CircularProgressIndicator(color: colors.primaryBrand, strokeWidth: 2),
        ),
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
            Icon(Icons.inbox_rounded, size: 48, color: colors.textSecondary.withAlpha(80)),
            const SizedBox(height: 12),
            Text('لا توجد نشاطات حديثة', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: colors.textSecondary)),
            const SizedBox(height: 4),
            Text('ستظهر هنا آخر النشاطات عند بدء العمل على المشاريع', style: TextStyle(fontSize: 12, color: colors.textSecondary.withAlpha(150)), textAlign: TextAlign.center),
          ],
        ),
      ).animate(delay: 900.ms).fadeIn();
    }

    return Column(
      children: List.generate(recentActivity.length, (index) {
        final item = recentActivity[index];
        final type = item['type'] as String? ?? 'info';
        final title = item['title'] as String? ?? '';
        final body = item['body'] as String? ?? item['message'] as String? ?? '';
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
          margin: EdgeInsets.only(bottom: index < recentActivity.length - 1 ? 10 : 0),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: isRead ? colors.surfaceElevated : actMeta.color.withAlpha(8),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: isRead ? colors.strokeSubtle : actMeta.color.withAlpha(30)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40, height: 40,
                decoration: BoxDecoration(color: actMeta.color.withAlpha(20), borderRadius: BorderRadius.circular(10)),
                child: Icon(actMeta.icon, size: 20, color: actMeta.color),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: TextStyle(fontSize: 13, fontWeight: isRead ? FontWeight.w500 : FontWeight.w700, color: colors.textPrimary), maxLines: 1, overflow: TextOverflow.ellipsis),
                    if (body.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(body, style: TextStyle(fontSize: 12, color: colors.textSecondary), maxLines: 2, overflow: TextOverflow.ellipsis),
                    ],
                    if (timeAgo.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(timeAgo, style: TextStyle(fontSize: 10, color: colors.textSubtle, fontWeight: FontWeight.w500)),
                    ],
                  ],
                ),
              ),
              if (!isRead)
                Container(
                  width: 8, height: 8,
                  margin: const EdgeInsetsDirectional.only(start: 8, top: 4),
                  decoration: BoxDecoration(color: actMeta.color, shape: BoxShape.circle),
                ),
            ],
          ),
        ).animate(delay: (900 + index * 80).ms).fadeIn().slideX(begin: 0.05, end: 0);
      }),
    );
  }

  _ActivityMeta _activityMeta(String type, SemanticColors colors) {
    switch (type) {
      case 'escrow_locked': case 'donation_received': case 'escrow_released': case 'payment_completed':
        return _ActivityMeta(Icons.lock_rounded, colors.success);
      case 'proof_submitted': case 'proof_verified':
        return _ActivityMeta(Icons.verified_rounded, colors.primaryBrand);
      case 'bid_received': case 'bid_accepted':
        return _ActivityMeta(Icons.gavel_rounded, colors.goldFunding);
      case 'project_published': case 'project_funded':
        return _ActivityMeta(Icons.home_work_rounded, colors.info);
      case 'kyc_verified':
        return _ActivityMeta(Icons.badge_rounded, colors.success);
      case 'kyc_rejected':
        return _ActivityMeta(Icons.badge_rounded, colors.error);
      case 'order_status':
        return _ActivityMeta(Icons.local_shipping_rounded, colors.info);
      default:
        return _ActivityMeta(Icons.notifications_rounded, colors.textSecondary);
    }
  }

  String _getRoleLabel(String role) {
    switch (role) {
      case 'ENGINEER':
        return '🏗️ مهندس ميداني';
      case 'SUPPLIER':
        return '📦 مورّد معتمد';
      case 'HOMEOWNER':
        return '🏠 صاحب منزل';
      case 'CONTRACTOR':
        return '👷 مقاول';
      case 'TRADESPERSON':
        return '🔧 حرفي';
      default:
        return '💚 متبرع';
    }
  }

  /// Opens a bottom sheet listing all user roles, allowing the user to switch.
  /// BUG-7 FIX: Always shows the sheet (even for 1 role) and includes
  /// an "Add new role" button at the bottom.
  void _showRoleSwitcher(BuildContext context) {
    final authState = context.read<AuthBloc>().state;
    if (authState is! AuthAuthenticated) return;

    final user = authState.user;
    final userRoles = user.roles;
    final activeRole = user.activeRole;
    final colors = context.colors;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (sheetContext) {
        return Container(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          decoration: BoxDecoration(
            color: colors.surfaceElevated,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Drag handle
              Container(
                width: 36, height: 4,
                decoration: BoxDecoration(color: colors.strokeSubtle, borderRadius: BorderRadius.circular(2)),
              ),
              const SizedBox(height: 16),
              Text('تبديل الدور', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: colors.textPrimary)),
              const SizedBox(height: 4),
              Text(
                userRoles.length > 1 ? 'اختر الدور الذي تريد العمل به' : 'لديك دور واحد حالياً — يمكنك إضافة أدوار جديدة',
                style: TextStyle(fontSize: 13, color: colors.textSubtle),
              ),
              const SizedBox(height: 16),
              // ─── Current Roles ───────────────────────────────
              ...userRoles.map((role) {
                final meta = getRoleMeta(role);
                final isActive = role.toLowerCase() == activeRole.toLowerCase();
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: isActive ? null : () {
                      Navigator.pop(sheetContext);
                      context.read<AuthBloc>().add(AuthRoleSwitched(role.toLowerCase()));
                    },
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: isActive ? colors.primaryBrand.withAlpha(12) : colors.backgroundPrimary,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: isActive ? colors.primaryBrand.withAlpha(40) : colors.strokeSubtle,
                          width: isActive ? 1.5 : 1,
                        ),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 44, height: 44,
                            decoration: BoxDecoration(
                              color: (meta?.color ?? colors.primaryBrand).withAlpha(15),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Icon(meta?.icon ?? Icons.person_rounded, size: 22, color: meta?.color ?? colors.primaryBrand),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  meta?.nameAr ?? role,
                                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: colors.textPrimary),
                                ),
                                Text(
                                  meta?.nameEn ?? role,
                                  style: TextStyle(fontSize: 11, color: colors.textSubtle),
                                ),
                              ],
                            ),
                          ),
                          if (isActive)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(color: colors.success.withAlpha(15), borderRadius: BorderRadius.circular(6)),
                              child: Text(context.tr('active'), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: colors.success)),
                            )
                          else
                            Icon(Icons.arrow_forward_ios_rounded, size: 14, color: colors.textSubtle),
                        ],
                      ),
                    ),
                  ),
                );
              }),
              // ─── Add New Role Button ────────────────────────
              const SizedBox(height: 8),
              Divider(color: colors.strokeSubtle, height: 1),
              const SizedBox(height: 12),
              InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _showAddRoleSheet(context, userRoles);
                },
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: colors.backgroundPrimary,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: colors.primaryBrand.withAlpha(30), width: 1),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 44, height: 44,
                        decoration: BoxDecoration(
                          color: colors.primaryBrand.withAlpha(10),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: colors.primaryBrand.withAlpha(25), width: 1.5),
                        ),
                        child: Icon(Icons.add_rounded, size: 24, color: colors.primaryBrand),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'إضافة دور جديد',
                              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: colors.primaryBrand),
                            ),
                            Text(
                              'أضف دوراً إضافياً لحسابك',
                              style: TextStyle(fontSize: 11, color: colors.textSubtle),
                            ),
                          ],
                        ),
                      ),
                      Icon(Icons.arrow_forward_ios_rounded, size: 14, color: colors.primaryBrand),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  /// Shows the "Add New Role" bottom sheet with available roles to activate.
  void _showAddRoleSheet(BuildContext context, List<String> existingRoles) {
    final colors = context.colors;

    // Self-registerable roles (excluding admin/auditor — server-only)
    const availableRoles = ['donor', 'homeowner', 'engineer', 'contractor', 'supplier', 'tradesperson'];
    final newRoles = availableRoles.where((r) => !existingRoles.map((e) => e.toLowerCase()).contains(r)).toList();

    if (newRoles.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('لديك جميع الأدوار المتاحة بالفعل! 🎉'),
          backgroundColor: colors.success,
          duration: const Duration(seconds: 3),
        ),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (sheetContext) {
        return Container(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          decoration: BoxDecoration(
            color: colors.surfaceElevated,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 36, height: 4,
                decoration: BoxDecoration(color: colors.strokeSubtle, borderRadius: BorderRadius.circular(2)),
              ),
              const SizedBox(height: 16),
              Text('إضافة دور جديد', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: colors.textPrimary)),
              const SizedBox(height: 4),
              Text('اختر الدور الذي تريد إضافته لحسابك', style: TextStyle(fontSize: 13, color: colors.textSubtle)),
              const SizedBox(height: 16),
              ...newRoles.map((role) {
                final meta = getRoleMeta(role);
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () {
                      Navigator.pop(sheetContext);
                      _activateRole(context, role);
                    },
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: colors.backgroundPrimary,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: colors.strokeSubtle),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 44, height: 44,
                            decoration: BoxDecoration(
                              color: (meta?.color ?? colors.primaryBrand).withAlpha(15),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Icon(meta?.icon ?? Icons.person_rounded, size: 22, color: meta?.color ?? colors.primaryBrand),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  meta?.nameAr ?? role,
                                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: colors.textPrimary),
                                ),
                                Text(
                                  meta?.nameEn ?? role,
                                  style: TextStyle(fontSize: 11, color: colors.textSubtle),
                                ),
                              ],
                            ),
                          ),
                          Icon(Icons.add_circle_outline_rounded, size: 22, color: colors.primaryBrand),
                        ],
                      ),
                    ),
                  ),
                );
              }),
            ],
          ),
        );
      },
    );
  }

  /// Calls /api/roles/activate and shows result feedback.
  Future<void> _activateRole(BuildContext context, String role) async {
    final colors = context.colors;
    final meta = getRoleMeta(role);
    final authBloc = context.read<AuthBloc>();

    try {
      await authBloc.authRepository.switchRole(role); // Will fail if not activated

      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('تم تفعيل دور ${meta?.nameAr ?? role} بنجاح! ✅'),
          backgroundColor: colors.success,
          duration: const Duration(seconds: 3),
        ),
      );

      // Refresh auth state to get updated roles
      authBloc.add(AuthCheckSession());
    } catch (_) {
      // Role not activated — try the activate API
      try {
        final apiClient = NammerhaApiClient.instance;
        final response = await apiClient.request<Map<String, dynamic>>(
          '/roles/activate',
          method: 'POST',
          body: {'role': role},
          fromData: (data) => data as Map<String, dynamic>,
        );

        if (!context.mounted) return;

        if (response.success) {
          final status = response.data?['status'] as String? ?? 'active';
          if (status == 'active') {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('تم تفعيل دور ${meta?.nameAr ?? role} بنجاح! ✅'),
                backgroundColor: colors.success,
              ),
            );
            // Refresh to get updated roles
            authBloc.add(AuthCheckSession());
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('طلب تفعيل ${meta?.nameAr ?? role} قيد المراجعة — سيتم إعلامك عند الموافقة'),
                backgroundColor: colors.warning,
                duration: const Duration(seconds: 4),
              ),
            );
          }
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(response.error ?? 'فشل تفعيل الدور'),
              backgroundColor: colors.error,
            ),
          );
        }
      } catch (e) {
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('تعذّر تفعيل الدور: ${e.toString()}'),
            backgroundColor: colors.error,
          ),
        );
      }
    }
  }
}

class _StatItem {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  const _StatItem(this.label, this.value, this.icon, this.color);
}

class _QuickAction {
  final String label;
  final IconData icon;
  final Color color;
  final Widget screen;
  const _QuickAction(this.label, this.icon, this.color, this.screen);
}

class _ActivityMeta {
  final IconData icon;
  final Color color;
  const _ActivityMeta(this.icon, this.color);
}
