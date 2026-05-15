import '../../../core/network/api_client.dart';
import '../models/service_contract.dart';
import '../models/contract_payment.dart';
import '../models/contract_milestone.dart';
import '../models/payment_enums.dart';

/// Contract Payment Repository — Hybrid transport layer for service contracts.
///
/// Architecture:
///   - REST-first for all CRUD operations (no GraphQL resolvers for contracts yet)
///   - Idempotency-Key enforced on all POST endpoints (financial safety)
///
/// Error Handling:
///   - Network errors surface as [ApiException]
///   - Validation errors extracted from response body
class ContractPaymentRepository {
  final NammerhaApiClient _api;

  ContractPaymentRepository({NammerhaApiClient? api})
      : _api = api ?? NammerhaApiClient.instance;

  // ─── Contracts ──────────────────────────────────────────────────────────

  /// GET /api/contracts/my — list contracts for the current user
  Future<List<ServiceContract>> getMyContracts({
    String? status,
    int limit = 20,
    int offset = 0,
  }) async {
    final params = <String, String>{
      'limit': limit.toString(),
      'offset': offset.toString(),
    };
    if (status != null) params['status'] = status;
    final qs = params.entries.map((e) => '${e.key}=${e.value}').join('&');

    final response = await _api.request<List<dynamic>>(
      '/contracts/my?$qs',
      fromData: (d) => d as List<dynamic>,
    );

    if (response.success && response.data != null) {
      return response.data!
          .map((d) => ServiceContract.fromJson(d as Map<String, dynamic>))
          .toList();
    }

    throw ApiException(response.error ?? 'Failed to load contracts');
  }

  /// GET /api/contracts/:id — full contract with milestones + payments
  Future<ServiceContract> getContractDetails(String contractId) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/contracts/$contractId',
      fromData: (d) => d as Map<String, dynamic>,
    );

    if (response.success && response.data != null) {
      return ServiceContract.fromJson(response.data!);
    }

    throw ApiException(response.error ?? 'Failed to load contract');
  }

  /// POST /api/contracts — create a new service contract
  Future<ServiceContract> createContract({
    required String projectId,
    required String providerId,
    required ProviderType providerType,
    required int totalAgreedAmount,
    String? bidId,
    String? notes,
    List<Map<String, dynamic>>? milestones,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/contracts',
      method: 'POST',
      idempotent: true,
      body: {
        'project_id': projectId,
        'provider_id': providerId,
        'provider_type': providerType.apiValue,
        'total_agreed_amount': totalAgreedAmount,
        if (bidId != null) 'bid_id': bidId,
        if (notes != null) 'notes': notes,
        if (milestones != null) 'milestones': milestones,
      },
      fromData: (d) => d as Map<String, dynamic>,
    );

    if (response.success && response.data != null) {
      return ServiceContract.fromJson(response.data!);
    }

    throw ApiException(response.error ?? 'Failed to create contract');
  }

  // ─── Milestones ─────────────────────────────────────────────────────────

  /// GET /api/contracts/:id/milestones
  Future<List<ContractMilestone>> getMilestones(String contractId) async {
    final response = await _api.request<List<dynamic>>(
      '/contracts/$contractId/milestones',
      fromData: (d) => d as List<dynamic>,
    );

    if (response.success && response.data != null) {
      return response.data!
          .map((d) => ContractMilestone.fromJson(d as Map<String, dynamic>))
          .toList();
    }

    throw ApiException(response.error ?? 'Failed to load milestones');
  }

  // ─── Payments ───────────────────────────────────────────────────────────

  /// GET /api/contracts/:id/payments — payment history for a contract
  Future<List<ContractPayment>> getContractPayments(String contractId) async {
    final response = await _api.request<List<dynamic>>(
      '/contracts/$contractId/payments',
      fromData: (d) => d as List<dynamic>,
    );

    if (response.success && response.data != null) {
      return response.data!
          .map((d) => ContractPayment.fromJson(d as Map<String, dynamic>))
          .toList();
    }

    throw ApiException(response.error ?? 'Failed to load payments');
  }

  /// POST /api/contracts/:id/payments — record a new payment
  ///
  /// For Fatora: returns checkout_url for redirect
  /// For Cash/Transfer: records as pending dual-confirmation
  Future<ContractPayment> createPayment({
    required String contractId,
    required int amount,
    required PaymentMethod method,
    String? milestoneId,
    String? confirmationNote,
    String? transferReceiptUrl,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/contracts/$contractId/payments',
      method: 'POST',
      idempotent: true,
      body: {
        'amount': amount,
        'payment_method': method.apiValue,
        if (milestoneId != null) 'milestone_id': milestoneId,
        if (confirmationNote != null) 'confirmation_note': confirmationNote,
        if (transferReceiptUrl != null) 'transfer_receipt_url': transferReceiptUrl,
      },
      fromData: (d) => d as Map<String, dynamic>,
    );

    if (response.success && response.data != null) {
      return ContractPayment.fromJson(response.data!);
    }

    throw ApiException(response.error ?? 'Failed to create payment');
  }

  /// POST /api/contracts/payments/:paymentId/confirm — confirm receipt
  ///
  /// Used by the counterparty (payee) to confirm they received
  /// a cash or bank transfer payment.
  Future<ContractPayment> confirmPayment({
    required String paymentId,
    String? note,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/contracts/payments/$paymentId/confirm',
      method: 'POST',
      idempotent: true,
      body: {
        if (note != null) 'note': note,
      },
      fromData: (d) => d as Map<String, dynamic>,
    );

    if (response.success && response.data != null) {
      return ContractPayment.fromJson(response.data!);
    }

    throw ApiException(response.error ?? 'Failed to confirm payment');
  }
}
