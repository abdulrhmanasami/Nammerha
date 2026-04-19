import 'dart:isolate';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';

@pragma('vm:entry-point')
void startCallback() {
  FlutterForegroundTask.setTaskHandler(LocationTaskHandler());
}

class LocationTaskHandler extends TaskHandler {
  @override
  Future<void> onStart(DateTime timestamp, SendPort? sendPort) async {
    // Initialization code for background isolate
  }

  @override
  Future<void> onEvent(DateTime timestamp, SendPort? sendPort) async {
    // Trigger GPS coordinate fetch and cache inside Isar
    if (sendPort != null) {
      sendPort.send('Ping from background: $timestamp');
    }
  }

  @override
  Future<void> onDestroy(DateTime timestamp, SendPort? sendPort) async {
    // Cleanup resources
  }

  @override
  void onButtonPressed(String id) {}

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
        iconData: const NotificationIconData(
          resType: ResourceType.mipmap,
          resPrefix: ResourcePrefix.ic,
          name: 'launcher',
        ),
      ),
      iosNotificationOptions: const IOSNotificationOptions(
        showNotification: true,
        playSound: false,
      ),
      foregroundTaskOptions: const ForegroundTaskOptions(
        interval: 10000, // 10 seconds sync cycle
        isOnceEvent: false,
        autoRunOnBoot: false,
        allowWakeLock: true,
        allowWifiLock: true,
      ),
    );
  }

  static Future<bool> startTracking() async {
    if (await FlutterForegroundTask.isRunningService) {
      return true;
    }
    return FlutterForegroundTask.startService(
      notificationTitle: 'Nammerha Field Sync',
      notificationText: 'Tracking spatial proofs in the background...',
      callback: startCallback,
    );
  }

  static Future<bool> stopTracking() async {
    return FlutterForegroundTask.stopService();
  }
}
