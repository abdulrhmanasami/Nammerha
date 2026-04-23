import 'dart:async';
import 'package:flutter/material.dart';

import '../theme/semantic_colors.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Connectivity Banner — Network-aware offline indicator
/// ═══════════════════════════════════════════════════════════════════════════
/// Shows a non-intrusive banner when the device is offline.
/// Automatically hides when connectivity is restored.
/// Designed for Syria's restricted network conditions (2G/3G).
/// ═══════════════════════════════════════════════════════════════════════════
class ConnectivityBanner extends StatefulWidget {
  final Widget child;

  const ConnectivityBanner({super.key, required this.child});

  @override
  State<ConnectivityBanner> createState() => _ConnectivityBannerState();
}

class _ConnectivityBannerState extends State<ConnectivityBanner> {
  bool _isOffline = false;
  Timer? _checkTimer;

  @override
  void initState() {
    super.initState();
    // Periodic connectivity check (lightweight — no heavy ping)
    _checkTimer = Timer.periodic(const Duration(seconds: 15), (_) => _checkConnectivity());
  }

  @override
  void dispose() {
    _checkTimer?.cancel();
    super.dispose();
  }

  Future<void> _checkConnectivity() async {
    // Lightweight connectivity check via DNS resolve
    // In production, use connectivity_plus package
    try {
      // Placeholder — real implementation uses connectivity_plus
      // For now, always report online. When connectivity_plus is added,
      // this will use ConnectivityResult.
      if (mounted && _isOffline) {
        setState(() => _isOffline = false);
      }
    } catch (_) {
      if (mounted && !_isOffline) {
        setState(() => _isOffline = true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Column(
      children: [
        AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          height: _isOffline ? 36 : 0,
          color: colors.warning,
          child: _isOffline
              ? Center(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.wifi_off_rounded, size: 16, color: Colors.white),
                      const SizedBox(width: 8),
                      Text(
                        'غير متصل بالإنترنت — البيانات المخزنة مؤقتاً',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Colors.white.withAlpha(230),
                        ),
                      ),
                    ],
                  ),
                )
              : null,
        ),
        Expanded(child: widget.child),
      ],
    );
  }
}
