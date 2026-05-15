import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/network/api_client.dart';
import '../../../core/services/review_api.dart';
import '../../../core/i18n/error_keys.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

abstract class ReviewEvent extends Equatable {
  const ReviewEvent();
  @override
  List<Object?> get props => [];
}

/// Load reviews + aggregates for an entity.
class LoadReviews extends ReviewEvent {
  final ReviewableType type;
  final String entityId;
  final String sort;
  final int page;

  const LoadReviews({
    required this.type,
    required this.entityId,
    this.sort = 'recent',
    this.page = 1,
  });

  @override
  List<Object?> get props => [type, entityId, sort, page];
}

/// Submit a new review.
class SubmitReview extends ReviewEvent {
  final ReviewableType reviewableType;
  final String reviewableId;
  final int overallRating;
  final String body;
  final String? title;
  final String? projectId;
  final List<DimensionRating>? ratings;

  const SubmitReview({
    required this.reviewableType,
    required this.reviewableId,
    required this.overallRating,
    required this.body,
    this.title,
    this.projectId,
    this.ratings,
  });

  @override
  List<Object?> get props => [reviewableType, reviewableId, overallRating];
}

/// Vote a review as helpful or not helpful.
class VoteHelpful extends ReviewEvent {
  final String reviewId;
  final bool isHelpful;

  const VoteHelpful({required this.reviewId, required this.isHelpful});

  @override
  List<Object?> get props => [reviewId, isHelpful];
}

/// Flag a review for moderation.
class FlagReview extends ReviewEvent {
  final String reviewId;
  final String reason;
  final String? description;

  const FlagReview({required this.reviewId, required this.reason, this.description});

  @override
  List<Object?> get props => [reviewId, reason];
}

/// Delete own review.
class DeleteReview extends ReviewEvent {
  final String reviewId;
  const DeleteReview(this.reviewId);

  @override
  List<Object?> get props => [reviewId];
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATES
// ═══════════════════════════════════════════════════════════════════════════════

abstract class ReviewState extends Equatable {
  const ReviewState();
  @override
  List<Object?> get props => [];
}

class ReviewInitial extends ReviewState {}

class ReviewLoading extends ReviewState {}

class ReviewLoaded extends ReviewState {
  final List<Map<String, dynamic>> reviews;
  final Map<String, dynamic> aggregates;
  final int totalPages;
  final int currentPage;

  const ReviewLoaded({
    required this.reviews,
    required this.aggregates,
    required this.totalPages,
    required this.currentPage,
  });

  @override
  List<Object?> get props => [reviews, aggregates, totalPages, currentPage];
}

class ReviewSubmitting extends ReviewState {}

class ReviewSubmitted extends ReviewState {
  final String message;
  const ReviewSubmitted(this.message);

  @override
  List<Object?> get props => [message];
}

class ReviewActionSuccess extends ReviewState {
  final String message;
  const ReviewActionSuccess(this.message);

  @override
  List<Object?> get props => [message];
}

class ReviewError extends ReviewState {
  final String message;
  const ReviewError(this.message);

  @override
  List<Object?> get props => [message];
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC
// ═══════════════════════════════════════════════════════════════════════════════

class ReviewBloc extends Bloc<ReviewEvent, ReviewState> {
  final ReviewApi _api;

  // Cache last loaded context for reload after actions
  ReviewableType? _lastType;
  String? _lastEntityId;

  ReviewBloc({ReviewApi? api})
      : _api = api ?? ReviewApi(),
        super(ReviewInitial()) {
    on<LoadReviews>(_onLoad);
    on<SubmitReview>(_onSubmit);
    on<VoteHelpful>(_onVoteHelpful);
    on<FlagReview>(_onFlag);
    on<DeleteReview>(_onDelete);
  }

  Future<void> _onLoad(LoadReviews event, Emitter<ReviewState> emit) async {
    emit(ReviewLoading());
    _lastType = event.type;
    _lastEntityId = event.entityId;

    try {
      final results = await Future.wait([
        _api.getReviews(
          type: event.type,
          entityId: event.entityId,
          sort: event.sort,
          page: event.page,
        ),
        _api.getAggregates(type: event.type, entityId: event.entityId),
      ]);

      final reviewsData = results[0];
      final aggregates = results[1];

      final reviews =
          (reviewsData['reviews'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ?? [];
      final pagination = reviewsData['pagination'] as Map<String, dynamic>? ?? {};

      emit(ReviewLoaded(
        reviews: reviews,
        aggregates: aggregates,
        totalPages: (pagination['totalPages'] as int?) ?? 1,
        currentPage: (pagination['page'] as int?) ?? 1,
      ));
    } on ApiException catch (e) {
      emit(ReviewError(e.message));
    } catch (e) {
      emit(ReviewError(ErrorKeys.reviewLoadFailed));
    }
  }

  Future<void> _onSubmit(SubmitReview event, Emitter<ReviewState> emit) async {
    emit(ReviewSubmitting());
    try {
      await _api.submitReview(
        reviewableType: event.reviewableType,
        reviewableId: event.reviewableId,
        overallRating: event.overallRating,
        body: event.body,
        title: event.title,
        projectId: event.projectId,
        ratings: event.ratings,
      );
      emit(const ReviewSubmitted('msg_review_submitted'));
      _reload();
    } on ApiException catch (e) {
      emit(ReviewError(e.message));
    } catch (e) {
      emit(ReviewError(ErrorKeys.reviewSubmitFailed));
    }
  }

  Future<void> _onVoteHelpful(VoteHelpful event, Emitter<ReviewState> emit) async {
    try {
      await _api.voteHelpful(event.reviewId, isHelpful: event.isHelpful);
      emit(const ReviewActionSuccess('msg_vote_recorded'));
      _reload();
    } on ApiException catch (e) {
      emit(ReviewError(e.message));
    } catch (e) {
      emit(ReviewError(ErrorKeys.reviewVoteFailed));
    }
  }

  Future<void> _onFlag(FlagReview event, Emitter<ReviewState> emit) async {
    try {
      await _api.flagReview(event.reviewId, reason: event.reason, description: event.description);
      emit(const ReviewActionSuccess('msg_review_reported'));
      _reload();
    } on ApiException catch (e) {
      emit(ReviewError(e.message));
    } catch (e) {
      emit(ReviewError(ErrorKeys.reviewReportFailed));
    }
  }

  Future<void> _onDelete(DeleteReview event, Emitter<ReviewState> emit) async {
    try {
      await _api.deleteReview(event.reviewId);
      emit(const ReviewActionSuccess('msg_review_deleted'));
      _reload();
    } on ApiException catch (e) {
      emit(ReviewError(e.message));
    } catch (e) {
      emit(ReviewError(ErrorKeys.reviewDeleteFailed));
    }
  }

  void _reload() {
    if (_lastType != null && _lastEntityId != null) {
      add(LoadReviews(type: _lastType!, entityId: _lastEntityId!));
    }
  }
}
