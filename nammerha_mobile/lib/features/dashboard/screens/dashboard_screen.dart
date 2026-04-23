import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/glass_card.dart';
import '../../../core/services/api_services.dart';
import '../../auth/repositories/auth_repository.dart';

// Feature screens
import '../../project/screens/marketplace_screen.dart';
import '../../donations/screens/donations_screen.dart';
import '../../bids/screens/bids_screen.dart';
import '../../supplier/screens/supplier_portal_screen.dart';
import '../../profile/screens/profile_screen.dart';
import '../../notifications/screens/notifications_screen.dart';
import '../../homeowner/screens/homeowner_projects_screen.dart';
import '../../spatial_proof/screens/spatial_camera_screen.dart';
import '../../escrow/screens/escrow_summary_screen.dart';
import '../../donor_proof/screens/donor_proof_screen.dart';
import '../../wallet/screens/wallet_screen.dart';

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
  int _currentIndex = 0;

  List<Widget> _getPages() {
    switch (widget.role) {
      case 'ENGINEER':
        return [
          _DashboardHome(role: widget.role, userName: widget.user.fullName),
          const BidsScreen(),
          const ProfileScreen(),
        ];
      case 'SUPPLIER':
        return [
          _DashboardHome(role: widget.role, userName: widget.user.fullName),
          const SupplierPortalScreen(),
          const ProfileScreen(),
        ];
      case 'HOMEOWNER':
        return [
          _DashboardHome(role: widget.role, userName: widget.user.fullName),
          const HomeownerProjectsScreen(),
          const ProfileScreen(),
        ];
      default:
        return [
          _DashboardHome(role: widget.role, userName: widget.user.fullName),
          const MarketplaceScreen(),
          const DonationsScreen(),
          const ProfileScreen(),
        ];
    }
  }

  List<BottomNavigationBarItem> _getNavItems() {
    switch (widget.role) {
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

    if (_currentIndex >= pages.length) _currentIndex = 0;

    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: pages,
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(color: context.colors.strokeSubtle, width: 1),
          ),
        ),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: (i) => setState(() => _currentIndex = i),
          items: navItems,
        ),
      ),
    );
  }
}

// ─── DASHBOARD HOME TAB ─────────────────────────────────────────
class _DashboardHome extends StatefulWidget {
  final String role;
  final String userName;
  const _DashboardHome({required this.role, required this.userName});

  @override
  State<_DashboardHome> createState() => _DashboardHomeState();
}

class _DashboardHomeState extends State<_DashboardHome> {
  Map<String, dynamic> _stats = {};
  bool _isLoadingStats = true;

  @override
  void initState() {
    super.initState();
    _loadStats();
  }

  Future<void> _loadStats() async {
    try {
      Map<String, dynamic> stats;
      switch (widget.role) {
        case 'ENGINEER':
          stats = await EngineerApi().getStats();
          break;
        case 'SUPPLIER':
          stats = await SupplierApi().getStats();
          break;
        case 'HOMEOWNER':
          stats = await HomeownerApi().getStats();
          break;
        default:
          stats = await DonorApi().getStats();
      }
      if (mounted) setState(() { _stats = stats; _isLoadingStats = false; });
    } catch (_) {
      if (mounted) setState(() => _isLoadingStats = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
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
                        widget.userName.isNotEmpty ? widget.userName[0] : 'U',
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
                          'أهلاً، ${widget.userName}',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: colors.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: colors.successLight,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            _getRoleLabel(widget.role),
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: colors.success,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: Icon(Icons.notifications_outlined, color: colors.textSecondary),
                    onPressed: () {
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const NotificationsScreen()));
                    },
                  ),
                ],
              )
                  .animate()
                  .fadeIn(duration: 400.ms)
                  .slideY(begin: -0.1, end: 0),
              const SizedBox(height: 28),

              // Stats Cards
              _isLoadingStats
                  ? Center(child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: CircularProgressIndicator(color: colors.primaryBrand, strokeWidth: 2),
                    ))
                  : _buildStatsSection(context, _stats, widget.role),
              const SizedBox(height: 28),

              // Quick Actions
              Text(
                'إجراءات سريعة',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: colors.textPrimary,
                ),
              )
                  .animate(delay: 600.ms)
                  .fadeIn(),
              const SizedBox(height: 14),
              _buildQuickActions(context, widget.role),
              const SizedBox(height: 28),

              // Recent Activity
              Text(
                'آخر النشاطات',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: colors.textPrimary,
                ),
              )
                  .animate(delay: 800.ms)
                  .fadeIn(),
              const SizedBox(height: 14),
              _buildRecentActivity(context, widget.role),
            ],
          ),
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
          _StatItem('مشاريع معيّنة', '${stats['assignedProjects']}', Icons.architecture_rounded, colors.primaryBrand),
          _StatItem('إثباتات معلّقة', '${stats['pendingProofs']}', Icons.pending_actions_rounded, colors.warning),
          _StatItem('إثباتات مُوثّقة', '${stats['verifiedProofs']}', Icons.verified_rounded, colors.success),
          _StatItem('الإيرادات', formatCurrency(stats['totalRevenue'] ?? stats['total_revenue'] ?? 0), Icons.account_balance_wallet_rounded, colors.goldFunding),
        ];
        break;
      case 'SUPPLIER':
        items = [
          _StatItem('طلبات معلّقة', '${stats['pendingOrders'] ?? stats['pending_orders'] ?? 0}', Icons.hourglass_top_rounded, colors.warning),
          _StatItem('قيد التوصيل', '${stats['inTransit'] ?? stats['in_transit'] ?? 0}', Icons.local_shipping_rounded, colors.info),
          _StatItem('تم التسليم', '${stats['delivered'] ?? 0}', Icons.check_circle_rounded, colors.success),
          _StatItem('الإيرادات', formatCurrency(stats['totalRevenue'] ?? stats['total_revenue'] ?? 0), Icons.account_balance_wallet_rounded, colors.goldFunding),
        ];
        break;
      case 'HOMEOWNER':
        items = [
          _StatItem('مشاريعي', '${stats['total_projects'] ?? stats['totalProjects'] ?? 0}', Icons.home_work_rounded, colors.primaryBrand),
          _StatItem('عروض واردة', '${stats['pending_bids'] ?? stats['pendingBids'] ?? 0}', Icons.gavel_rounded, colors.warning),
          _StatItem('التمويل', '${stats['funding_percentage'] ?? stats['fundingPercentage'] ?? 0}%', Icons.trending_up_rounded, colors.success),
          _StatItem('الضمان', formatCurrency(stats['escrow_total'] ?? stats['escrowTotal'] ?? 0), Icons.lock_rounded, colors.goldFunding),
        ];
        break;
      default:
        items = [
          _StatItem('إجمالي التبرعات', formatCurrency(stats['totalDonated'] ?? stats['total_donated'] ?? 0), Icons.favorite_rounded, colors.primaryBrand),
          _StatItem('مشاريع نشطة', '${stats['activeProjects']}', Icons.home_work_rounded, colors.info),
          _StatItem('إثباتات مُستلمة', '${stats['proofsSeen']}', Icons.verified_rounded, colors.success),
          _StatItem('معدل الأثر', '${stats['impactScore']}%', Icons.trending_up_rounded, colors.goldFunding),
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
        return GlassCard(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: item.color.withAlpha(20),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(item.icon, size: 20, color: item.color),
              ),
              Column(
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
            ],
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
      case 'ENGINEER':
        actions = [
          _QuickAction('كاميرا مكانية', Icons.camera_alt_rounded, colors.primaryBrand, const SpatialCameraScreen(projectId: '', itemId: '')),
          _QuickAction('مشاريعي', Icons.architecture_rounded, colors.info, const BidsScreen()),
          _QuickAction('تقديم عرض', Icons.gavel_rounded, colors.goldFunding, const BidsScreen()),
        ];
        break;
      case 'SUPPLIER':
        actions = [
          _QuickAction('طلبات جديدة', Icons.notification_important_rounded, colors.warning, const SupplierPortalScreen()),
          _QuickAction('كتالوج المواد', Icons.inventory_2_rounded, colors.primaryBrand, const SupplierPortalScreen()),
          _QuickAction('سجل التوصيل', Icons.receipt_long_rounded, colors.success, const WalletScreen()),
        ];
        break;
      default:
        actions = [
          _QuickAction('تصفح المشاريع', Icons.search_rounded, colors.primaryBrand, const MarketplaceScreen()),
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
          )
              .animate(delay: (700 + index * 100).ms)
              .fadeIn()
              .slideY(begin: 0.2, end: 0),
        );
      }),
    );
  }

  Widget _buildRecentActivity(BuildContext context, String role) {
    final colors = context.colors;

    final List<Map<String, dynamic>> activities;
    switch (role) {
      case 'ENGINEER':
        activities = [
          {'title': 'إثبات مكاني مُرسل', 'subtitle': 'ترميم منزل الحسين — حلب', 'icon': Icons.camera_alt, 'time': 'منذ ساعتين', 'color': colors.success},
          {'title': 'عرض مقبول', 'subtitle': 'ترميم سوق المدينة — حلب', 'icon': Icons.check_circle, 'time': 'أمس', 'color': colors.primaryBrand},
          {'title': 'مشروع جديد مُعيّن', 'subtitle': 'منزل عائلة الشعار — دمشق', 'icon': Icons.assignment, 'time': 'منذ 3 أيام', 'color': colors.info},
        ];
        break;
      case 'SUPPLIER':
        activities = [
          {'title': 'طلب جديد وارد', 'subtitle': '100 كيس إسمنت — حلب', 'icon': Icons.notification_important, 'time': 'منذ ساعة', 'color': colors.warning},
          {'title': 'تم تأكيد التوصيل', 'subtitle': '3 طن حديد — حمص', 'icon': Icons.local_shipping, 'time': 'أمس', 'color': colors.success},
          {'title': 'دفعة مُستلمة', 'subtitle': '300,000 ل.س', 'icon': Icons.account_balance_wallet, 'time': 'منذ 5 أيام', 'color': colors.goldFunding},
        ];
        break;
      default:
        activities = [
          {'title': 'تبرع مُؤمّن', 'subtitle': 'إسمنت — منزل الحسين', 'icon': Icons.lock, 'time': 'منذ ساعتين', 'color': colors.success},
          {'title': 'إثبات تسليم مُستلم', 'subtitle': 'حديد — مدرسة النور', 'icon': Icons.verified, 'time': 'أمس', 'color': colors.primaryBrand},
          {'title': 'مشروع جديد متاح', 'subtitle': 'مركز صحي — الرقة', 'icon': Icons.add_circle, 'time': 'منذ 3 أيام', 'color': colors.info},
        ];
    }

    return Column(
      children: List.generate(activities.length, (index) {
        final a = activities[index];
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: colors.surfaceElevated,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: colors.strokeSubtle),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: (a['color'] as Color).withAlpha(15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(a['icon'] as IconData, color: a['color'] as Color, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      a['title'] as String,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: colors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      a['subtitle'] as String,
                      style: TextStyle(
                        fontSize: 12,
                        color: colors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                a['time'] as String,
                style: TextStyle(
                  fontSize: 11,
                  color: colors.textSecondary,
                ),
              ),
            ],
          ),
        )
            .animate(delay: (900 + index * 100).ms)
            .fadeIn()
            .slideX(begin: 0.05, end: 0);
      }),
    );
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
