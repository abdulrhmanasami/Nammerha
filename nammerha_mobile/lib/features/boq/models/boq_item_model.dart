import 'dart:isolate';

class BOQItem {
  final String id;
  final String name;
  final String description;
  final String unit;
  final double quantity;
  final double estimatedUnitPrice;
  final double? currentMarketPrice; // For FIDIC 13.8 Oracle

  const BOQItem({
    required this.id,
    required this.name,
    required this.description,
    required this.unit,
    required this.quantity,
    required this.estimatedUnitPrice,
    this.currentMarketPrice,
  });

  factory BOQItem.fromJson(Map<String, dynamic> json) {
    return BOQItem(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Unnamed Item',
      description: json['description'] as String? ?? '',
      unit: json['unit'] as String? ?? 'unit',
      quantity: (json['quantity'] as num?)?.toDouble() ?? 0.0,
      estimatedUnitPrice: (json['estimatedUnitPrice'] as num?)?.toDouble() ?? 0.0,
      currentMarketPrice: (json['currentMarketPrice'] as num?)?.toDouble(),
    );
  }

  // Isolate Offloading: Parsing heavy lists off the main thread
  static Future<List<BOQItem>> parseList(List<dynamic> jsonList) async {
    return Isolate.run(() {
      return jsonList
          .map((e) => BOQItem.fromJson(e as Map<String, dynamic>))
          .toList();
    });
  }

  double get estimatedTotal => quantity * estimatedUnitPrice;
  double get marketTotal => quantity * (currentMarketPrice ?? estimatedUnitPrice);
  double get inflationVariance => marketTotal - estimatedTotal;
  bool get hasInflation => (currentMarketPrice ?? estimatedUnitPrice) > estimatedUnitPrice;
}
