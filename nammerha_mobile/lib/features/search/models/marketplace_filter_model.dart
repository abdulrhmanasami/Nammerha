// lib/features/search/models/marketplace_filter_model.dart
class MarketplaceFilters {
  final String? keyword;
  final String? category;
  final String? region;
  final double? minBudget;
  final double? maxBudget;
  final bool? ofacClearance;

  const MarketplaceFilters({
    this.keyword,
    this.category,
    this.region,
    this.minBudget,
    this.maxBudget,
    this.ofacClearance,
  });

  Map<String, dynamic> toJson() {
    final map = <String, dynamic>{};
    if (keyword != null && keyword!.isNotEmpty) map['keyword'] = keyword;
    if (category != null && category!.isNotEmpty) map['category'] = category;
    if (region != null && region!.isNotEmpty) map['region'] = region;
    if (minBudget != null) map['minBudget'] = minBudget;
    if (maxBudget != null) map['maxBudget'] = maxBudget;
    if (ofacClearance != null) map['ofacClearance'] = ofacClearance;
    return map;
  }

  MarketplaceFilters copyWith({
    String? keyword,
    String? category,
    String? region,
    double? minBudget,
    double? maxBudget,
    bool? ofacClearance,
  }) {
    return MarketplaceFilters(
      keyword: keyword ?? this.keyword,
      category: category ?? this.category,
      region: region ?? this.region,
      minBudget: minBudget ?? this.minBudget,
      maxBudget: maxBudget ?? this.maxBudget,
      ofacClearance: ofacClearance ?? this.ofacClearance,
    );
  }
}
