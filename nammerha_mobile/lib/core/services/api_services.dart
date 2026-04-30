import '../network/api_client.dart';

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
  Future<Map<String, dynamic>> getStats() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/donor/stats',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/donor/donations
  Future<List<Map<String, dynamic>>> getDonations({int? limit}) async {
    final qs = limit != null ? '?limit=$limit' : '';
    final response = await _api.request<List<dynamic>>(
      '/donor/donations$qs',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/donor/impact
  Future<List<Map<String, dynamic>>> getImpact() async {
    final response = await _api.request<List<dynamic>>(
      '/donor/impact',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/donor/marketplace
  Future<List<Map<String, dynamic>>> getMarketplace() async {
    final response = await _api.request<List<dynamic>>(
      '/donor/marketplace',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/donor/proofs
  Future<List<Map<String, dynamic>>> getProofs() async {
    final response = await _api.request<List<dynamic>>(
      '/donor/proofs',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
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
        if (minimumOrder != null) 'minimum_order': minimumOrder,
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

  /// PATCH /api/supplier/orders/:id/status
  Future<void> updateOrderStatus(String orderId, String status) async {
    await _api.request(
      '/supplier/orders/$orderId/status',
      method: 'PATCH',
      body: {'status': status},
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HOMEOWNER API — Mirrors api.ts homeowner module
// ═══════════════════════════════════════════════════════════════════════════

class HomeownerApi {
  final NammerhaApiClient _api;
  HomeownerApi({NammerhaApiClient? api}) : _api = api ?? NammerhaApiClient.instance;

  /// GET /api/homeowner/stats
  Future<Map<String, dynamic>> getStats() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/homeowner/stats',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/homeowner/projects
  Future<List<Map<String, dynamic>>> getProjects() async {
    final response = await _api.request<List<dynamic>>(
      '/homeowner/projects',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
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
  Future<List<Map<String, dynamic>>> getServiceRequests() async {
    final response = await _api.request<List<dynamic>>(
      '/homeowner/service-requests',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/homeowner/approvals
  Future<List<Map<String, dynamic>>> getApprovals({String? status}) async {
    final qs = status != null ? '?status=$status' : '';
    final response = await _api.request<List<dynamic>>(
      '/homeowner/approvals$qs',
      fromData: (d) => d as List<dynamic>,
    );
    return response.data?.cast<Map<String, dynamic>>() ?? [];
  }

  /// GET /api/homeowner/escrow
  Future<Map<String, dynamic>> getEscrow() async {
    final response = await _api.request<Map<String, dynamic>>(
      '/homeowner/escrow',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
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
