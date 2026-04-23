import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/cart_item.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// CartStore — Singleton reactive cart with SharedPreferences persistence
/// ═══════════════════════════════════════════════════════════════════════════
/// Mirrors web: frontend/src/components/cart.ts → CartStoreImpl
/// Persistence: SharedPreferences (equivalent to web localStorage)
/// Reactivity: ChangeNotifier (equivalent to web CustomEvent 'cart:updated')
/// ═══════════════════════════════════════════════════════════════════════════
class CartStore extends ChangeNotifier {
  static const String _storageKey = 'nmrh_cart';

  // Singleton
  static final CartStore _instance = CartStore._internal();
  static CartStore get instance => _instance;
  factory CartStore() => _instance;
  CartStore._internal();

  final List<CartItem> _items = [];

  /// All items in the cart (unmodifiable view)
  List<CartItem> get items => List.unmodifiable(_items);

  /// Total item count (sum of quantities)
  int get count => _items.fold(0, (sum, item) => sum + item.quantity);

  /// Total price in cents
  int get total => _items.fold(0, (sum, item) => sum + item.lineTotal);

  /// Whether the cart is empty
  bool get isEmpty => _items.isEmpty;

  /// Whether the cart has items
  bool get isNotEmpty => _items.isNotEmpty;

  // ─── Hydration (load from disk) ─────────────────────────────────────

  /// Load cart state from SharedPreferences. Call once at app startup.
  Future<void> hydrate() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_storageKey);
      if (raw != null && raw.isNotEmpty) {
        final List<dynamic> parsed = jsonDecode(raw) as List<dynamic>;
        _items.clear();
        for (final item in parsed) {
          if (item is Map<String, dynamic>) {
            _items.add(CartItem.fromJson(item));
          }
        }
        notifyListeners();
      }
    } catch (e) {
      debugPrint('[CartStore] Failed to hydrate: $e');
      _items.clear();
    }
  }

  // ─── Persistence ────────────────────────────────────────────────────

  Future<void> _persist() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final json = jsonEncode(_items.map((i) => i.toJson()).toList());
      await prefs.setString(_storageKey, json);
    } catch (e) {
      debugPrint('[CartStore] Failed to persist: $e');
    }
    notifyListeners();
  }

  // ─── Cart Operations (mirror web CartStoreImpl methods) ─────────────

  /// Add an item or increment quantity if already in cart
  void addItem({
    required String id,
    required String name,
    required int unitPrice,
    required String category,
    required String projectId,
    String? iconName,
    int quantity = 1,
  }) {
    final existingIndex = _items.indexWhere((i) => i.id == id);
    if (existingIndex >= 0) {
      final existing = _items[existingIndex];
      _items[existingIndex] = existing.copyWith(
        quantity: existing.quantity + quantity,
      );
    } else {
      _items.add(CartItem(
        id: id,
        name: name,
        unitPrice: unitPrice,
        quantity: quantity,
        category: category,
        projectId: projectId,
        iconName: iconName,
      ));
    }
    _persist();
  }

  /// Remove an item entirely from cart
  void removeItem(String id) {
    _items.removeWhere((i) => i.id == id);
    _persist();
  }

  /// Update quantity for a specific item. Removes if qty <= 0.
  void updateQuantity(String id, int qty) {
    if (qty <= 0) {
      removeItem(id);
      return;
    }
    final index = _items.indexWhere((i) => i.id == id);
    if (index >= 0) {
      _items[index] = _items[index].copyWith(quantity: qty);
      _persist();
    }
  }

  /// Check if an item is in the cart
  bool hasItem(String id) => _items.any((i) => i.id == id);

  /// Get a specific item by ID
  CartItem? getItem(String id) {
    final index = _items.indexWhere((i) => i.id == id);
    return index >= 0 ? _items[index] : null;
  }

  /// Clear all items
  void clear() {
    _items.clear();
    _persist();
  }

  /// Get items grouped by project
  Map<String, List<CartItem>> get itemsByProject {
    final Map<String, List<CartItem>> grouped = {};
    for (final item in _items) {
      grouped.putIfAbsent(item.projectId, () => []).add(item);
    }
    return grouped;
  }
}
