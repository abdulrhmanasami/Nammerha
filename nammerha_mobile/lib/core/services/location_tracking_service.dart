// ============================================================================
// Nammerha — Location Tracking Service (flutter_foreground_task v9 MIGRATION)
// ============================================================================
// Background GPS tracking for field engineers during site inspections.
// Maintains GPS fidelity during offline assignments via foreground service.
//
// MIGRATION v6 → v9:
//   - TaskHandler.onStart: SendPort? → TaskStarter
//   - TaskHandler.onRepeatEvent: SendPort? removed
//   - TaskHandler.onDestroy: SendPort? → bool isTimeout
//   - ForegroundTaskOptions: interval/isOnceEvent → eventAction
//   - AndroidNotificationOptions: iconData removed (use app icon automatically)
//   - startService/stopService: returns ServiceRequestResult instead of bool
//   - onButtonPressed → onNotificationButtonPressed
// ============================================================================

import 'package:flutter_foreground_task/flutter_foreground_task.dart';

@pragma('vm:entry-point')
void startCallback() {
  FlutterForegroundTask.setTaskHandler(LocationTaskHandler());
}

class LocationTaskHandler extends TaskHandler {
  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {
    // Initialization code for background isolate
    // starter indicates whether started by developer or system (auto-restart)
  }

  @override
  void onRepeatEvent(DateTime timestamp) {
    // Trigger GPS coordinate fetch and cache
    // v9: SendPort removed — use FlutterForegroundTask.sendDataToMain() instead
    FlutterForegroundTask.sendDataToMain('Ping from background: $timestamp');
  }

  @override
  Future<void> onDestroy(DateTime timestamp, bool isTimeout) async {
    // Cleanup resources
    // isTimeout: true if destroyed by system due to timeout (Android 15+)
  }

  @override
  void onNotificationButtonPressed(String id) {
    // Handle notification action buttons
  }

  @override
  void onNotificationPressed() {
    FlutterForegroundTask.launchApp();
  }
}

class LocationTrackingService {
  static void init() {
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'nammerha_tracker',
        channelName: 'Nammerha Field Tracker',
        channelDescription: 'Maintains GPS fidelity during offline assignments.',
        channelImportance: NotificationChannelImportance.LOW,
        priority: NotificationPriority.LOW,
        // v9: iconData removed — uses app icon automatically
      ),
      iosNotificationOptions: const IOSNotificationOptions(
        showNotification: true,
        playSound: false,
      ),
      foregroundTaskOptions: ForegroundTaskOptions(
        // v9: interval/isOnceEvent replaced with eventAction
        eventAction: ForegroundTaskEventAction.repeat(10000), // 10 seconds
        autoRunOnBoot: false,
        allowWakeLock: true,
        allowWifiLock: true,
      ),
    );
  }

  /// Start background tracking. Returns true on success.
  static Future<bool> startTracking() async {
    if (await FlutterForegroundTask.isRunningService) {
      return true;
    }
    // v9: startService returns ServiceRequestResult (sealed class)
    final result = await FlutterForegroundTask.startService(
      notificationTitle: 'Nammerha Field Sync',
      notificationText: 'Tracking spatial proofs in the background...',
      callback: startCallback,
    );
    return result is ServiceRequestSuccess;
  }

  /// Stop background tracking. Returns true on success.
  static Future<bool> stopTracking() async {
    // v9: stopService returns ServiceRequestResult (sealed class)
    final result = await FlutterForegroundTask.stopService();
    return result is ServiceRequestSuccess;
  }
}
