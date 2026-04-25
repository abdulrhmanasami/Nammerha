import '../network/api_client.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// REVIEW API — Mirrors backend/src/routes/review.routes.ts
// ═══════════════════════════════════════════════════════════════════════════════
// GAP-H1 FIX: Full polymorphic review system for the mobile app.
//
// Backend supports:
//   - Paginated reviews with sorting (recent/helpful/highest/lowest)
//   - Trust score aggregates with dimension breakdowns
//   - Submit review with multi-dimension ratings
//   - Edit review (48h window, max 2 edits)
//   - Delete (soft-delete)
//   - Respond to review (reviewed party only)
//   - Flag review (spam/inappropriate/fake)
//   - Vote helpful/not-helpful
//   - My submitted reviews
// ═══════════════════════════════════════════════════════════════════════════════

/// Reviewable entity types (must match backend VALID_REVIEWABLE_TYPES).
enum ReviewableType {
  contractorProfiles('contractor_profiles'),
  supplierProfiles('supplier_profiles'),
  engineerProfiles('engineer_profiles'),
  tradespersonProfiles('tradesperson_profiles'),
  homeownerProfiles('homeowner_profiles'),
  project('project');

  final String value;
  const ReviewableType(this.value);
}

/// A single dimension rating score.
class DimensionRating {
  final String dimensionKey;
  final int score;

  const DimensionRating({required this.dimensionKey, required this.score});

  Map<String, dynamic> toJson() => {
        'dimension_key': dimensionKey,
        'score': score,
      };
}

class ReviewApi {
  final NammerhaApiClient _api;
  ReviewApi({NammerhaApiClient? api})
      : _api = api ?? NammerhaApiClient.instance;

  // ─── Public Endpoints ──────────────────────────────────────────────────

  /// GET /api/reviews/:type/:id — Paginated reviews for an entity.
  Future<Map<String, dynamic>> getReviews({
    required ReviewableType type,
    required String entityId,
    String sort = 'recent',
    int page = 1,
    int limit = 10,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/reviews/${type.value}/$entityId?sort=$sort&page=$page&limit=$limit',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  /// GET /api/reviews/aggregates/:type/:id — Trust score + dimension breakdown.
  Future<Map<String, dynamic>> getAggregates({
    required ReviewableType type,
    required String entityId,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/reviews/aggregates/${type.value}/$entityId',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }

  // ─── Authenticated Endpoints ───────────────────────────────────────────

  /// POST /api/reviews — Submit a new review.
  Future<Map<String, dynamic>?> submitReview({
    required ReviewableType reviewableType,
    required String reviewableId,
    required int overallRating,
    required String body,
    String? title,
    String? projectId,
    List<DimensionRating>? ratings,
  }) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/reviews',
      method: 'POST',
      idempotent: true,
      body: {
        'reviewable_type': reviewableType.value,
        'reviewable_id': reviewableId,
        'overall_rating': overallRating,
        'body': body,
        if (title != null) 'title': title,
        if (projectId != null) 'project_id': projectId,
        if (ratings != null && ratings.isNotEmpty)
          'ratings': ratings.map((r) => r.toJson()).toList(),
      },
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data;
  }

  /// PUT /api/reviews/:reviewId — Edit review (48h window, max 2 edits).
  Future<void> editReview(
    String reviewId, {
    int? overallRating,
    String? title,
    String? body,
    List<DimensionRating>? ratings,
  }) async {
    await _api.request(
      '/reviews/$reviewId',
      method: 'PUT',
      body: {
        if (overallRating != null) 'overall_rating': overallRating,
        if (title != null) 'title': title,
        if (body != null) 'body': body,
        if (ratings != null && ratings.isNotEmpty)
          'ratings': ratings.map((r) => r.toJson()).toList(),
      },
    );
  }

  /// DELETE /api/reviews/:reviewId — Soft-delete own review.
  Future<void> deleteReview(String reviewId) async {
    await _api.request('/reviews/$reviewId', method: 'DELETE');
  }

  /// POST /api/reviews/:reviewId/response — Professional response from reviewed party.
  Future<void> respondToReview(String reviewId, String responseBody) async {
    await _api.request(
      '/reviews/$reviewId/response',
      method: 'POST',
      body: {'body': responseBody},
    );
  }

  /// POST /api/reviews/:reviewId/flag — Report a review.
  Future<void> flagReview(
    String reviewId, {
    required String reason,
    String? description,
  }) async {
    await _api.request(
      '/reviews/$reviewId/flag',
      method: 'POST',
      body: {
        'reason': reason,
        if (description != null) 'description': description,
      },
    );
  }

  /// POST /api/reviews/:reviewId/helpful — Vote helpful/not-helpful.
  Future<void> voteHelpful(String reviewId, {required bool isHelpful}) async {
    await _api.request(
      '/reviews/$reviewId/helpful',
      method: 'POST',
      body: {'is_helpful': isHelpful},
    );
  }

  /// GET /api/reviews/my-reviews — User's submitted reviews.
  Future<Map<String, dynamic>> getMyReviews({int page = 1, int limit = 10}) async {
    final response = await _api.request<Map<String, dynamic>>(
      '/reviews/my-reviews?page=$page&limit=$limit',
      fromData: (d) => d as Map<String, dynamic>,
    );
    return response.data ?? {};
  }
}
