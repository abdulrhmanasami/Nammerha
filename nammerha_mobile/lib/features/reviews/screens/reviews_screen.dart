import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/services/review_api.dart';
import '../../../core/theme/semantic_colors.dart';
import '../bloc/review_bloc.dart';
import '../../../core/i18n/t.dart';

/// Reviews Screen — displays reviews + aggregates for any entity.
/// GAP-H1 FIX: Previously web-only.
class ReviewsScreen extends StatelessWidget {
  final ReviewableType type;
  final String entityId;
  final String entityName;

  const ReviewsScreen({
    super.key,
    required this.type,
    required this.entityId,
    required this.entityName,
  });

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => ReviewBloc()..add(LoadReviews(type: type, entityId: entityId)),
      child: _ReviewsView(type: type, entityId: entityId, entityName: entityName),
    );
  }
}

class _ReviewsView extends StatelessWidget {
  final ReviewableType type;
  final String entityId;
  final String entityName;

  const _ReviewsView({required this.type, required this.entityId, required this.entityName});

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text('تقييمات $entityName', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.textPrimary)),
        backgroundColor: colors.backgroundPrimary,
        elevation: 0,
        iconTheme: IconThemeData(color: colors.textPrimary),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showSubmitSheet(context),
        backgroundColor: colors.primaryBrand,
        icon: const Icon(Icons.rate_review_rounded, color: Colors.white),
        label: const Text('أضف تقييم', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
      ),
      body: BlocConsumer<ReviewBloc, ReviewState>(
        listener: (ctx, state) {
          if (state is ReviewSubmitted || state is ReviewActionSuccess) {
            final msg = state is ReviewSubmitted ? state.message : (state as ReviewActionSuccess).message;
            ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text(msg), backgroundColor: colors.success));
          } else if (state is ReviewError) {
            ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text(state.message), backgroundColor: colors.error));
          }
        },
        builder: (ctx, state) {
          if (state is ReviewLoading || state is ReviewSubmitting) {
            return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
          }
          if (state is ReviewLoaded) return _buildLoaded(ctx, state);
          return const SizedBox.shrink();
        },
      ),
    );
  }

  Widget _buildLoaded(BuildContext context, ReviewLoaded state) {
    final colors = context.colors;
    final agg = state.aggregates;
    final avgRating = (agg['average_rating'] as num?)?.toDouble() ?? 0;
    final totalReviews = (agg['total_reviews'] as num?)?.toInt() ?? 0;
    final trustScore = (agg['trust_score'] as num?)?.toDouble() ?? 0;

    return RefreshIndicator(
      onRefresh: () async {
        context.read<ReviewBloc>().add(LoadReviews(type: type, entityId: entityId));
      },
      color: colors.primaryBrand,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // Aggregate header
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [colors.primaryBrand, colors.secondaryAccent]),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                Column(
                  children: [
                    Text(avgRating.toStringAsFixed(1), style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w900, color: Colors.white)),
                    Row(children: List.generate(5, (i) => Icon(
                      i < avgRating.round() ? Icons.star_rounded : Icons.star_outline_rounded,
                      color: Colors.white, size: 18,
                    ))),
                    const SizedBox(height: 4),
                    Text('$totalReviews تقييم', style: TextStyle(color: Colors.white.withAlpha(200), fontSize: 12)),
                  ],
                ),
                const Spacer(),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('نقاط الثقة', style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 11)),
                    Text('${(trustScore * 100).toStringAsFixed(0)}%', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white)),
                  ],
                ),
              ],
            ),
          ).animate().fadeIn(duration: 400.ms),
          const SizedBox(height: 20),

          // Reviews list
          if (state.reviews.isEmpty)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 40),
              child: Column(
                children: [
                  Icon(Icons.reviews_rounded, size: 48, color: colors.textSubtle),
                  const SizedBox(height: 12),
                  Text('لا توجد تقييمات بعد', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: colors.textSecondary)),
                ],
              ),
            )
          else
            ...state.reviews.asMap().entries.map((e) => _reviewCard(context, e.value, e.key)),
        ],
      ),
    );
  }

  Widget _reviewCard(BuildContext context, Map<String, dynamic> r, int index) {
    final colors = context.colors;
    final rating = (r['overall_rating'] as num?)?.toInt() ?? 0;
    final title = r['title'] as String? ?? '';
    final body = r['body'] as String? ?? '';
    final name = r['reviewer_name'] as String? ?? '';
    final isVerified = r['is_verified_interaction'] as bool? ?? false;
    final helpfulCount = (r['helpful_count'] as num?)?.toInt() ?? 0;
    final reviewId = r['review_id'] as String? ?? '';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(radius: 18, backgroundColor: colors.primaryBrand.withAlpha(20),
                child: Text(name.isNotEmpty ? name[0] : '?', style: TextStyle(color: colors.primaryBrand, fontWeight: FontWeight.w700))),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Text(name, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: colors.textPrimary)),
                  if (isVerified) ...[const SizedBox(width: 6), Icon(Icons.verified_rounded, size: 14, color: colors.success)],
                ]),
                Row(children: List.generate(5, (i) => Icon(
                  i < rating ? Icons.star_rounded : Icons.star_outline_rounded,
                  color: colors.goldFunding, size: 14,
                ))),
              ])),
            ],
          ),
          if (title.isNotEmpty) ...[const SizedBox(height: 10), Text(title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary))],
          const SizedBox(height: 6),
          Text(body, style: TextStyle(fontSize: 13, color: colors.textPrimary, height: 1.5)),
          const SizedBox(height: 10),
          Row(
            children: [
              InkWell(
                onTap: () => context.read<ReviewBloc>().add(VoteHelpful(reviewId: reviewId, isHelpful: true)),
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  child: Row(children: [
                    Icon(Icons.thumb_up_alt_outlined, size: 14, color: colors.textSubtle),
                    const SizedBox(width: 4),
                    Text('مفيد ($helpfulCount)', style: TextStyle(fontSize: 11, color: colors.textSubtle)),
                  ]),
                ),
              ),
              const SizedBox(width: 12),
              InkWell(
                onTap: () => context.read<ReviewBloc>().add(FlagReview(reviewId: reviewId, reason: 'inappropriate')),
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  child: Row(children: [
                    Icon(Icons.flag_outlined, size: 14, color: colors.textSubtle),
                    const SizedBox(width: 4),
                    Text(context.tr('str_d40b505f'), style: TextStyle(fontSize: 11, color: colors.textSubtle)),
                  ]),
                ),
              ),
            ],
          ),
        ],
      ),
    ).animate(delay: (300 + index * 80).ms).fadeIn().slideY(begin: 0.05, end: 0);
  }

  void _showSubmitSheet(BuildContext context) {
    final colors = context.colors;
    final bodyCtrl = TextEditingController();
    final titleCtrl = TextEditingController();
    int selectedRating = 0;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: colors.surfaceElevated,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: colors.strokeSubtle, borderRadius: BorderRadius.circular(2)))),
              const SizedBox(height: 16),
              Text('إضافة تقييم', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.textPrimary), textAlign: TextAlign.center),
              const SizedBox(height: 20),
              // Star rating
              Row(mainAxisAlignment: MainAxisAlignment.center, children: List.generate(5, (i) => GestureDetector(
                onTap: () => setModalState(() => selectedRating = i + 1),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Icon(i < selectedRating ? Icons.star_rounded : Icons.star_outline_rounded, size: 36, color: colors.goldFunding),
                ),
              ))),
              const SizedBox(height: 16),
              TextField(controller: titleCtrl, style: TextStyle(color: colors.textPrimary),
                decoration: InputDecoration(labelText: 'عنوان التقييم (اختياري)', filled: true, fillColor: colors.backgroundSecondary,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: colors.strokeSubtle)))),
              const SizedBox(height: 12),
              TextField(controller: bodyCtrl, maxLines: 4, style: TextStyle(color: colors.textPrimary),
                decoration: InputDecoration(labelText: 'تفاصيل التقييم *', filled: true, fillColor: colors.backgroundSecondary,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: colors.strokeSubtle)))),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: () {
                  if (selectedRating == 0 || bodyCtrl.text.trim().length < 10) return;
                  context.read<ReviewBloc>().add(SubmitReview(
                    reviewableType: type, reviewableId: entityId,
                    overallRating: selectedRating, body: bodyCtrl.text.trim(),
                    title: titleCtrl.text.trim().isNotEmpty ? titleCtrl.text.trim() : null,
                  ));
                  Navigator.pop(ctx);
                },
                style: ElevatedButton.styleFrom(backgroundColor: colors.primaryBrand,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                child: const Text('إرسال التقييم', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15)),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
