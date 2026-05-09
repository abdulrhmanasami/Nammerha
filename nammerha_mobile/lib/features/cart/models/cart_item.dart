// ═══════════════════════════════════════════════════════════════════════════
// CartItem — Immutable data model mirroring web CartStore interface
// ═══════════════════════════════════════════════════════════════════════════
// Web reference: frontend/src/components/cart.ts → CartItem interface
// Fields: id, name, unitPrice (cents), quantity, category, projectId
// ═══════════════════════════════════════════════════════════════════════════

class CartItem {
  final String id;
  final String name;
  final int unitPrice; // In cents — matches web financial convention
  final int quantity;
  final String category;
  final String projectId;
  final String? iconName; // Phosphor icon name for display

  const CartItem({
    required this.id,
    required this.name,
    required this.unitPrice,
    required this.quantity,
    required this.category,
    required this.projectId,
    this.iconName,
  });

  /// Total price for this line item (unit × qty)
  int get lineTotal => unitPrice * quantity;

  /// Create a copy with updated fields
  CartItem copyWith({
    String? id,
    String? name,
    int? unitPrice,
    int? quantity,
    String? category,
    String? projectId,
    String? iconName,
  }) {
    return CartItem(
      id: id ?? this.id,
      name: name ?? this.name,
      unitPrice: unitPrice ?? this.unitPrice,
      quantity: quantity ?? this.quantity,
      category: category ?? this.category,
      projectId: projectId ?? this.projectId,
      iconName: iconName ?? this.iconName,
    );
  }

  /// Serialize to JSON for SharedPreferences persistence
  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'unitPrice': unitPrice,
        'quantity': quantity,
        'category': category,
        'projectId': projectId,
        if (iconName != null) 'iconName': iconName,
      };

  /// Deserialize from JSON
  factory CartItem.fromJson(Map<String, dynamic> json) {
    return CartItem(
      id: json['id'] as String,
      name: json['name'] as String,
      unitPrice: json['unitPrice'] as int,
      quantity: json['quantity'] as int,
      category: json['category'] as String,
      projectId: json['projectId'] as String,
      iconName: json['iconName'] as String?,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CartItem && runtimeType == other.runtimeType && id == other.id;

  @override
  int get hashCode => id.hashCode;
}
