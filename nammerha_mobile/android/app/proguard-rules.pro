# ═══════════════════════════════════════════════════════════════════════════
# Nammerha ProGuard Rules
# ═══════════════════════════════════════════════════════════════════════════
# Flutter-specific rules for R8/ProGuard code shrinking in release builds.
# ═══════════════════════════════════════════════════════════════════════════

# Flutter Wrapper
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# Keep annotations
-keepattributes *Annotation*

# Gson / JSON serialization (if used by plugins)
-keepattributes Signature
-keep class com.google.gson.** { *; }

# OkHttp (used by some Flutter plugins)
-dontwarn okhttp3.**
-dontwarn okio.**

# Flutter Secure Storage
-keep class com.it_nomads.fluttersecurestorage.** { *; }

# Camera plugin
-keep class io.flutter.plugins.camera.** { *; }

# Geolocator
-keep class com.baseflow.geolocator.** { *; }

# Google Play Core (Flutter deferred components reference)
-dontwarn com.google.android.play.core.splitcompat.SplitCompatApplication
-dontwarn com.google.android.play.core.splitinstall.SplitInstallException
-dontwarn com.google.android.play.core.splitinstall.SplitInstallManager
-dontwarn com.google.android.play.core.splitinstall.SplitInstallManagerFactory
-dontwarn com.google.android.play.core.splitinstall.SplitInstallRequest$Builder
-dontwarn com.google.android.play.core.splitinstall.SplitInstallRequest
-dontwarn com.google.android.play.core.splitinstall.SplitInstallSessionState
-dontwarn com.google.android.play.core.splitinstall.SplitInstallStateUpdatedListener
-dontwarn com.google.android.play.core.tasks.OnFailureListener
-dontwarn com.google.android.play.core.tasks.OnSuccessListener
-dontwarn com.google.android.play.core.tasks.Task
