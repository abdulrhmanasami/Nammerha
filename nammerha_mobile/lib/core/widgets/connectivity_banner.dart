import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

import '../offline/offline_queue.dart';
import '../theme/semantic_colors.dart';
import '../i18n/t.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Connectivity Banner — Network-aware offline indicator (Platinum Standard)
/// ═══════════════════════════════════════════════════════════════════════════
/// Shows a non-intrusive banner when the device is offline.
/// Automatically hides when connectivity is restored.
/// Displays pending offline queue count when requests are queued.
/// Designed for Syria's restricted network conditions (2G/3G).
///
/// GAP-C2 Enhancement: Now integrates with OfflineQueue to show pending
/// request count and replay status.
/// ═══════════════════════════════════════════════════════════════════════════
class ConnectivityBanner extends StatefulWidget {
  final Widget child;

  const ConnectivityBanner({super.key, required this.child});

  @override
  State<ConnectivityBanner> createState() => _ConnectivityBannerState();
}

class _ConnectivityBannerState extends State<ConnectivityBanner>
    with SingleTickerProviderStateMixin {
  bool _isOffline = false;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySub;

  late AnimationController _animController;
  late Animation<double> _slideAnim;

  @override
  void initState() {
    super.initState();

    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    _slideAnim = Tween<double>(begin: -1.0, end: 0.0).animate(
      CurvedAnimation(parent: _animController, curve: Curves.easeOut),
    );

    _connectivitySub = Connectivity()
        .onConnectivityChanged
        .listen((List<ConnectivityResult> results) {
      final isOffline = results.every((r) => r == ConnectivityResult.none);
      if (isOffline != _isOffline && mounted) {
        setState(() => _isOffline = isOffline);
        if (isOffline) {
          _animController.forward();
        } else {
          _animController.reverse();
        }
      }
    });
  }

  @override
  void dispose() {
    _connectivitySub?.cancel();
    _animController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Column(
      children: [
        // Offline banner with slide animation
        AnimatedBuilder(
          animation: _slideAnim,
          builder: (context, child) {
            return ClipRect(
              child: Align(
                heightFactor: _isOffline ? 1.0 : (_slideAnim.value + 1.0).clamp(0.0, 1.0),
                child: child,
              ),
            );
          },
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            color: colors.warning,
            child: SafeArea(
              bottom: false,
              child: ValueListenableBuilder<int>(
                valueListenable: OfflineQueue.instance.pendingCount,
                builder: (context, pendingCount, _) {
                  return Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(PhosphorIconsRegular.wifiSlash, size: 16, color: Colors.white),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          pendingCount > 0
                              ? '${context.tr('offline_status')} — $pendingCount ${context.tr('pending_requests')}'
                              : context.tr('offline_status'),
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: Colors.white.withAlpha(230),
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
        ),
        Expanded(child: widget.child),
      ],
    );
  }
}
