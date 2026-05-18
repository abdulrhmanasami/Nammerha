import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/widgets/glass_card.dart';
import '../../../core/services/api_services.dart';
import '../../../core/network/api_client.dart';
// UNIFIED: role_localizer, AuthBloc imports removed
// (were used by the now-removed role-switcher bottom sheet)
// NammerhaApiClient re-added for UX-REM-F001 (project picker camera flow)
import '../../auth/repositories/auth_repository.dart';
import '../bloc/dashboard_home_bloc.dart';
import '../../profile/screens/profile_screen.dart';
import '../../profile/bloc/profile_bloc.dart';
import '../../notifications/screens/notifications_screen.dart';
// P0-003 FIX: SpatialCameraScreen import removed — camera launch now requires project selection
import '../../wallet/screens/wallet_screen.dart';
import '../../open_data/screens/open_data_screen.dart';
import '../../damage_report/screens/damage_report_screen.dart';
import '../../spatial_proof/screens/spatial_camera_screen.dart';
import '../../admin/screens/admin_hub_screen.dart';
import '../../admin/screens/admin_dashboard_screen.dart';
import '../../admin/screens/admin_escrow_screen.dart';
import '../../admin/screens/admin_kyc_screen.dart';
import '../../project/screens/marketplace_screen.dart';
import '../../cart/state/cart_store.dart';
import '../../cart/screens/cart_screen.dart';
// P0-001 FIX: Professional Portals — were orphaned (zero navigation entry points)
import '../../engineer/screens/engineer_portal_screen.dart';
import '../../contractor/screens/contractor_portal_screen.dart';
import '../../supplier/screens/supplier_portal_screen.dart';
import '../../reality_capture/screens/reality_capture_screen.dart';
import '../../../core/i18n/t.dart';
import '../../../core/widgets/error_state.dart';
// P2-001 FIX: Raw shimmer import removed — all usages now use NammerhaShimmerLoader
// UNIFIED: ContractorPortalScreen, TradespersonPortalScreen — features accessible via unified tabs
// Wave 4: ConnectivityBanner import removed — now global via MaterialApp.builder
import '../../../core/bloc/page_index_cubit.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';
// P2-003 FIX: BottomSheetGrabber import moved to ProjectPickerBottomSheet
// UX-F029: Guided feature tour — shows on first login after onboarding
import '../../onboarding/screens/guided_tour_screen.dart';
// Phase 4: Payment system — contract list screen integration
import '../../payments/screens/contract_list_screen.dart';
import '../../../core/utils/animation_budget.dart';
// P0-003 FIX: Progressive KYC profiling gate
import '../../../core/kyc/kyc_guard.dart';
import '../../../core/kyc/kyc_level.dart';
// P2-003 FIX: Extracted project picker bottom sheet
import '../../../core/widgets/project_picker_bottom_sheet.dart';

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
  //
  // P2-001 AUDIT: setState RETAINED (Platinum Approved) — Lazy tab visited
  // tracking (_visitedTabs) is ephemeral navigation state. Prevents building
  // unvisited tabs on resource-constrained 2G devices. Not API state.
  // ═══════════════════════════════════════════════════════════════════════════

  bool get _isAdmin => widget.role == 'ADMIN' || widget.role == 'AUDITOR';

  // UX-REM-I011 FIX: Lazy tab building — tracks which tabs have been visited.
  // PREVIOUS: IndexedStack built ALL 5 tabs eagerly on first render.
  // NOW: Only builds a tab's widget tree on first selection.
  // Once built, it stays alive (same as IndexedStack post-visit behavior).
  // Memory: 5 concurrent widget trees → 1 on launch, grows as tabs are visited.
  //
  // AUD-007 DECISION: LRU eviction REJECTED for 5 tabs. Rationale:
  //   1. Evicting a visited tab destroys scroll position, BLoC state, loaded data
  //   2. Re-visiting an evicted tab triggers full API reload (costly on 2G)
  //   3. 5 lightweight tabs ≈ 2-4 MB total — within acceptable bounds
  //   4. AutomaticKeepAliveClientMixin is equivalent (keeps alive = IndexedStack)
  final Set<int> _visitedTabs = {0}; // Home tab always built

  // P1-003 FIX: Static tour trigger flag — survives widget rebuilds.
  // PREVIOUS: Instance variable `_tourTriggered = false` — a locale/theme change
  // would create a new State instance with _tourTriggered reset to false,
  // causing showGuidedTour() to be called again (double-fire race).
  // NOW: Static — persists across all instances of _DashboardScreenState.
  static bool _tourTriggered = false;

  @override
  void initState() {
    super.initState();
    // UX-F029: Trigger guided feature tour on first login.
    // addPostFrameCallback ensures the Scaffold is rendered before the overlay.
    // showGuidedTour() internally checks SharedPreferences — runs only once.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_tourTriggered && mounted) {
        _tourTriggered = true;
        showGuidedTour(context);
      }
    });
  }

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
        // UX-F011 FIX: warningCircle → chartLineUp — matches web's Impact tab.
        icon: Icon(PhosphorIconsRegular.chartLineUp),
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
            body: _buildLazyIndexedStack(safeIndex, pages),
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

  // UX-REM-I011 FIX: Lazy IndexedStack — defers widget build until first visit.
  // Standard: Memory efficiency on resource-constrained Syrian 2G devices.
  Widget _buildLazyIndexedStack(int currentIndex, List<Widget> pages) {
    // Mark current tab as visited
    if (!_visitedTabs.contains(currentIndex)) {
      // Use addPostFrameCallback to avoid setState during build
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          setState(() => _visitedTabs.add(currentIndex));
        }
      });
    }
    return IndexedStack(
      index: currentIndex,
      children: List.generate(pages.length, (i) {
        // Only build pages that have been visited
        if (_visitedTabs.contains(i)) {
          return pages[i];
        }
        // Unvisited: lightweight placeholder
        return const SizedBox.shrink();
      }),
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

            // Wave 4: ConnectivityBanner removed — now global via MaterialApp.builder
            return RefreshIndicator(
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
                              // UX-REM-J008 FIX: Cart icon gated behind procurement state.
                              // PREVIOUS: Cart icon always visible. Donations/procurement suspended.
                              // User taps → navigates to empty CartScreen → dead end.
                              // NOW: Only show when cart has items (procurement flow is active).
                              // When procurement is re-enabled, this naturally shows the cart.
                              // Standard: Nielsen #2 (Match system & real world), Honest Affordances.
                              ListenableBuilder(
                                listenable: CartStore.instance,
                                builder: (context, _) {
                                  final count = CartStore.instance.items.length;
                                  // Only render cart icon when items exist (procurement active)
                                  if (count == 0) return const SizedBox.shrink();
                                  return Stack(
                                    alignment: Alignment.center,
                                    children: [
                                      IconButton(
                                        icon: Icon(
                                          PhosphorIconsRegular.shoppingCart,
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
                              // UX-F015 FIX: Semantics for screen reader accessibility.
                              // PREVIOUS: VoiceOver announced "Button" with no context.
                              // NOW: "Notifications" label for screen reader users.
                              // Standard: WCAG 4.1.2 (Name, Role, Value), Apple HIG.
                              Semantics(
                                label: context.tr('notifications'),
                                button: true,
                                child: IconButton(
                                  icon: Icon(
                                    PhosphorIconsRegular.bell,
                                    color: colors.textSecondary,
                                  ),
                                  tooltip: context.tr('notifications'),
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
                              ),
                            ],
                          )
                          .nmAnimate(context)
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
                        NammerhaErrorState(
                          message: state.message,
                          onRetry: () => context.read<DashboardHomeBloc>().add(LoadDashboardHome(role)),
                          iconSize: 32,
                        )
                      else
                        _buildStatsSection(context, stats, role),
                      const SizedBox(height: 28),

                      // Workspaces (Bento Grid)
                      // P0-002 FIX: Hardcoded Arabic → i18n
                      Text(
                        context.tr('workspaces'),
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: colors.textPrimary,
                        ),
                      ).nmAnimate(context, delay: 200.ms).fadeIn(),
                      const SizedBox(height: 14),
                      // P2-001 FIX: Raw Shimmer → NammerhaShimmerLoader for visual consistency
                      if (isLoading)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 20),
                          child: NammerhaShimmerLoader(
                            colors: colors,
                            isList: false,
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
                      ).nmAnimate(context, delay: 400.ms).fadeIn(),
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
    // UX-REM-I007 FIX: Locale-aware greeting separator.
    // PREVIOUS: Hardcoded Arabic comma (،) for ALL locales.
    // NOW: Uses comma appropriate to the app's locale.
    // Standard: i18n best practice — punctuation is locale-dependent.
    final locale = Localizations.localeOf(context);
    final separator = locale.languageCode == 'ar' ? '،' : ',';
    return '$greeting$separator $userName';
  }

  Widget _buildStatsSection(
    BuildContext context,
    Map<String, dynamic> stats,
    String role,
  ) {
    final colors = context.colors;

    // UNIFIED: Show combined stats for all users
    // Admin/Auditor keep their specific stats via _isAdmin check above
    // P0-001 FIX: warningCircle → buildings (projects stat icon)
    // P0-002 FIX: Hardcoded Arabic stat labels → context.tr()
    final List<_StatItem> items = [
      _StatItem(
        context.tr('my_projects'),
        '${stats['total_projects'] ?? stats['totalProjects'] ?? stats['assignedProjects'] ?? stats['assigned_projects'] ?? 0}',
        PhosphorIconsRegular.buildings,
        colors.primaryBrand,
        // AUD-012 FIX: Drill-down → My Projects filter
        onTap: () {
          HapticFeedback.lightImpact();
          Navigator.push(context, MaterialPageRoute(builder: (_) => const MarketplaceScreen(initialFilter: 'my_projects')));
        },
      ),
      _StatItem(
        context.tr('active_bids'),
        '${stats['pending_bids'] ?? stats['pendingBids'] ?? stats['pendingOrders'] ?? stats['pending_orders'] ?? 0}',
        PhosphorIconsRegular.gavel,
        colors.warning,
        // AUD-012 FIX: Drill-down → My Bids filter
        onTap: () {
          HapticFeedback.lightImpact();
          Navigator.push(context, MaterialPageRoute(builder: (_) => const MarketplaceScreen(initialFilter: 'my_bids')));
        },
      ),
      _StatItem(
        context.tr('verified_proofs'),
        '${stats['verifiedProofs'] ?? stats['verified_proofs'] ?? stats['proofsSeen'] ?? stats['proofs_seen'] ?? 0}',
        PhosphorIconsRegular.sealCheck,
        colors.success,
        // AUD-012 FIX: Drill-down → My Projects (proofs are per-project)
        onTap: () {
          HapticFeedback.lightImpact();
          Navigator.push(context, MaterialPageRoute(builder: (_) => const MarketplaceScreen(initialFilter: 'my_projects')));
        },
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
        // P2-004 FIX: Switch to wallet tab instead of pushing duplicate WalletScreen.
        // Previous: Navigator.push created a NEW WalletBloc — stale data on return.
        // Now: Reuses the IndexedStack's persistent WalletScreen/WalletBloc.
        onTap: () {
          HapticFeedback.lightImpact();
          context.read<PageIndexCubit>().setPage(2); // Wallet tab index
        },
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
              button: item.onTap != null,
              child: GestureDetector(
                // AUD-012 FIX: Stat cards are now tappable for drill-down.
                onTap: item.onTap,
                child: GlassCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      ExcludeSemantics(
                        child: Row(
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
                            // AUD-012 FIX: Subtle chevron hint — Fitts' Law affordance.
                            // Signals the card is interactive without cluttering the layout.
                            if (item.onTap != null)
                              Icon(
                                PhosphorIconsRegular.caretRight,
                                size: 14,
                                color: colors.textSubtle,
                              ),
                          ],
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
              ),
            )
            .nmAnimate(context, delay: (300 + index * 100).ms)
            .fadeIn()
            .scale(begin: const Offset(0.9, 0.9), duration: 400.ms);
      },
    );
  }

  Widget _buildWorkspacesBento(BuildContext context, String role) {
    final colors = context.colors;

    // P0-002 FIX: Hardcoded Arabic admin workspace labels → i18n
    if (role == 'ADMIN' || role == 'AUDITOR') {
      final adminActions = [
        _WorkspaceItem(
          context.tr('admin_dashboard'),
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
          context.tr('kyc_check'),
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

    // P0-002 FIX: Hardcoded Arabic workspace labels → i18n
    // P0-003 FIX: SpatialCameraScreen no longer launched with empty IDs
    // UNIFIED BENTO GRID (Role-less Contextual Workspaces)
    // UX-F022 FIX: Each card now navigates to a DISTINCT destination.
    // PREVIOUS: All 4 cards → same MarketplaceScreen() — misleading affordance.
    // NOW: Create → DamageReportScreen, others → filtered MarketplaceScreen.
    // Standard: Fitts' Law — distinct affordances must lead to distinct outcomes.
    final projectsWorkspace = [
      _WorkspaceItem(
        context.tr('create_project'),
        PhosphorIconsRegular.plusCircle,
        colors.primaryBrand,
        const DamageReportScreen(titleKey: 'create_project'), // P1-005: Title matches card label
      ),
      _WorkspaceItem(
        context.tr('my_projects'),
        PhosphorIconsRegular.buildings,
        colors.primaryBrand,
        const MarketplaceScreen(initialFilter: 'my_projects'),
      ),
    ];

    final tendersWorkspace = [
      _WorkspaceItem(
        context.tr('browse_tenders'),
        PhosphorIconsRegular.magnifyingGlass,
        colors.goldFunding,
        const MarketplaceScreen(), // Full browse — no filter
      ),
      _WorkspaceItem(
        context.tr('my_bids'),
        PhosphorIconsRegular.gavel,
        colors.goldFunding,
        const MarketplaceScreen(initialFilter: 'my_bids'),
      ),
    ];

    final fieldWorkspace = [
      _WorkspaceItem(
        context.tr('spatial_camera'),
        PhosphorIconsRegular.camera,
        colors.success,
        // P0-003 FIX: Placeholder — actual navigation handled in _buildBentoCard
        // via onTap override that shows project picker before launching camera.
        const DamageReportScreen(), // Placeholder, overridden below
        isCameraAction: true,
      ),
      // AUD-005 FIX: Was 'damage_report' → DamageReportScreen (duplicate of
      // 'create_project' in Projects section). Replaced with Reality Capture 360°
      // which is a genuinely distinct field tool (panoramic vs single-shot).
      // Uses same project-picker pattern as Spatial Camera (isCameraAction).
      _WorkspaceItem(
        context.tr('capture_360'),
        PhosphorIconsRegular.cube,
        colors.success,
        const DamageReportScreen(), // Placeholder, overridden by isRealityCaptureAction
        isRealityCaptureAction: true,
      ),
    ];

    // P0-002 FIX: Bento section titles → i18n
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
                context.tr('projects_properties'),
                projectsWorkspace,
                colors.primaryBrand,
                // UX-REM-I012 FIX: Reduced from 700ms to 100ms
                100,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildBentoSection(
                context,
                context.tr('tenders_supply'),
                tendersWorkspace,
                colors.goldFunding,
                // UX-REM-I012 FIX: Reduced from 800ms to 200ms
                200,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        // Bottom Row: Field Tools (Full Width)
        _buildBentoSection(
          context,
          context.tr('field_engineering_tasks'),
          fieldWorkspace,
          colors.success,
          // UX-REM-I012 FIX: Reduced from 900ms to 300ms
          300,
          isHorizontal: true,
        ),
        const SizedBox(height: 12),
        // Phase 4: Contracts & Payments workspace
        _buildBentoSection(
          context,
          context.tr('contracts_payments'),
          [
            _WorkspaceItem(
              context.tr('my_contracts'),
              PhosphorIconsRegular.fileText,
              colors.secondaryAccent,
              const ContractListScreen(),
            ),
            // P2-004 FIX: Switch to wallet tab instead of pushing duplicate.
            _WorkspaceItem(
              context.tr('wallet'),
              PhosphorIconsRegular.wallet,
              colors.secondaryAccent,
              const SizedBox.shrink(), // Unused — switchToTabIndex handles navigation
              switchToTabIndex: 2,
            ),
          ],
          colors.secondaryAccent,
          400,
          isHorizontal: true,
        ),
        const SizedBox(height: 12),
        // ═══════════════════════════════════════════════════════════════════
        // P0-001 FIX: Professional Tools Bento Section
        // PREVIOUS: EngineerPortalScreen (29KB), ContractorPortalScreen (29KB),
        // SupplierPortalScreen (46KB) — 104KB of production code with ZERO
        // navigation entry points after Universal Access migration.
        // NOW: Accessible via dedicated "Professional Tools" workspace section.
        // Standard: Nielsen #7 (Flexibility and efficiency of use).
        // ═══════════════════════════════════════════════════════════════════
        _buildBentoSection(
          context,
          context.tr('professional_tools'),
          [
            _WorkspaceItem(
              context.tr('engineer_portal'),
              PhosphorIconsRegular.hardHat,
              colors.warmEarth,
              const EngineerPortalScreen(),
              kycRequirement: KycRequirements.engineerPortal,
            ),
            _WorkspaceItem(
              context.tr('contractor_portal'),
              PhosphorIconsRegular.crane,
              colors.warmEarth,
              const ContractorPortalScreen(),
              kycRequirement: KycRequirements.contractorPortal,
            ),
            _WorkspaceItem(
              context.tr('supplier_portal'),
              PhosphorIconsRegular.package,
              colors.warmEarth,
              const SupplierPortalScreen(),
              kycRequirement: KycRequirements.supplierPortal,
            ),
          ],
          colors.warmEarth,
          500,
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
          // UX-REM-I005 FIX: Semantic header for screen reader navigation.
          // PREVIOUS: Plain Text widget — screen readers couldn't distinguish
          // section headings from body text.
          // Standard: WCAG 1.3.1 (Info and Relationships).
          Semantics(
            header: true,
            child: Text(
              title,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: themeColor,
              ),
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
    ).nmAnimate(context, delay: animDelay.ms).fadeIn().slideY(begin: 0.1, end: 0);
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
        onTap: () async {
          HapticFeedback.lightImpact();
          // ═══════════════════════════════════════════════════════════════
          // P0-003 FIX: KYC Guard — check BEFORE any sensitive navigation.
          // If the user's KYC level is insufficient, a bottom sheet
          // explains what's needed and blocks navigation. O(1) check.
          // ═══════════════════════════════════════════════════════════════
          if (action.kycRequirement != null) {
            if (!await KycGuard.check(context, action.kycRequirement!)) return;
          }
          if (!context.mounted) return;
          // UX-REM-F001 FIX: Camera action — project picker bottom sheet.
          // PREVIOUS: Dead SnackBar + TODO comment. User hit a dead end.
          // NOW: Opens a bottom sheet listing user's projects. On selection,
          // navigates to SpatialCameraScreen with the selected project context.
          // Standard: Nielsen #7 (Flexibility and efficiency of use).
          if (action.isCameraAction) {
            _showProjectPickerForCamera(context);
            return;
          }
          // AUD-005 FIX: Reality Capture 360° also needs project context.
          if (action.isRealityCaptureAction) {
            _showProjectPickerForRealityCapture(context);
            return;
          }
          // P2-004 FIX: Tab switch for in-dashboard destinations.
          // Previous: Always Navigator.push — created duplicate BlocProviders.
          // Now: If switchToTabIndex is set, reuse the IndexedStack's persistent tab.
          if (action.switchToTabIndex != null) {
            context.read<PageIndexCubit>().setPage(action.switchToTabIndex!);
            return;
          }
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
            // P1-002 FIX: Colors.white → semantic token for dark mode support
            color: colors.surfaceCard,
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
        // P0-001 FIX: warningCircle → clockCounterClockwise (empty activity icon)
        // P0-002 FIX: Hardcoded Arabic empty state → i18n
        child: Column(
          children: [
            Icon(
              PhosphorIconsRegular.clockCounterClockwise,
              size: 48,
              color: colors.textSecondary.withAlpha(80),
            ),
            const SizedBox(height: 12),
            Text(
              context.tr('no_recent_activities'),
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: colors.textSecondary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              context.tr('activities_will_appear'),
              style: TextStyle(
                fontSize: 12,
                color: colors.textSecondary.withAlpha(150),
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ).nmAnimate(context, delay: 900.ms).fadeIn();
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

        // P0-002 FIX: Hardcoded Arabic timeago → i18n with placeholder substitution
        String timeAgo = '';
        if (createdAt != null) {
          try {
            final diff = DateTime.now().difference(DateTime.parse(createdAt));
            if (diff.inMinutes < 60) {
              timeAgo = context.tr('time_ago_minutes').replaceAll(r'$1', '${diff.inMinutes}');
            } else if (diff.inHours < 24) {
              timeAgo = context.tr('time_ago_hours').replaceAll(r'$1', '${diff.inHours}');
            } else {
              timeAgo = context.tr('time_ago_days').replaceAll(r'$1', '${diff.inDays}');
            }
          } catch (e) {
            debugPrint('[Dashboard] timeAgo parse error: $e');
          }
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
            .nmAnimate(context, delay: (900 + index * 80).ms)
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
      // P0-001 FIX: Activity meta icons — warningCircle → correct semantic icons
      case 'project_published':
      case 'project_funded':
        return _ActivityMeta(PhosphorIconsRegular.buildings, colors.info);
      case 'kyc_verified':
        return _ActivityMeta(
          PhosphorIconsRegular.shieldCheck,
          colors.success,
        );
      case 'kyc_rejected':
        return _ActivityMeta(PhosphorIconsRegular.shieldWarning, colors.error);
      case 'order_status':
        return _ActivityMeta(PhosphorIconsRegular.truck, colors.info);
      default:
        return _ActivityMeta(PhosphorIconsRegular.bell, colors.textSecondary);
    }
  }

  // UNIFIED: _showRoleSwitcher, _showAddRoleSheet, and _activateRole
  // have been removed. Role switching is no longer a user-facing concept.
  // All users see all features through the unified dashboard tabs.

  // ─── UX-REM-F001: Project Picker for Spatial Camera ─────────────────────
  // Replaces the dead SnackBar + TODO. Shows a bottom sheet listing the user's
  // projects. On selection, navigates to SpatialCameraScreen with project context.
  // ═══════════════════════════════════════════════════════════════════════════
  // P2-003 FIX: Project Pickers — Extracted to ProjectPickerBottomSheet
  // ═══════════════════════════════════════════════════════════════════════════
  // PREVIOUS: Two near-identical 115-line methods (230 lines total):
  //   _showProjectPickerForCamera() and _showProjectPickerForRealityCapture()
  // NOW: Single reusable widget, each call is ~10 lines.
  // ═══════════════════════════════════════════════════════════════════════════

  void _showProjectPickerForCamera(BuildContext context) {
    final colors = context.colors;
    ProjectPickerBottomSheet.show(
      context: context,
      headerIcon: PhosphorIconsRegular.camera,
      headerTitleKey: 'select_project_for_camera',
      leadingColor: colors.success,
      projectsFuture: _fetchUserProjects(),
      onProjectSelected: (projectId, _) {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => SpatialCameraScreen(
              projectId: projectId,
              itemId: '', // General capture — no specific BOQ item
            ),
          ),
        );
      },
    );
  }

  Future<List<Map<String, dynamic>>> _fetchUserProjects() async {
    try {
      final response = await NammerhaApiClient.instance.request<List<dynamic>>(
        '/homeowner/projects',
        fromData: (d) => d as List<dynamic>,
      );
      return response.data?.cast<Map<String, dynamic>>() ?? [];
    } catch (e) {
      debugPrint('[Dashboard] _fetchUserProjects error: $e');
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUD-005 FIX: Project picker for Reality Capture 360°
  // P2-003: Now uses extracted ProjectPickerBottomSheet.
  // ═══════════════════════════════════════════════════════════════════════════
  void _showProjectPickerForRealityCapture(BuildContext context) {
    final colors = context.colors;
    ProjectPickerBottomSheet.show(
      context: context,
      headerIcon: PhosphorIconsRegular.cube,
      headerTitleKey: 'select_project_for_capture',
      leadingColor: colors.success,
      projectsFuture: _fetchUserProjects(),
      onProjectSelected: (projectId, title) {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => RealityCaptureScreen(
              projectId: projectId,
              projectTitle: title,
            ),
          ),
        );
      },
    );
  }
}

class _StatItem {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  // AUD-012 FIX: Optional drill-down navigation callback.
  final VoidCallback? onTap;
  const _StatItem(this.label, this.value, this.icon, this.color, {this.onTap});
}

class _WorkspaceItem {
  final String label;
  final IconData icon;
  final Color color;
  final Widget screen;
  // P0-003 FIX: Flag to indicate this workspace requires project selection
  final bool isCameraAction;
  // AUD-005 FIX: Flag for Reality Capture 360° — also needs project picker
  final bool isRealityCaptureAction;
  // P2-004 FIX: If set, switches bottom nav tab instead of pushing a new route.
  // Eliminates duplicate BlocProvider instances for screens already in IndexedStack.
  final int? switchToTabIndex;
  // P0-003 FIX: Progressive KYC gate — minimum KYC level required to access.
  // If null, no gate is applied (browsing actions). If set, KycGuard.check()
  // is called before navigation and blocks with an interstitial if insufficient.
  final KycLevel? kycRequirement;
  const _WorkspaceItem(this.label, this.icon, this.color, this.screen, {this.isCameraAction = false, this.isRealityCaptureAction = false, this.switchToTabIndex, this.kycRequirement});
}

class _ActivityMeta {
  final IconData icon;
  final Color color;
  const _ActivityMeta(this.icon, this.color);
}
