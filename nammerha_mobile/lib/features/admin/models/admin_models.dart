// ============================================================================
// Nammerha Admin Panel — Typed Models (Platinum Standard)
// ============================================================================
// Strict Dart models for all admin API responses. No Map<String, dynamic>
// leaks into the UI layer. Every field is explicitly typed and documented.
// ============================================================================

/// Platform-wide summary counters (GET /api/admin/stats/overview)
class PlatformOverview {
  final int totalUsers;
  final int totalProjects;
  final int totalDonations;
  final int totalFundedAmount;   // cents
  final int totalEscrowReleased; // cents
  final int activeEngineers;
  final int activeContractors;
  final int verifiedProofs;

  const PlatformOverview({
    required this.totalUsers,
    required this.totalProjects,
    required this.totalDonations,
    required this.totalFundedAmount,
    required this.totalEscrowReleased,
    required this.activeEngineers,
    required this.activeContractors,
    required this.verifiedProofs,
  });

  factory PlatformOverview.fromJson(Map<String, dynamic> json) {
    return PlatformOverview(
      totalUsers: _toInt(json['total_users']),
      totalProjects: _toInt(json['total_projects']),
      totalDonations: _toInt(json['total_donations']),
      totalFundedAmount: _toInt(json['total_funded_amount']),
      totalEscrowReleased: _toInt(json['total_escrow_released']),
      activeEngineers: _toInt(json['active_engineers']),
      activeContractors: _toInt(json['active_contractors']),
      verifiedProofs: _toInt(json['verified_proofs']),
    );
  }
}

/// Time-series data point (month + count)
class MonthlyDataPoint {
  final String month; // 'YYYY-MM'
  final int count;

  const MonthlyDataPoint({required this.month, required this.count});

  factory MonthlyDataPoint.fromJson(Map<String, dynamic> json) {
    return MonthlyDataPoint(
      month: json['month'] as String? ?? '',
      count: _toInt(json['count']),
    );
  }
}

/// Time-series data point (month + amount in cents)
class MonthlyAmountPoint {
  final String month;
  final int totalAmount; // cents

  const MonthlyAmountPoint({required this.month, required this.totalAmount});

  factory MonthlyAmountPoint.fromJson(Map<String, dynamic> json) {
    return MonthlyAmountPoint(
      month: json['month'] as String? ?? '',
      totalAmount: _toInt(json['total_amount']),
    );
  }
}

/// Project funding progress snapshot
class FundingProgressPoint {
  final String projectId;
  final String title;
  final int totalEstimatedCost; // cents
  final int totalFundedAmount;  // cents
  final double fundedPercentage;
  final String? publishedAt;

  const FundingProgressPoint({
    required this.projectId,
    required this.title,
    required this.totalEstimatedCost,
    required this.totalFundedAmount,
    required this.fundedPercentage,
    this.publishedAt,
  });

  factory FundingProgressPoint.fromJson(Map<String, dynamic> json) {
    return FundingProgressPoint(
      projectId: json['project_id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      totalEstimatedCost: _toInt(json['total_estimated_cost']),
      totalFundedAmount: _toInt(json['total_funded_amount']),
      fundedPercentage: _toDouble(json['funded_percentage']),
      publishedAt: json['published_at'] as String?,
    );
  }
}

/// Escrow verification case (pending spatial proof)
class EscrowCase {
  final String proofId;
  final String itemId;
  final String poNumber;
  final String vendorName;
  final int amountCents;
  final double? latitude;
  final double? longitude;
  final String? photoUrl;
  final String status;
  final String? description;
  final String? submittedAt;
  final String? projectTitle;

  const EscrowCase({
    required this.proofId,
    required this.itemId,
    required this.poNumber,
    required this.vendorName,
    required this.amountCents,
    this.latitude,
    this.longitude,
    this.photoUrl,
    required this.status,
    this.description,
    this.submittedAt,
    this.projectTitle,
  });

  factory EscrowCase.fromJson(Map<String, dynamic> json) {
    return EscrowCase(
      proofId: json['proof_id'] as String? ?? '',
      itemId: json['item_id'] as String? ?? json['boq_item_id'] as String? ?? '',
      poNumber: json['po_number'] as String? ?? '',
      vendorName: json['vendor_name'] as String? ?? json['supplier_name'] as String? ?? '',
      amountCents: _toInt(json['amount_locked'] ?? json['amount_cents'] ?? json['amount']),
      latitude: _toDoubleOrNull(json['latitude'] ?? json['gps_latitude']),
      longitude: _toDoubleOrNull(json['longitude'] ?? json['gps_longitude']),
      photoUrl: json['photo_url'] as String? ?? json['image_url'] as String?,
      status: json['verification_status'] as String? ?? json['status'] as String? ?? 'pending',
      description: json['description'] as String? ?? json['action_description'] as String?,
      submittedAt: json['submitted_at'] as String? ?? json['created_at'] as String?,
      projectTitle: json['project_title'] as String? ?? json['title'] as String?,
    );
  }
}

/// KYC application entry
class KycEntry {
  final String userId;
  final String fullName;
  final String email;
  final String role;
  final String kycStatus;
  final String? kycDocumentUrl;
  final String? commercialRegisterNumber;
  final String? engineeringLicenseNumber;
  final String? guildMembershipId;
  final String createdAt;
  final String updatedAt;

  const KycEntry({
    required this.userId,
    required this.fullName,
    required this.email,
    required this.role,
    required this.kycStatus,
    this.kycDocumentUrl,
    this.commercialRegisterNumber,
    this.engineeringLicenseNumber,
    this.guildMembershipId,
    required this.createdAt,
    required this.updatedAt,
  });

  factory KycEntry.fromJson(Map<String, dynamic> json) {
    return KycEntry(
      userId: json['user_id'] as String? ?? '',
      fullName: json['full_name'] as String? ?? '',
      email: json['email'] as String? ?? '',
      role: json['role'] as String? ?? '',
      kycStatus: json['kyc_verification_status'] as String? ?? 'pending',
      kycDocumentUrl: json['kyc_document_url'] as String?,
      commercialRegisterNumber: json['commercial_register_number'] as String?,
      engineeringLicenseNumber: json['engineering_license_number'] as String?,
      guildMembershipId: json['guild_membership_id'] as String?,
      createdAt: json['created_at'] as String? ?? '',
      updatedAt: json['updated_at'] as String? ?? '',
    );
  }
}

/// KYC stats summary
class KycStats {
  final int pending;
  final int verified;
  final int rejected;
  final int total;

  const KycStats({
    required this.pending,
    required this.verified,
    required this.rejected,
    required this.total,
  });

  factory KycStats.fromJson(Map<String, dynamic> json) {
    return KycStats(
      pending: _toInt(json['pending']),
      verified: _toInt(json['verified']),
      rejected: _toInt(json['rejected']),
      total: _toInt(json['total']),
    );
  }
}

/// Revenue admin summary KPIs
class RevenueSummary {
  final int totalCommissionRevenue; // cents
  final int totalTipRevenue;        // cents
  final int mtdCommissions;         // cents
  final int mtdTips;                // cents
  final int transactionCount;
  final double averageCommissionBps;

  const RevenueSummary({
    required this.totalCommissionRevenue,
    required this.totalTipRevenue,
    required this.mtdCommissions,
    required this.mtdTips,
    required this.transactionCount,
    required this.averageCommissionBps,
  });

  factory RevenueSummary.fromJson(Map<String, dynamic> json) {
    return RevenueSummary(
      totalCommissionRevenue: _toInt(json['total_commission_revenue']),
      totalTipRevenue: _toInt(json['total_tip_revenue']),
      mtdCommissions: _toInt(json['mtd_commissions']),
      mtdTips: _toInt(json['mtd_tips']),
      transactionCount: _toInt(json['transaction_count']),
      averageCommissionBps: _toDouble(json['average_commission_bps']),
    );
  }
}

/// Commission tier configuration
class CommissionTier {
  final String tierId;
  final String tierName;
  final int rateBps; // basis points (e.g. 250 = 2.50%)
  final int minAmountCents;
  final int? maxAmountCents;
  final bool isActive;

  const CommissionTier({
    required this.tierId,
    required this.tierName,
    required this.rateBps,
    required this.minAmountCents,
    this.maxAmountCents,
    required this.isActive,
  });

  String get ratePercent => '${(rateBps / 100).toStringAsFixed(2)}%';

  factory CommissionTier.fromJson(Map<String, dynamic> json) {
    return CommissionTier(
      tierId: json['tier_id'] as String? ?? json['config_id'] as String? ?? '',
      tierName: json['tier_name'] as String? ?? json['name'] as String? ?? '',
      rateBps: _toInt(json['rate_bps'] ?? json['commission_rate_bps']),
      minAmountCents: _toInt(json['min_amount_cents'] ?? json['min_amount']),
      maxAmountCents: _toIntOrNull(json['max_amount_cents'] ?? json['max_amount']),
      isActive: json['is_active'] as bool? ?? true,
    );
  }
}

/// Single commission entry
class CommissionEntry {
  final String commissionId;
  final int amountCents;
  final int rateBps;
  final String sourceType;
  final String createdAt;

  const CommissionEntry({
    required this.commissionId,
    required this.amountCents,
    required this.rateBps,
    required this.sourceType,
    required this.createdAt,
  });

  factory CommissionEntry.fromJson(Map<String, dynamic> json) {
    return CommissionEntry(
      commissionId: json['commission_id'] as String? ?? '',
      amountCents: _toInt(json['amount_cents'] ?? json['amount']),
      rateBps: _toInt(json['rate_bps']),
      sourceType: json['source_type'] as String? ?? '',
      createdAt: json['created_at'] as String? ?? '',
    );
  }
}

/// Single tip entry
class TipEntry {
  final String tipId;
  final int amountCents;
  final String donorName;
  final String createdAt;

  const TipEntry({
    required this.tipId,
    required this.amountCents,
    required this.donorName,
    required this.createdAt,
  });

  factory TipEntry.fromJson(Map<String, dynamic> json) {
    return TipEntry(
      tipId: json['tip_id'] as String? ?? '',
      amountCents: _toInt(json['amount_cents'] ?? json['amount']),
      donorName: json['donor_name'] as String? ?? '',
      createdAt: json['created_at'] as String? ?? '',
    );
  }
}

/// Escrow fee summary (FinTech)
class EscrowFeeSummary {
  final int totalFeesCount;
  final int totalFeeRevenue;    // cents
  final int mtdFeeRevenue;      // cents
  final int averageFeeCents;
  final double averageFeeRateBps;

  const EscrowFeeSummary({
    required this.totalFeesCount,
    required this.totalFeeRevenue,
    required this.mtdFeeRevenue,
    required this.averageFeeCents,
    required this.averageFeeRateBps,
  });

  factory EscrowFeeSummary.fromJson(Map<String, dynamic> json) {
    return EscrowFeeSummary(
      totalFeesCount: _toInt(json['total_fees_count']),
      totalFeeRevenue: _toInt(json['total_fee_revenue']),
      mtdFeeRevenue: _toInt(json['mtd_fee_revenue']),
      averageFeeCents: _toInt(json['average_fee_cents']),
      averageFeeRateBps: _toDouble(json['average_fee_rate_bps']),
    );
  }
}

/// Fee configuration entry
class FeeConfig {
  final String configId;
  final String feeName;
  final int feeRateBps;
  final int minFeeCents;
  final int? maxFeeCents;
  final String appliesTo;
  final bool isActive;

  const FeeConfig({
    required this.configId,
    required this.feeName,
    required this.feeRateBps,
    required this.minFeeCents,
    this.maxFeeCents,
    required this.appliesTo,
    required this.isActive,
  });

  String get ratePercent => '${(feeRateBps / 100).toStringAsFixed(2)}%';

  factory FeeConfig.fromJson(Map<String, dynamic> json) {
    return FeeConfig(
      configId: json['config_id'] as String? ?? '',
      feeName: json['fee_name'] as String? ?? '',
      feeRateBps: _toInt(json['fee_rate_bps']),
      minFeeCents: _toInt(json['min_fee_cents']),
      maxFeeCents: _toIntOrNull(json['max_fee_cents']),
      appliesTo: json['applies_to'] as String? ?? '',
      isActive: json['is_active'] as bool? ?? true,
    );
  }
}

/// Enterprise organization
class EnterpriseOrg {
  final String orgId;
  final String orgName;
  final String orgType;
  final String contactEmail;
  final String tier;
  final bool isActive;

  const EnterpriseOrg({
    required this.orgId,
    required this.orgName,
    required this.orgType,
    required this.contactEmail,
    required this.tier,
    required this.isActive,
  });

  factory EnterpriseOrg.fromJson(Map<String, dynamic> json) {
    return EnterpriseOrg(
      orgId: json['org_id'] as String? ?? '',
      orgName: json['org_name'] as String? ?? '',
      orgType: json['org_type'] as String? ?? '',
      contactEmail: json['contact_email'] as String? ?? '',
      tier: json['tier'] as String? ?? '',
      isActive: json['is_active'] as bool? ?? true,
    );
  }
}

/// Oracle price entry (EPA/FIDIC material pricing)
class OraclePriceEntry {
  final String materialId;
  final String materialName;
  final String unit;
  final double currentPrice;
  final double previousPrice;
  final double changePercent;
  final String updatedAt;

  const OraclePriceEntry({
    required this.materialId,
    required this.materialName,
    required this.unit,
    required this.currentPrice,
    required this.previousPrice,
    required this.changePercent,
    required this.updatedAt,
  });

  factory OraclePriceEntry.fromJson(Map<String, dynamic> json) {
    return OraclePriceEntry(
      materialId: json['material_id'] as String? ?? json['id'] as String? ?? '',
      materialName: json['material_name'] as String? ?? json['name'] as String? ?? '',
      unit: json['unit'] as String? ?? '',
      currentPrice: _toDouble(json['current_price'] ?? json['price']),
      previousPrice: _toDouble(json['previous_price'] ?? json['old_price']),
      changePercent: _toDouble(json['change_percent'] ?? json['change']),
      updatedAt: json['updated_at'] as String? ?? '',
    );
  }
}

/// Refund request
class RefundRequest {
  final String refundId;
  final String donorName;
  final int amountCents;
  final String reason;
  final String status;
  final String createdAt;

  const RefundRequest({
    required this.refundId,
    required this.donorName,
    required this.amountCents,
    required this.reason,
    required this.status,
    required this.createdAt,
  });

  factory RefundRequest.fromJson(Map<String, dynamic> json) {
    return RefundRequest(
      refundId: json['refund_id'] as String? ?? '',
      donorName: json['donor_name'] as String? ?? '',
      amountCents: _toInt(json['amount_cents'] ?? json['amount']),
      reason: json['reason'] as String? ?? '',
      status: json['status'] as String? ?? 'pending',
      createdAt: json['created_at'] as String? ?? '',
    );
  }
}

// ─── Safe Type Coercion Helpers ─────────────────────────────────────────────
// Handles mixed types from JSON (int, double, String) without runtime crashes.

int _toInt(dynamic value) {
  if (value == null) return 0;
  if (value is int) return value;
  if (value is double) return value.toInt();
  if (value is String) return int.tryParse(value) ?? 0;
  return 0;
}

int? _toIntOrNull(dynamic value) {
  if (value == null) return null;
  return _toInt(value);
}

double _toDouble(dynamic value) {
  if (value == null) return 0.0;
  if (value is double) return value;
  if (value is int) return value.toDouble();
  if (value is String) return double.tryParse(value) ?? 0.0;
  return 0.0;
}

double? _toDoubleOrNull(dynamic value) {
  if (value == null) return null;
  return _toDouble(value);
}
