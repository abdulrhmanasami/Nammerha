import 'package:flutter/material.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/layout/responsive_builder.dart';

import '../../spatial_proof/screens/spatial_camera_screen.dart';
import '../../project/screens/project_list_screen.dart';
import '../../project/screens/marketplace_screen.dart';
import '../../profile/screens/profile_screen.dart';
import 'package:graphql_flutter/graphql_flutter.dart';

const String queryDashboardRole = r'''
  query DashboardMe {
    me {
      role
    }
  }
''';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int _currentIndex = 0;

  final List<Widget> _mobilePages = const [
    ProjectListScreen(),
    SpatialCameraScreen(),
    ProfileScreen(),
  ];

  // SECURITY GUARD: Web/Desktop strictly hidden from SpatialCamera due to GPS Spoofing risk
  final List<Widget> _desktopPages = const [
    ProjectListScreen(),
    ProfileScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Query(
      options: QueryOptions(
        document: gql(queryDashboardRole),
        fetchPolicy: FetchPolicy.cacheFirst,
      ),
      builder: (QueryResult result, {VoidCallback? refetch, FetchMore? fetchMore}) {
        if (result.isLoading && result.data == null) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }

        final role = result.data?['me']?['role'] ?? 'DONOR';

        // Build Pages based on role
        List<Widget> mobilePages;
        List<BottomNavigationBarItem> bottomNavItems;

        if (role == 'ENGINEER') {
          mobilePages = const [ProjectListScreen(), SpatialCameraScreen(), ProfileScreen()];
          bottomNavItems = const [
            BottomNavigationBarItem(icon: Icon(Icons.architecture), label: 'Assigned'),
            BottomNavigationBarItem(icon: Icon(Icons.camera_alt), label: 'Camera'),
            BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
          ];
        } else if (role == 'SUPPLIER') {
          mobilePages = const [Center(child: Text('Purchase Orders Component Here')), ProfileScreen()];
          bottomNavItems = const [
            BottomNavigationBarItem(icon: Icon(Icons.local_shipping), label: 'Orders'),
            BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
          ];
        } else {
          // DONOR / Default Route
          mobilePages = const [MarketplaceScreen(), Center(child: Text('My Donations Here')), ProfileScreen()];
          bottomNavItems = const [
            BottomNavigationBarItem(icon: Icon(Icons.storefront), label: 'Projects'),
            BottomNavigationBarItem(icon: Icon(Icons.favorite), label: 'Donations'),
            BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
          ];
        }

        // Fix index bounds if role switched
        if (_currentIndex >= mobilePages.length) {
          _currentIndex = 0;
        }

        return Scaffold(
          body: IndexedStack(
            index: _currentIndex,
            children: mobilePages,
          ),
          bottomNavigationBar: BottomNavigationBar(
            currentIndex: _currentIndex,
            onTap: (index) {
              setState(() {
                _currentIndex = index;
              });
            },
            backgroundColor: context.colors.backgroundPrimary,
            selectedItemColor: context.colors.primaryBrand,
            unselectedItemColor: context.colors.textSecondary,
            items: bottomNavItems,
          ),
        );
      },
    );
  }
}
