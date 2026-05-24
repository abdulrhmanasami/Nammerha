import 'package:flutter/material.dart';

/// Demonic UX Fix: Route Debouncer (Double-Tap Route Duplication Preventer)
/// 
/// Solves the issue where users tapping a button twice rapidly pushes
/// the same route onto the Navigator stack twice.
class DebouncedNavigator {
  static DateTime? _lastPush;
  static const int _debounceMilliseconds = 400;

  /// Pushes a route, ignoring any subsequent pushes for the next 400ms.
  static Future<T?> push<T>(BuildContext context, Route<T> route) {
    final now = DateTime.now();
    if (_lastPush != null && now.difference(_lastPush!).inMilliseconds < _debounceMilliseconds) {
      // Ignore rapid double tap
      return Future.value(null);
    }
    _lastPush = now;
    return Navigator.of(context).push(route);
  }

  /// Pushes a named route, ignoring any subsequent pushes for the next 400ms.
  static Future<T?> pushNamed<T>(BuildContext context, String routeName, {Object? arguments}) {
    final now = DateTime.now();
    if (_lastPush != null && now.difference(_lastPush!).inMilliseconds < _debounceMilliseconds) {
      // Ignore rapid double tap
      return Future.value(null);
    }
    _lastPush = now;
    return Navigator.of(context).pushNamed(routeName, arguments: arguments);
  }

  /// Pushes a replacement route, ignoring any subsequent pushes for the next 400ms.
  static Future<T?> pushReplacement<T, TO>(BuildContext context, Route<T> newRoute, {TO? result}) {
    final now = DateTime.now();
    if (_lastPush != null && now.difference(_lastPush!).inMilliseconds < _debounceMilliseconds) {
      // Ignore rapid double tap
      return Future.value(null);
    }
    _lastPush = now;
    return Navigator.of(context).pushReplacement(newRoute, result: result);
  }
}
