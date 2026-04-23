import 'package:equatable/equatable.dart';

class BoqItemModel extends Equatable {
  final String materialName;
  final String category;
  final String unit;
  final int unitPrice;
  final int quantity;
  final int? oraclePrice;

  const BoqItemModel({
    required this.materialName,
    required this.category,
    required this.unit,
    required this.unitPrice,
    required this.quantity,
    this.oraclePrice,
  });

  BoqItemModel copyWith({
    String? materialName,
    String? category,
    String? unit,
    int? unitPrice,
    int? quantity,
    int? oraclePrice,
  }) {
    return BoqItemModel(
      materialName: materialName ?? this.materialName,
      category: category ?? this.category,
      unit: unit ?? this.unit,
      unitPrice: unitPrice ?? this.unitPrice,
      quantity: quantity ?? this.quantity,
      oraclePrice: oraclePrice ?? this.oraclePrice,
    );
  }

  @override
  List<Object?> get props => [
        materialName,
        category,
        unit,
        unitPrice,
        quantity,
        oraclePrice,
      ];
}
