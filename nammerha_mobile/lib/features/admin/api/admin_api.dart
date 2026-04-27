// ============================================================================
// Nammerha Admin Panel — API Service (Platinum Standard)
// ============================================================================
// Single API class covering all 6 admin domains. Maps 1:1 to the web api.ts
// admin/revenueAdmin/enterpriseAdmin/epaOracle exports.
//
// All POST mutations include Idempotency-Key headers (Nammerha Domain Law 1).
// All responses are parsed into typed models (no raw Map in UI layer).
// ============================================================================

import 'dart:math';
import '../../admin/models/admin_models.dart';
import '../../../core/network/api_client.dart';

/// Generate a v4 UUID for Idempotency-Key headers (Nammerha Domain Law 1)
String _generateIdempotencyKey() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

class AdminApi {
  final NammerhaApiClient _api;
  AdminApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  // ─── Dashboard & Stats ──────────────────────────────────────────────────

  /// GET /api/admin/stats/overview — Platform-wide summary counters
  Future<PlatformOverview> getStatsOverview() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/admin/stats/overview',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return PlatformOverview.fromJson(response.data ?? {});
  }

  /// GET /api/admin/stats/projects-by-month — Projects created per month
  Future<List<MonthlyDataPoint>> getProjectsByMonth({int months = 12}) async {
    final response = await _api.request<List<dynamic>>(
      '/admin/stats/projects-by-month?months=$months',
      fromData: (d) => d as List<dynamic>,
    );
    return (response.data ?? [])
        .map((e) => MonthlyDataPoint.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /api/admin/stats/donations-by-month — Donation amounts per month
  Future<List<MonthlyAmountPoint>> getDonationsByMonth({int months = 12}) async {
    final response = await _api.request<List<dynamic>>(
      '/admin/stats/donations-by-month?months=$months',
      fromData: (d) => d as List<dynamic>,
    );
    return (response.data ?? [])
        .map((e) => MonthlyAmountPoint.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /api/admin/stats/users-by-month — New registrations per month
  Future<List<MonthlyDataPoint>> getUsersByMonth({int months = 12}) async {
    final response = await _api.request<List<dynamic>>(
      '/admin/stats/users-by-month?months=$months',
      fromData: (d) => d as List<dynamic>,
    );
    return (response.data ?? [])
        .map((e) => MonthlyDataPoint.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /api/admin/stats/funding-progress — Funding % per project
  Future<List<FundingProgressPoint>> getFundingProgress({int limit = 20}) async {
    final response = await _api.request<List<dynamic>>(
      '/admin/stats/funding-progress?limit=$limit',
      fromData: (d) => d as List<dynamic>,
    );
    return (response.data ?? [])
        .map((e) => FundingProgressPoint.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ─── Escrow Verification ────────────────────────────────────────────────

  /// GET /api/admin/verifications/pending — Pending spatial proof cases
  Future<List<EscrowCase>> getPendingVerifications({
    int limit = 25,
    int offset = 0,
  }) async {
    final response = await _api.request<List<dynamic>>(
      '/admin/verifications/pending?limit=$limit&offset=$offset',
      fromData: (d) => d as List<dynamic>,
    );
    return (response.data ?? [])
        .map((e) => EscrowCase.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// POST /api/admin/escrow/release — Release escrow funds
  /// Includes Idempotency-Key (Nammerha Domain Law 1: Zero double-spend)
  Future<Map<String, dynamic>> releaseEscrow({
    required String proofId,
    required String itemId,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/admin/escrow/release',
      method: 'POST',
      body: {'proof_id': proofId, 'item_id': itemId},
      extraHeaders: {'Idempotency-Key': _generateIdempotencyKey()},
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// POST /api/admin/escrow/flag — Flag discrepancy (reject proof)
  /// Includes Idempotency-Key
  Future<Map<String, dynamic>> flagDiscrepancy({
    required String proofId,
    required String reason,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/admin/escrow/flag',
      method: 'POST',
      body: {'proof_id': proofId, 'reason': reason},
      extraHeaders: {'Idempotency-Key': _generateIdempotencyKey()},
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/admin/refund-requests — Pending refund requests
  Future<List<RefundRequest>> getRefundRequests() async {
    final response = await _api.request<List<dynamic>>(
      '/admin/refund-requests',
      fromData: (d) => d as List<dynamic>,
    );
    return (response.data ?? [])
        .map((e) => RefundRequest.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// POST /api/admin/escrow/refund — Process refund decision
  Future<Map<String, dynamic>> processRefund({
    required String refundId,
    required String decision, // 'approved' | 'rejected'
    String? notes,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/admin/escrow/refund',
      method: 'POST',
      body: {
        'refund_id': refundId,
        'decision': decision,
        'notes': ?notes,
      },
      extraHeaders: {'Idempotency-Key': _generateIdempotencyKey()},
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  // ─── KYC Verification ──────────────────────────────────────────────────

  /// GET /api/admin/kyc/queue — KYC verification queue
  Future<List<KycEntry>> getKycQueue({
    String? status,
    int limit = 25,
    int offset = 0,
  }) async {
    final params = <String>[];
    if (status != null) params.add('status=$status');
    params.add('limit=$limit');
    params.add('offset=$offset');
    final qs = params.join('&');

    final response = await _api.request<List<dynamic>>(
      '/admin/kyc/queue?$qs',
      fromData: (d) => d as List<dynamic>,
    );
    return (response.data ?? [])
        .map((e) => KycEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /api/admin/kyc/stats — KYC status counts
  Future<KycStats> getKycStats() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/admin/kyc/stats',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return KycStats.fromJson(response.data ?? {});
  }

  /// POST /api/admin/kyc/:userId/decision — Approve/reject KYC
  Future<Map<String, dynamic>> updateKycStatus({
    required String userId,
    required String decision, // 'verified' | 'rejected'
    String? reason,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/admin/kyc/$userId/decision',
      method: 'POST',
      body: {
        'decision': decision,
        'reason': ?reason,
      },
      extraHeaders: {'Idempotency-Key': _generateIdempotencyKey()},
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  // ─── Revenue Dashboard ─────────────────────────────────────────────────

  /// GET /api/revenue/admin/summary — Revenue KPIs
  Future<RevenueSummary> getRevenueSummary() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/revenue/admin/summary',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return RevenueSummary.fromJson(response.data ?? {});
  }

  /// GET /api/revenue/admin/config — Commission tiers
  Future<List<CommissionTier>> getCommissionTiers() async {
    final response = await _api.request<List<dynamic>>(
      '/revenue/admin/config',
      fromData: (d) => d as List<dynamic>,
    );
    return (response.data ?? [])
        .map((e) => CommissionTier.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /api/revenue/admin/commissions — Recent commissions
  Future<List<CommissionEntry>> getRecentCommissions({int limit = 8}) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/revenue/admin/commissions?limit=$limit',
      fromData: (d) => d as Map<String, dynamic>,
    );
    final rows = (response.data?['rows'] as List<dynamic>?) ?? [];
    return rows
        .map((e) => CommissionEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /api/revenue/admin/tips — Recent tips
  Future<List<TipEntry>> getRecentTips({int limit = 8}) async {
    final response = await _api.request<List<dynamic>>(
      '/revenue/admin/tips?limit=$limit',
      fromData: (d) => d as List<dynamic>,
    );
    return (response.data ?? [])
        .map((e) => TipEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ─── FinTech & Enterprise ──────────────────────────────────────────────

  /// GET /api/enterprise/admin/fees/summary — Escrow fee KPIs
  Future<EscrowFeeSummary> getFeeSummary() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/enterprise/admin/fees/summary',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return EscrowFeeSummary.fromJson(response.data ?? {});
  }

  /// GET /api/enterprise/admin/fees/config — Fee configuration
  Future<List<FeeConfig>> getFeeConfigs() async {
    final response = await _api.request<List<dynamic>>(
      '/enterprise/admin/fees/config',
      fromData: (d) => d as List<dynamic>,
    );
    return (response.data ?? [])
        .map((e) => FeeConfig.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /api/enterprise/admin/organizations — Enterprise orgs
  Future<List<EnterpriseOrg>> getOrganizations() async {
    final response = await _api.request<List<dynamic>>(
      '/enterprise/admin/organizations',
      fromData: (d) => d as List<dynamic>,
    );
    return (response.data ?? [])
        .map((e) => EnterpriseOrg.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ─── Oracle (EPA / FIDIC Pricing) ──────────────────────────────────────

  /// GET /api/epa/prices — Material price ticker
  Future<List<OraclePriceEntry>> getOraclePrices() async {
    final response = await _api.request<List<dynamic>>(
      '/epa/prices',
      fromData: (d) => d as List<dynamic>,
    );
    return (response.data ?? [])
        .map((e) => OraclePriceEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
