import '../network/api_client.dart';
import '../../features/homeowner/models/homeowner_models.dart';
import '../../features/donor/models/donor_models.dart';

/// Utility to format currency in Syrian Pounds
String formatCurrency(num amountCents) {
  final amount = amountCents is int ? amountCents : amountCents.toInt();
  final formatted = amount.toStringAsFixed(0).replaceAllMapped(
    RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
    (Match m) => '${m[1]},',
  );
  return '$formatted ل.س';
}

// ═══════════════════════════════════════════════════════════════════════════
// MARKETPLACE API — Mirrors api.ts marketplace + projects
// ═══════════════════════════════════════════════════════════════════════════

class MarketplaceApi {
  final NammerhaApiClient _api;
  MarketplaceApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// GET /api/marketplace/projects
  Future<List<Map<String, dynamic>>> getProjects({
    String? damageType,
    String? sortBy,
    int? limit,
    int? offset,
  }) async {
    final params = <String, String>{};
    if (damageType != null) params['damage_type'] = damageType;
    if (sortBy != null) params['sort_by'] = sortBy;
    if (limit != null) params['limit'] = limit.toString();
    if (offset != null) params['offset'] = offset.toString();
    final qs = params.entries.map((e) => '${e.key}=${e.value}').join('&');
    final endpoint = '/marketplace/projects${qs.isNotEmpty ? '?$qs' : ''}';
    final response = await _api.request<List<dynamic>>(endpoint, fromData: (d) => d as List<dynamic>);
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/marketplace/projects/:id/boq
  Future<List<Map<String, dynamic>>> getProjectBOQ(String projectId) async {
    final response = await _api.request<List<dynamic>>(
      '/marketplace/projects/$projectId/boq',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/projects/:id
  Future<Map<String, dynamic>?> getProject(String projectId) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/projects/$projectId',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DONOR API — Mirrors api.ts donor module
// ═══════════════════════════════════════════════════════════════════════════

class DonorApi {
  final NammerhaApiClient _api;
  DonorApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// GET /api/donor/stats
  Future<DonorStatsModel> getStats() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/donor/stats',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return DonorStatsModel.fromJson(response.data ?? {});
  }

  /// GET /api/donor/donations
  Future<List<DonorDonationModel>> getDonations({int? limit}) async {
    final qs = limit != null ? '?limit=$limit' : '';
    final response = await _api.request<List<dynamic>>(
      '/donor/donations$qs',
      fromData: (d) => d as List<dynamic>,
    );
    return (response.data ?? [])
        .cast<Map<String, dynamic>>()
        .map(DonorDonationModel.fromJson)
        .toList();
  }

  /// GET /api/donor/impact
  Future<List<DonorFundedProjectModel>> getImpact() async {
    final response = await _api.request<List<dynamic>>(
      '/donor/impact',
      fromData: (d) => d as List<dynamic>,
    );
    return (response.data ?? [])
        .cast<Map<String, dynamic>>()
        .map(DonorFundedProjectModel.fromJson)
        .toList();
  }

  /// GET /api/donor/marketplace
  Future<List<DonorMarketplaceProjectModel>> getMarketplace() async {
    final response = await _api.request<List<dynamic>>(
      '/donor/marketplace',
      fromData: (d) => d as List<dynamic>,
    );
    return (response.data ?? [])
        .cast<Map<String, dynamic>>()
        .map(DonorMarketplaceProjectModel.fromJson)
        .toList();
  }

  /// GET /api/donor/proofs
  Future<List<DonorProofModel>> getProofs() async {
    final response = await _api.request<List<dynamic>>(
      '/donor/proofs',
      fromData: (d) => d as List<dynamic>,
    );
    return (response.data ?? [])
        .cast<Map<String, dynamic>>()
        .map(DonorProofModel.fromJson)
        .toList();
  }

  /// GET /api/donor/timeline
  Future<List<Map<String, dynamic>>> getTimeline({int? limit}) async {
    final qs = limit != null ? '?limit=$limit' : '';
    final response = await _api.request<List<dynamic>>(
      '/donor/timeline$qs',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/donor/projects/:id/funding — Per-project funding breakdown
  /// GAP-A05 REMEDIATION: Mobile parity with web donor.getProjectFunding()
  Future<Map<String, dynamic>> getProjectFunding(String projectId) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/donor/projects/$projectId/funding',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// POST /api/donor/refunds
  Future<void> requestRefund({
    required String escrowId,
    required String reason,
  }) async {
    await _api.request(
      '/donor/refunds',
      method: 'POST',
      body: {'escrow_id': escrowId, 'reason': reason},
      idempotent: true,
    );
  }

  /// GET /api/donor/receipts/:escrowId — returns PDF receipt URL
  Future<String?> getReceiptUrl(String escrowId) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/donor/receipts/$escrowId',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data?['url'] as String?;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DONATIONS API — Mirrors api.ts donations module
// ═══════════════════════════════════════════════════════════════════════════

class DonationsApi {
  final NammerhaApiClient _api;
  DonationsApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// POST /api/donations
  Future<Map<String, dynamic>?> createDonation({
    required List<Map<String, dynamic>> items,
    String paymentMethod = 'fatora',
    String? returnUrl,
    String? giftRecipientName,
    String? giftMessage,
    String? donationIntent,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/donations',
      method: 'POST',
      idempotent: true,
      body: {
        'items': items,
        'payment_method': paymentMethod,
        if (returnUrl != null) 'return_url': returnUrl,
        if (giftRecipientName != null) 'gift_recipient_name': giftRecipientName,
        if (giftMessage != null) 'gift_message': giftMessage,
        if (donationIntent != null) 'donation_intent': donationIntent,
      },
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data;
  }

  /// GET /api/donations/my/summary
  Future<Map<String, dynamic>> getMyEscrow() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/donations/my/summary',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/donations/my/history
  Future<List<Map<String, dynamic>>> getMyHistory() async {
    final response = await _api.request<List<dynamic>>(
      '/donations/my/history',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ENGINEER API — Mirrors api.ts engineer module
// ═══════════════════════════════════════════════════════════════════════════

class EngineerApi {
  final NammerhaApiClient _api;
  EngineerApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// GET /api/engineer/stats
  Future<Map<String, dynamic>> getStats() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/engineer/stats',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/engineer/projects
  Future<List<Map<String, dynamic>>> getProjects({String? status}) async {
    final qs = status != null ? '?status=$status' : '';
    final response = await _api.request<List<dynamic>>(
      '/engineer/projects$qs',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/engineer/bids
  Future<List<Map<String, dynamic>>> getBids({String? status}) async {
    final qs = status != null ? '?status=$status' : '';
    final response = await _api.request<List<dynamic>>(
      '/engineer/bids$qs',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/engineer/profile
  Future<Map<String, dynamic>> getProfile() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/engineer/profile',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// POST /api/engineer/camera/spatial-proof
  Future<void> submitSpatialProof({
    required String itemId,
    required String projectId,
    required String imageUrl,
    required double gpsLat,
    required double gpsLng,
    double? gpsAccuracyMeters,
    String? description,
    String? clientHash,
  }) async {
    await _api.request(
      '/engineer/camera/spatial-proof',
      method: 'POST',
      idempotent: true,
      body: {
        'item_id': itemId,
        'project_id': projectId,
        'image_url': imageUrl,
        'gps_lat': gpsLat,
        'gps_lng': gpsLng,
        if (gpsAccuracyMeters != null) 'gps_accuracy_meters': gpsAccuracyMeters,
        if (description != null) 'description': description,
        if (clientHash != null) 'client_hash': clientHash,
      },
    );
  }

  /// POST /api/engineer/camera/capture
  Future<void> submitCapture({
    required String projectId,
    required String fileUrl,
    required String constructionPhase,
    String? captureType,
    String? title,
    String? description,
    double? gpsLat,
    double? gpsLng,
  }) async {
    await _api.request(
      '/engineer/camera/capture',
      method: 'POST',
      idempotent: true,
      body: {
        'project_id': projectId,
        'file_url': fileUrl,
        'construction_phase': constructionPhase,
        if (captureType != null) 'capture_type': captureType,
        if (title != null) 'title': title,
        if (description != null) 'description': description,
        if (gpsLat != null) 'gps_lat': gpsLat,
        if (gpsLng != null) 'gps_lng': gpsLng,
      },
    );
  }

  /// GET /api/engineer/captures — My recent captures
  /// GAP-A06 REMEDIATION: Mobile parity with web engineer.getCaptures()
  Future<List<Map<String, dynamic>>> getCaptures({int? limit}) async {
    final qs = limit != null ? '?limit=$limit' : '';
    final response = await _api.request<List<dynamic>>(
      '/engineer/captures$qs',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIER API — Mirrors api.ts supplier module
// ═══════════════════════════════════════════════════════════════════════════

class SupplierApi {
  final NammerhaApiClient _api;
  SupplierApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// GET /api/supplier/stats
  Future<Map<String, dynamic>> getStats() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/supplier/stats',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/supplier/catalog
  Future<List<Map<String, dynamic>>> getCatalog() async {
    final response = await _api.request<List<dynamic>>(
      '/supplier/catalog',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// POST /api/supplier/catalog
  Future<Map<String, dynamic>?> addCatalogItem({
    required String materialName,
    required String materialCategory,
    required String unit,
    required int unitPriceGuide,
    int? leadTimeDays,
    int? minimumOrder,
    String? description,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/supplier/catalog',
      method: 'POST',
      idempotent: true,
      body: {
        'material_name': materialName,
        'material_category': materialCategory,
        'unit': unit,
        'unit_price_guide': unitPriceGuide,
        if (leadTimeDays != null) 'lead_time_days': leadTimeDays,
        if (minimumOrder != null) 'min_order_qty': minimumOrder,
        if (description != null) 'description': description,
      },
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data;
  }

  /// GET /api/supplier/orders
  Future<List<Map<String, dynamic>>> getOrders({String? status}) async {
    final qs = status != null ? '?status=$status' : '';
    final response = await _api.request<List<dynamic>>(
      '/supplier/orders$qs',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  Future<Map<String, dynamic>?> updateCatalogItem(
    String itemId, {
    String? materialName,
    String? materialCategory,
    String? unit,
    int? unitPriceGuide,
    int? leadTimeDays,
    int? minimumOrder,
    String? description,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/supplier/catalog/$itemId',
      method: 'PATCH',
      body: {
        if (materialName != null) 'material_name': materialName,
        if (materialCategory != null) 'material_category': materialCategory,
        if (unit != null) 'unit': unit,
        if (unitPriceGuide != null) 'unit_price_guide': unitPriceGuide,
        if (leadTimeDays != null) 'lead_time_days': leadTimeDays,
        if (minimumOrder != null) 'min_order_qty': minimumOrder,
        if (description != null) 'description': description,
      },
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data;
  }

  /// DELETE /api/supplier/catalog/:id — Deactivate catalog item
  /// GAP-A02 REMEDIATION: Mobile parity with web supplier.deactivateItem()
  Future<void> deactivateItem(String itemId) async {
    await _api.request(
      '/supplier/catalog/$itemId',
      method: 'DELETE',
    );
  }

  /// PATCH /api/supplier/orders/:id/status
  Future<void> updateOrderStatus(String orderId, String status) async {
    await _api.request(
      '/supplier/orders/$orderId/status',
      method: 'PATCH',
      body: {'status': status},
    );
  }

  /// POST /api/supplier/catalog/:id/reactivate — Re-enable catalog item
  /// C3 REMEDIATION: Was completely missing — no way to reactivate deactivated items.
  Future<void> reactivateItem(String itemId) async {
    await _api.request(
      '/supplier/catalog/$itemId/reactivate',
      method: 'POST',
      idempotent: true,
    );
  }

  /// W4 FEATURE: GET /api/supplier/analytics — Monthly revenue chart data
  Future<List<Map<String, dynamic>>> getAnalytics() async {
    final response = await _api.request<List<dynamic>>(
      '/supplier/analytics',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HOMEOWNER API — Mirrors api.ts homeowner module
// ═══════════════════════════════════════════════════════════════════════════

class HomeownerApi {
  final NammerhaApiClient _api;
  HomeownerApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// GET /api/homeowner/stats
  Future<HomeownerStatsModel> getStats() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/homeowner/stats',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return HomeownerStatsModel.fromJson(response.data ?? {});
  }

  /// GET /api/homeowner/projects
  Future<List<HomeownerProjectModel>> getProjects() async {
    final response = await _api.request<List<dynamic>>(
      '/homeowner/projects',
      fromData: (d) => d as List<dynamic>,
    );
    return (response.data ?? [])
        .cast<Map<String, dynamic>>()
        .map(HomeownerProjectModel.fromJson)
        .toList();
  }

  /// POST /api/projects (Create project)
  Future<Map<String, dynamic>?> createProject({
    required String title,
    required String damageType,
    String? damageSeverity,
    String? description,
    required double gpsLat,
    required double gpsLng,
    String? addressText,
    String? coverImageUrl,
    List<String>? images,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/projects',
      method: 'POST',
      body: {
        'title': title,
        'damage_type': damageType,
        if (damageSeverity != null) 'damage_severity': damageSeverity,
        if (description != null) 'description': description,
        'gps_lat': gpsLat,
        'gps_lng': gpsLng,
        if (addressText != null) 'address_text': addressText,
        if (coverImageUrl != null) 'cover_image_url': coverImageUrl,
        if (images != null) 'images': images,
      },
      fromData: (d) => d as Map<String, dynamic>,
      idempotent: true,
    );
    return response.data;
  }

  /// GET /api/homeowner/projects/:id/bids
  Future<List<Map<String, dynamic>>> getProjectBids(String projectId) async {
    final response = await _api.request<List<dynamic>>(
      '/homeowner/projects/$projectId/bids',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// POST /api/homeowner/service-requests
  Future<Map<String, dynamic>?> createServiceRequest({
    required String tradeNeeded,
    required String title,
    String? description,
    String? addressText,
    String? urgency,
    int? budgetMin,
    int? budgetMax,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/homeowner/service-requests',
      method: 'POST',
      idempotent: true,
      body: {
        'trade_needed': tradeNeeded,
        'title': title,
        if (description != null) 'description': description,
        if (addressText != null) 'address_text': addressText,
        if (urgency != null) 'urgency': urgency,
        if (budgetMin != null) 'budget_min': budgetMin,
        if (budgetMax != null) 'budget_max': budgetMax,
      },
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data;
  }

  /// GET /api/homeowner/service-requests
  Future<List<HomeownerServiceRequestModel>> getServiceRequests() async {
    final response = await _api.request<List<dynamic>>(
      '/homeowner/service-requests',
      fromData: (d) => d as List<dynamic>,
    );
    return (response.data ?? [])
        .cast<Map<String, dynamic>>()
        .map(HomeownerServiceRequestModel.fromJson)
        .toList();
  }

  /// GET /api/homeowner/approvals
  Future<List<HomeownerApprovalModel>> getApprovals({String? status}) async {
    final qs = status != null ? '?status=$status' : '';
    final response = await _api.request<List<dynamic>>(
      '/homeowner/approvals$qs',
      fromData: (d) => d as List<dynamic>,
    );
    return (response.data ?? [])
        .cast<Map<String, dynamic>>()
        .map(HomeownerApprovalModel.fromJson)
        .toList();
  }

  /// POST /api/homeowner/service-requests/:id/cancel — Cancel a service request
  /// GAP-A03 REMEDIATION: Mobile parity with web homeowner.cancelServiceRequest()
  Future<void> cancelServiceRequest(String requestId) async {
    await _api.request(
      '/homeowner/service-requests/$requestId/cancel',
      method: 'POST',
      idempotent: true,
    );
  }

  /// PATCH /api/dashboard/approvals/:id — Approve or reject an approval
  /// GAP-A04 REMEDIATION: Mobile parity with web homeowner.respondToApproval()
  Future<void> respondToApproval(
    String approvalId, {
    required String decision,
    String? note,
  }) async {
    await _api.request(
      '/dashboard/approvals/$approvalId',
      method: 'PATCH',
      body: {
        'decision': decision,
        if (note != null) 'note': note,
      },
    );
  }

  /// GET /api/homeowner/escrow
  Future<HomeownerEscrowModel> getEscrow() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/homeowner/escrow',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return HomeownerEscrowModel.fromJson(response.data ?? {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS API — Mirrors api.ts notifications module
// ═══════════════════════════════════════════════════════════════════════════

class NotificationsApi {
  final NammerhaApiClient _api;
  NotificationsApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// GET /api/notifications
  Future<List<Map<String, dynamic>>> getAll() async {
    final response = await _api.request<List<dynamic>>(
      '/notifications',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/notifications/unread-count
  Future<int> getUnreadCount() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/notifications/unread-count',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return (response.data?['unread_count'] as int?) ?? 0;
  }

  /// PATCH /api/notifications/:id/read
  Future<void> markAsRead(String id) async {
    await _api.request('/notifications/$id/read', method: 'PATCH');
  }

  /// PATCH /api/notifications/read-all
  Future<void> markAllAsRead() async {
    await _api.request('/notifications/read-all', method: 'PATCH');
  }

  /// POST /api/notifications/push-token — Register FCM device token
  Future<void> registerPushToken({
    required String deviceToken,
    required String platform,
    String? deviceId,
  }) async {
    await _api.request(
      '/notifications/push-token',
      method: 'POST',
      body: {
        'device_token': deviceToken,
        'platform': platform,
        if (deviceId != null) 'device_id': deviceId,
      },
      idempotent: true,
    );
  }

  /// DELETE /api/notifications/push-token — Unregister FCM device token
  Future<void> unregisterPushToken(String deviceToken) async {
    await _api.request(
      '/notifications/push-token',
      method: 'DELETE',
      body: {'device_token': deviceToken},
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE API — Mirrors api.ts storage module (pre-signed URL upload)
// ═══════════════════════════════════════════════════════════════════════════

class StorageApi {
  final NammerhaApiClient _api;
  StorageApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// POST /api/storage/upload-url
  Future<Map<String, dynamic>> getUploadUrl({
    required String projectId,
    required String category,
    required String filename,
    required String contentType,
    required int fileSizeBytes,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/storage/upload-url',
      method: 'POST',
      body: {
        'project_id': projectId,
        'category': category,
        'filename': filename,
        'content_type': contentType,
        'file_size_bytes': fileSizeBytes,
      },
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENTS API — Mirrors api.ts payments module
// ═══════════════════════════════════════════════════════════════════════════

class PaymentsApi {
  final NammerhaApiClient _api;
  PaymentsApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// POST /api/payments/initiate
  Future<Map<String, dynamic>?> initiate({
    required String itemId,
    required String projectId,
    required int amount,
    String gateway = 'fatora',
    String? currency,
    String? returnUrl,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/payments/initiate',
      method: 'POST',
      idempotent: true,
      body: {
        'item_id': itemId,
        'project_id': projectId,
        'amount': amount,
        'gateway': gateway,
        if (currency != null) 'currency': currency,
        if (returnUrl != null) 'return_url': returnUrl,
      },
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data;
  }

  /// GET /api/payments/status/:reference
  Future<Map<String, dynamic>?> getStatus(String reference) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/payments/status/$reference',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data;
  }

  /// GET /api/payments/my
  Future<List<Map<String, dynamic>>> getMyPayments({int? limit, int? offset}) async {
    final params = <String, String>{};
    if (limit != null) params['limit'] = limit.toString();
    if (offset != null) params['offset'] = offset.toString();
    final qs = params.entries.map((e) => '${e.key}=${e.value}').join('&');
    final endpoint = '/payments/my${qs.isNotEmpty ? '?$qs' : ''}';
    final response = await _api.request<List<dynamic>>(endpoint, fromData: (d) => d as List<dynamic>);
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MATCHMAKING API — Mirrors api.ts matchmaking module
// ═══════════════════════════════════════════════════════════════════════════

class MatchmakingApi {
  final NammerhaApiClient _api;
  MatchmakingApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// POST /api/matchmaking/projects/:id/bid
  Future<void> submitBid({
    required String projectId,
    required int proposedCost,
    required int estimatedDays,
    String? coverLetter,
    String? methodology,
  }) async {
    await _api.request(
      '/matchmaking/projects/$projectId/bid',
      method: 'POST',
      idempotent: true,
      body: {
        'proposed_cost': proposedCost,
        'estimated_days': estimatedDays,
        if (coverLetter != null) 'cover_letter': coverLetter,
        if (methodology != null) 'methodology': methodology,
      },
    );
  }

  /// GET /api/matchmaking/projects/:id/bids
  Future<List<Map<String, dynamic>>> getProjectBids(String projectId) async {
    final response = await _api.request<List<dynamic>>(
      '/matchmaking/projects/$projectId/bids',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// POST /api/matchmaking/bids/:id/accept
  Future<void> acceptBid(String bidId) async {
    await _api.request(
      '/matchmaking/bids/$bidId/accept',
      method: 'POST',
      idempotent: true,
    );
  }

  /// GET /api/matchmaking/search-engineers — search with geo/specialty/score filters
  Future<List<Map<String, dynamic>>> searchEngineers({
    double? latitude,
    double? longitude,
    double? radiusKm,
    String? specialty,
    int? minScore,
  }) async {
    final params = <String, String>{};
    if (latitude != null) params['lat'] = latitude.toString();
    if (longitude != null) params['lng'] = longitude.toString();
    if (radiusKm != null) params['radius'] = radiusKm.toString();
    if (specialty != null) params['specialty'] = specialty;
    if (minScore != null) params['min_score'] = minScore.toString();
    final qs = params.isNotEmpty
        ? '?${params.entries.map((e) => '${e.key}=${e.value}').join('&')}'
        : '';
    final response = await _api.request<List<dynamic>>(
      '/matchmaking/search-engineers$qs',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/matchmaking/match/:id — Auto-match engine
  /// GAP-A07 REMEDIATION: Mobile parity with web matchmaking.matchProject()
  Future<Map<String, dynamic>> matchProject(String projectId) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/matchmaking/match/$projectId',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/matchmaking/engineers/:id/score-breakdown
  Future<Map<String, dynamic>> getScoreBreakdown(String engineerId) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/matchmaking/engineers/$engineerId/score-breakdown',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACTOR API — Mirrors api.ts contractor module
// Wave 2: Dashboard, Marketplace, Bids, Payments
// ═══════════════════════════════════════════════════════════════════════════

class ContractorApi {
  final NammerhaApiClient _api;
  ContractorApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// GET /api/contractor/stats
  Future<Map<String, dynamic>> getStats() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/contractor/stats',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/contractor/projects
  Future<List<Map<String, dynamic>>> getProjects({String? status}) async {
    final qs = status != null ? '?status=$status' : '';
    final response = await _api.request<List<dynamic>>(
      '/contractor/projects$qs',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/contractor/bids
  Future<List<Map<String, dynamic>>> getBids({String? status}) async {
    final qs = status != null ? '?status=$status' : '';
    final response = await _api.request<List<dynamic>>(
      '/contractor/bids$qs',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/contractor/marketplace
  Future<List<Map<String, dynamic>>> getMarketplace() async {
    final response = await _api.request<List<dynamic>>(
      '/contractor/marketplace',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/contractor/profile
  Future<Map<String, dynamic>> getProfile() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/contractor/profile',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/contractor/payments
  Future<List<Map<String, dynamic>>> getPayments({int? limit}) async {
    final qs = limit != null ? '?limit=$limit' : '';
    final response = await _api.request<List<dynamic>>(
      '/contractor/payments$qs',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// POST /api/contractor/bids — Submit a competitive bid (idempotent)
  Future<void> submitBid({
    required String projectId,
    required int proposedCost,
    required int estimatedDays,
    String? coverLetter,
    String? methodology,
  }) async {
    await _api.request(
      '/contractor/bids',
      method: 'POST',
      idempotent: true,
      body: {
        'project_id': projectId,
        'proposed_cost': proposedCost,
        'estimated_days': estimatedDays,
        if (coverLetter != null) 'cover_letter': coverLetter,
        if (methodology != null) 'methodology': methodology,
      },
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TRADESPERSON API — Mirrors api.ts tradesperson module
// Wave 2: Dashboard, Requests, Assignments, Earnings, Profile
// ═══════════════════════════════════════════════════════════════════════════

class TradespersonApi {
  final NammerhaApiClient _api;
  TradespersonApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// GET /api/tradesperson/stats
  Future<Map<String, dynamic>> getStats() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/tradesperson/stats',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/tradesperson/profile
  Future<Map<String, dynamic>> getProfile() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/tradesperson/profile',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/tradesperson/requests — Available service requests (Thumbtack mode)
  Future<List<Map<String, dynamic>>> getRequests() async {
    final response = await _api.request<List<dynamic>>(
      '/tradesperson/requests',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// POST /api/tradesperson/requests/:id/accept (idempotent)
  Future<void> acceptRequest(String requestId) async {
    await _api.request(
      '/tradesperson/requests/$requestId/accept',
      method: 'POST',
      idempotent: true,
    );
  }

  /// GET /api/tradesperson/assignments
  Future<List<Map<String, dynamic>>> getAssignments({String? status}) async {
    final qs = status != null ? '?status=$status' : '';
    final response = await _api.request<List<dynamic>>(
      '/tradesperson/assignments$qs',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// POST /api/tradesperson/assignments/:id/respond (idempotent)
  Future<void> respondToAssignment(String assignmentId, {required bool accept}) async {
    await _api.request(
      '/tradesperson/assignments/$assignmentId/respond',
      method: 'POST',
      idempotent: true,
      body: {'accept': accept},
    );
  }

  /// GET /api/tradesperson/earnings
  Future<List<Map<String, dynamic>>> getEarnings() async {
    final response = await _api.request<List<dynamic>>(
      '/tradesperson/earnings',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// PATCH /api/tradesperson/availability
  Future<void> updateAvailability(String status) async {
    await _api.request(
      '/tradesperson/availability',
      method: 'PATCH',
      body: {'status': status},
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// OPEN DATA API — Mirrors api.ts openData module (100% parity)
// REM-005: Complete OCDS transparency endpoints
// ═══════════════════════════════════════════════════════════════════════════

class OpenDataApi {
  final NammerhaApiClient _api;
  OpenDataApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// GET /api/open-data/projects — Public project listings (paginated)
  Future<List<Map<String, dynamic>>> getProjectListings({
    int? limit,
    int? offset,
  }) async {
    final params = <String>[];
    if (limit != null) params.add('limit=$limit');
    if (offset != null) params.add('offset=$offset');
    final qs = params.isNotEmpty ? '?${params.join('&')}' : '';
    final response = await _api.request<List<dynamic>>(
      '/open-data/projects$qs',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/open-data/projects/:id — Single project card (OCDS-compliant)
  Future<Map<String, dynamic>> getProjectCard(String projectId) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/open-data/projects/$projectId',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/open-data/ocds/:id — Full OCDS release package
  Future<Map<String, dynamic>> getOCDSRelease(String projectId) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/open-data/ocds/$projectId',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/open-data/stats — Platform-wide transparency statistics
  Future<Map<String, dynamic>> getStats() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/open-data/stats',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/open-data/projects/:id/export?format=pdf|xlsx
  /// Returns the download URL for the exported report
  Future<String?> exportReport(String projectId, {String format = 'pdf'}) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/open-data/projects/$projectId/export?format=$format',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data?['url'] as String?;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSLATION API — Mirrors api.ts translation module
// REM-006: Runtime translation capability (NMT + LLM hybrid)
// ═══════════════════════════════════════════════════════════════════════════

class TranslationApi {
  final NammerhaApiClient _api;
  TranslationApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// POST /api/translation/translate — Single text translation
  Future<Map<String, dynamic>> translate({
    required String text,
    required String sourceLang,
    required String targetLang,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/translation/translate',
      method: 'POST',
      body: {
        'text': text,
        'source_lang': sourceLang,
        'target_lang': targetLang,
      },
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// POST /api/translation/batch — Batch translation
  Future<List<Map<String, dynamic>>> batchTranslate({
    required List<String> items,
    required String sourceLang,
    required String targetLang,
  }) async {
    final response = await _api.request<List<dynamic>>(
      '/translation/batch',
      method: 'POST',
      body: {
        'items': items,
        'source_lang': sourceLang,
        'target_lang': targetLang,
      },
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/translation/glossary — RAG-based glossary
  Future<List<Map<String, dynamic>>> getGlossary() async {
    final response = await _api.request<List<dynamic>>(
      '/translation/glossary',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/translation/languages — Supported language pairs
  Future<List<Map<String, dynamic>>> getSupportedLanguages() async {
    final response = await _api.request<List<dynamic>>(
      '/translation/languages',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EPA ORACLE API — Mirrors api.ts epaOracle module
// GAP-S02 REMEDIATION: FIDIC 13.8 Economic Price Adjustment endpoints
// ═══════════════════════════════════════════════════════════════════════════

class EpaOracleApi {
  final NammerhaApiClient _api;
  EpaOracleApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// GET /api/oracle/prices — Get material prices (optionally by code)
  Future<List<Map<String, dynamic>>> getPrices({String? materialCode}) async {
    final qs = materialCode != null
        ? '?material_code=${Uri.encodeComponent(materialCode)}'
        : '';
    final response = await _api.request<List<dynamic>>(
      '/oracle/prices$qs',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// POST /api/oracle/prices — Upsert material price
  Future<void> upsertPrice({
    required String materialCode,
    required String materialName,
    required String unit,
    required int basePrice,
    required int currentPrice,
  }) async {
    await _api.request(
      '/oracle/prices',
      method: 'POST',
      body: {
        'material_code': materialCode,
        'material_name': materialName,
        'unit': unit,
        'base_price': basePrice,
        'current_price': currentPrice,
      },
      idempotent: true,
    );
  }

  /// POST /api/oracle/calculate — Calculate FIDIC 13.8 EPA adjustment
  Future<Map<String, dynamic>> calculateAdjustment({
    required String projectId,
    String? milestoneId,
    required Map<String, double> fidicParams,
    required int originalAmount,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/oracle/calculate',
      method: 'POST',
      body: {
        'project_id': projectId,
        if (milestoneId != null) 'milestone_id': milestoneId,
        'fidic_params': fidicParams,
        'original_amount': originalAmount,
      },
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/oracle/history/:projectId — Adjustment history
  Future<List<Map<String, dynamic>>> getHistory(String projectId) async {
    final response = await _api.request<List<dynamic>>(
      '/oracle/history/$projectId',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTACT API — Mirrors web contact form submission
// REM-009: Centralized typed API pattern
// ═══════════════════════════════════════════════════════════════════════════

class ContactApi {
  final NammerhaApiClient _api;
  ContactApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// POST /api/contact — Submit contact form
  Future<void> submitContactForm({
    required String name,
    required String email,
    required String subject,
    required String message,
  }) async {
    await _api.request(
      '/contact',
      method: 'POST',
      idempotent: true,
      body: {
        'name': name,
        'email': email,
        'subject': subject,
        'message': message,
      },
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ROLES API — Mirrors api.ts roles module
// GAP-C03: Users can now discover and activate new roles from mobile
// ═══════════════════════════════════════════════════════════════════════════

class RolesApi {
  final NammerhaApiClient _api;
  RolesApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// GET /api/roles/available — List all roles the user can activate
  Future<List<Map<String, dynamic>>> getAvailable() async {
    final response = await _api.request<List<dynamic>>(
      '/roles/available',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// POST /api/roles/activate — Activate a new role for the current user
  Future<Map<String, dynamic>> activate(String roleName) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/roles/activate',
      method: 'POST',
      idempotent: true,
      body: {'role': roleName},
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/roles/my-roles — Get the current user's active roles
  Future<List<Map<String, dynamic>>> getMyRoles() async {
    final response = await _api.request<List<dynamic>>(
      '/roles/my-roles',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REVENUE ADMIN API — Mirrors api.ts revenueAdmin module
// GAP-A08 REMEDIATION: Admin revenue dashboard endpoints
// ═══════════════════════════════════════════════════════════════════════════

class RevenueAdminApi {
  final NammerhaApiClient _api;
  RevenueAdminApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// GET /api/revenue/admin/summary — KPI summary
  Future<Map<String, dynamic>> getSummary() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/revenue/admin/summary',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/revenue/admin/config — Commission tiers
  Future<List<Map<String, dynamic>>> getTiers() async {
    final response = await _api.request<List<dynamic>>(
      '/revenue/admin/config',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/revenue/admin/commissions — Recent commissions
  Future<Map<String, dynamic>> getCommissions({int limit = 8}) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/revenue/admin/commissions?limit=$limit',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/revenue/admin/tips — Recent tips
  Future<List<Map<String, dynamic>>> getTips({int limit = 8}) async {
    final response = await _api.request<List<dynamic>>(
      '/revenue/admin/tips?limit=$limit',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTERPRISE ADMIN API — Mirrors api.ts enterpriseAdmin module
// GAP-A09 REMEDIATION: Admin FinTech dashboard endpoints
// ═══════════════════════════════════════════════════════════════════════════

class EnterpriseAdminApi {
  final NammerhaApiClient _api;
  EnterpriseAdminApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// GET /api/enterprise/admin/fees/summary — Escrow fee KPIs
  Future<Map<String, dynamic>> getFeeSummary() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/enterprise/admin/fees/summary',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/enterprise/admin/fees/config — Fee configuration tiers
  Future<List<Map<String, dynamic>>> getFeeConfigs() async {
    final response = await _api.request<List<dynamic>>(
      '/enterprise/admin/fees/config',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/enterprise/admin/organizations — Enterprise organizations
  Future<List<Map<String, dynamic>>> getOrganizations() async {
    final response = await _api.request<List<dynamic>>(
      '/enterprise/admin/organizations',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTIONS API — Mirrors api.ts subscriptions module
// GAP-A10 REMEDIATION: SaaS subscription flow
// ═══════════════════════════════════════════════════════════════════════════

class SubscriptionsApi {
  final NammerhaApiClient _api;
  SubscriptionsApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// POST /api/subscriptions/subscribe — Subscribe to a plan
  Future<Map<String, dynamic>?> subscribe(String planSlug) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/subscriptions/subscribe',
      method: 'POST',
      idempotent: true,
      body: {'plan_slug': planSlug},
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPLIANCE API — Mirrors api.ts compliance module
// GAP-A11-A15 REMEDIATION: SDN screening, export controls, security events,
// escrow review approval/flagging
// ═══════════════════════════════════════════════════════════════════════════

class ComplianceApi {
  final NammerhaApiClient _api;
  ComplianceApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// POST /api/compliance/sdn/screen — Screen name against SDN list
  Future<Map<String, dynamic>> screenSDN({
    required String fullName,
    String? country,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/compliance/sdn/screen',
      method: 'POST',
      body: {
        'full_name': fullName,
        if (country != null) 'country': country,
      },
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/compliance/export-controls — Export control checks
  Future<Map<String, dynamic>> getExportControls() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/compliance/export-controls',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/compliance/security-events — Security event log
  Future<List<Map<String, dynamic>>> getSecurityEvents({
    String? severity,
    int? limit,
  }) async {
    final params = <String>[];
    if (severity != null) params.add('severity=$severity');
    if (limit != null) params.add('limit=$limit');
    final qs = params.isNotEmpty ? '?${params.join('&')}' : '';
    final response = await _api.request<List<dynamic>>(
      '/compliance/security-events$qs',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/dashboard/compliance/stats — Dashboard compliance KPIs
  Future<Map<String, dynamic>> getDashboardStats() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/dashboard/compliance/stats',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/compliance/metrics — Compliance metrics
  Future<Map<String, dynamic>> getMetrics() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/compliance/metrics',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/compliance/escrow-reviews — Escrow review queue
  Future<List<Map<String, dynamic>>> getEscrowReviews() async {
    final response = await _api.request<List<dynamic>>(
      '/compliance/escrow-reviews',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// POST /api/compliance/escrow-reviews/:ref/approve — Approve review (idempotent)
  Future<void> approveReview(String reference) async {
    await _api.request(
      '/compliance/escrow-reviews/$reference/approve',
      method: 'POST',
      idempotent: true,
    );
  }

  /// POST /api/compliance/escrow-reviews/:ref/flag — Flag review (idempotent)
  Future<void> flagReview(String reference) async {
    await _api.request(
      '/compliance/escrow-reviews/$reference/flag',
      method: 'POST',
      idempotent: true,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH API — Mirrors api.ts health module
// GAP-X03 REMEDIATION: Backend health check endpoint
// ═══════════════════════════════════════════════════════════════════════════

class HealthApi {
  final NammerhaApiClient _api;
  HealthApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// GET /health — Backend health check (note: not behind /api prefix)
  Future<Map<String, dynamic>> check() async {
    try {
      final response = await _api.request<Map<String, dynamic>>(
        '/health',
        fromData: (d) => d as Map<String, dynamic>,
      );
      return response.data ?? {'status': 'unknown'};
    } catch (_) {
      return {'status': 'unreachable'};
    }
  }
}
