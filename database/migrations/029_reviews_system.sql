-- ============================================================================
-- Migration 029: Polymorphic Reviews System
-- ============================================================================
-- PURPOSE: World-class multi-dimensional review system with trust scoring.
-- Implements the Polymorphic Reviews Table pattern from the strategic
-- multi-role architecture document (§ Polymorphic Associations).
--
-- ARCHITECTURE:
--   - Polymorphic: reviewable_type + reviewable_id target ANY profile/project
--   - Multi-dimensional: per-type rating axes (quality, timeliness, etc.)
--   - Trust Score Engine: verified × weight × time-decay aggregation
--   - Anti-fraud: one review per relationship, edit limits, moderation
--
-- TABLES CREATED:
--   1. review_dimensions     — Rating axes per reviewable type (lookup)
--   2. reviews               — Core polymorphic reviews table
--   3. review_ratings        — Multi-dimensional scores per review
--   4. review_responses      — Professional response from reviewed party
--   5. review_flags          — Moderation / reporting
--   6. review_helpful        — "Was this helpful?" votes
--   7. review_aggregates     — Materialized aggregate scores (performance)
-- ============================================================================

BEGIN;

-- ─── 1. Review Dimensions (Lookup Table) ────────────────────────────────────
-- Defines the rating axes available for each reviewable type.
-- e.g. contractor_profiles → work_quality, timeliness, communication, safety

CREATE TABLE IF NOT EXISTS review_dimensions (
    dimension_id    SERIAL       PRIMARY KEY,
    reviewable_type VARCHAR(50)  NOT NULL,
    dimension_key   VARCHAR(50)  NOT NULL,
    label_en        TEXT         NOT NULL,
    label_ar        TEXT         NOT NULL,
    weight          DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    sort_order      INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    UNIQUE(reviewable_type, dimension_key)
);

COMMENT ON TABLE review_dimensions IS 'Lookup table defining multi-dimensional rating axes per reviewable entity type';

-- ─── 2. Reviews (Core Polymorphic Table) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS reviews (
    review_id               UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
    reviewer_id             UUID         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    reviewable_type         VARCHAR(50)  NOT NULL,
    reviewable_id           UUID         NOT NULL,
    project_id              VARCHAR(36)  REFERENCES projects(project_id) ON DELETE SET NULL,
    overall_rating          SMALLINT     NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
    title                   VARCHAR(200),
    body                    TEXT         NOT NULL CHECK (char_length(body) >= 10),
    is_verified_interaction BOOLEAN      NOT NULL DEFAULT FALSE,
    verification_context    JSONB,
    status                  VARCHAR(20)  NOT NULL DEFAULT 'published'
                            CHECK (status IN ('published', 'hidden', 'flagged', 'removed')),
    edit_count              SMALLINT     NOT NULL DEFAULT 0 CHECK (edit_count <= 2),
    edited_at               TIMESTAMPTZ,
    helpful_count           INT          NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Anti-fraud: one review per (reviewer, target) pair
    UNIQUE(reviewer_id, reviewable_type, reviewable_id)
);

CREATE INDEX idx_reviews_reviewable ON reviews(reviewable_type, reviewable_id)
    WHERE status = 'published';
CREATE INDEX idx_reviews_reviewer   ON reviews(reviewer_id);
CREATE INDEX idx_reviews_project    ON reviews(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_reviews_created    ON reviews(created_at DESC);
CREATE INDEX idx_reviews_rating     ON reviews(overall_rating);

COMMENT ON TABLE reviews IS 'Polymorphic reviews: reviewable_type + reviewable_id target any profile or project';

-- ─── 3. Review Ratings (Multi-Dimensional Scores) ──────────────────────────

CREATE TABLE IF NOT EXISTS review_ratings (
    id              UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
    review_id       UUID    NOT NULL REFERENCES reviews(review_id) ON DELETE CASCADE,
    dimension_id    INT     NOT NULL REFERENCES review_dimensions(dimension_id) ON DELETE RESTRICT,
    score           SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),

    UNIQUE(review_id, dimension_id)
);

CREATE INDEX idx_review_ratings_review ON review_ratings(review_id);

COMMENT ON TABLE review_ratings IS 'Per-dimension ratings for each review (1-5 stars per axis)';

-- ─── 4. Review Responses ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS review_responses (
    response_id   UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
    review_id     UUID        NOT NULL UNIQUE REFERENCES reviews(review_id) ON DELETE CASCADE,
    responder_id  UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    body          TEXT        NOT NULL CHECK (char_length(body) >= 5),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE review_responses IS 'One professional response per review from the reviewed party';

-- ─── 5. Review Flags (Moderation) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS review_flags (
    flag_id       UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
    review_id     UUID        NOT NULL REFERENCES reviews(review_id) ON DELETE CASCADE,
    reporter_id   UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    reason        VARCHAR(50) NOT NULL
                  CHECK (reason IN ('spam', 'inappropriate', 'fake', 'conflict_of_interest', 'other')),
    description   TEXT,
    status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'reviewed', 'dismissed', 'actioned')),
    reviewed_by   UUID        REFERENCES users(user_id),
    reviewed_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One flag per reporter per review
    UNIQUE(review_id, reporter_id)
);

CREATE INDEX idx_review_flags_pending ON review_flags(status) WHERE status = 'pending';

COMMENT ON TABLE review_flags IS 'Review moderation: users can report spam, fake, or inappropriate reviews';

-- ─── 6. Review Helpful Votes ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS review_helpful (
    review_id   UUID    NOT NULL REFERENCES reviews(review_id) ON DELETE CASCADE,
    voter_id    UUID    NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    is_helpful  BOOLEAN NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (review_id, voter_id)
);

COMMENT ON TABLE review_helpful IS 'Track "Was this review helpful?" votes for review ranking';

-- ─── 7. Review Aggregates (Materialized Performance Cache) ─────────────────
-- Avoids expensive AVG/COUNT queries on every page load.
-- Auto-updated by trigger on reviews table.

CREATE TABLE IF NOT EXISTS review_aggregates (
    reviewable_type       VARCHAR(50)  NOT NULL,
    reviewable_id         UUID         NOT NULL,
    total_reviews         INT          NOT NULL DEFAULT 0,
    average_rating        DECIMAL(3,2) NOT NULL DEFAULT 0,
    verified_reviews      INT          NOT NULL DEFAULT 0,
    dimension_averages    JSONB        NOT NULL DEFAULT '{}',
    rating_distribution   JSONB        NOT NULL DEFAULT '{}',
    trust_score           DECIMAL(5,2) NOT NULL DEFAULT 0,
    last_review_at        TIMESTAMPTZ,
    recalculated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    PRIMARY KEY (reviewable_type, reviewable_id)
);

COMMENT ON TABLE review_aggregates IS 'Materialized aggregate scores per reviewable entity — auto-updated by trigger';

-- ─── 8. Auto-Recalculate Aggregates Function ───────────────────────────────
-- Called by trigger after INSERT/UPDATE/DELETE on reviews.
-- Calculates: average rating, verified count, dimension averages,
-- rating distribution, and trust score with time-decay.

CREATE OR REPLACE FUNCTION fn_recalculate_review_aggregates()
RETURNS TRIGGER AS $$
DECLARE
    v_type   VARCHAR(50);
    v_id     UUID;
    v_avg    DECIMAL(3,2);
    v_total  INT;
    v_verified INT;
    v_dist   JSONB;
    v_dims   JSONB;
    v_trust  DECIMAL(5,2);
    v_last   TIMESTAMPTZ;
BEGIN
    -- Determine the reviewable target from OLD or NEW
    IF TG_OP = 'DELETE' THEN
        v_type := OLD.reviewable_type;
        v_id   := OLD.reviewable_id;
    ELSE
        v_type := NEW.reviewable_type;
        v_id   := NEW.reviewable_id;
    END IF;

    -- Calculate aggregates from published reviews
    SELECT
        COALESCE(COUNT(*), 0),
        COALESCE(ROUND(AVG(overall_rating)::numeric, 2), 0),
        COALESCE(COUNT(*) FILTER (WHERE is_verified_interaction = TRUE), 0),
        MAX(created_at)
    INTO v_total, v_avg, v_verified, v_last
    FROM reviews
    WHERE reviewable_type = v_type
      AND reviewable_id   = v_id
      AND status = 'published';

    -- Rating distribution { "1": n, "2": n, ... }
    SELECT COALESCE(
        jsonb_object_agg(rating::text, cnt),
        '{}'::jsonb
    )
    INTO v_dist
    FROM (
        SELECT overall_rating AS rating, COUNT(*) AS cnt
        FROM reviews
        WHERE reviewable_type = v_type
          AND reviewable_id   = v_id
          AND status = 'published'
        GROUP BY overall_rating
    ) sub;

    -- Dimension averages { "quality": 4.2, "timeliness": 3.8 }
    SELECT COALESCE(
        jsonb_object_agg(dim_key, dim_avg),
        '{}'::jsonb
    )
    INTO v_dims
    FROM (
        SELECT
            rd.dimension_key AS dim_key,
            ROUND(AVG(rr.score)::numeric, 2) AS dim_avg
        FROM review_ratings rr
        JOIN review_dimensions rd ON rd.dimension_id = rr.dimension_id
        JOIN reviews r ON r.review_id = rr.review_id
        WHERE r.reviewable_type = v_type
          AND r.reviewable_id   = v_id
          AND r.status = 'published'
        GROUP BY rd.dimension_key
    ) sub;

    -- Trust Score: weighted average with verified multiplier + time decay
    -- Formula: Σ(rating × verified_mult × exp(-0.005 × days)) / Σ(verified_mult × exp(-0.005 × days))
    SELECT COALESCE(
        ROUND(
            (SUM(
                overall_rating
                * (CASE WHEN is_verified_interaction THEN 1.5 ELSE 1.0 END)
                * EXP(-0.005 * EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0)
            )
            /
            NULLIF(SUM(
                (CASE WHEN is_verified_interaction THEN 1.5 ELSE 1.0 END)
                * EXP(-0.005 * EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0)
            ), 0))::numeric,
        2),
    0)
    INTO v_trust
    FROM reviews
    WHERE reviewable_type = v_type
      AND reviewable_id   = v_id
      AND status = 'published';

    -- Upsert aggregate row
    INSERT INTO review_aggregates (
        reviewable_type, reviewable_id,
        total_reviews, average_rating, verified_reviews,
        dimension_averages, rating_distribution,
        trust_score, last_review_at, recalculated_at
    ) VALUES (
        v_type, v_id,
        v_total, v_avg, v_verified,
        v_dims, v_dist,
        v_trust, v_last, NOW()
    )
    ON CONFLICT (reviewable_type, reviewable_id) DO UPDATE SET
        total_reviews      = EXCLUDED.total_reviews,
        average_rating     = EXCLUDED.average_rating,
        verified_reviews   = EXCLUDED.verified_reviews,
        dimension_averages = EXCLUDED.dimension_averages,
        rating_distribution= EXCLUDED.rating_distribution,
        trust_score        = EXCLUDED.trust_score,
        last_review_at     = EXCLUDED.last_review_at,
        recalculated_at    = NOW();

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 9. Install Trigger ────────────────────────────────────────────────────

CREATE TRIGGER trg_reviews_aggregate_recalc
    AFTER INSERT OR UPDATE OR DELETE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION fn_recalculate_review_aggregates();

-- ─── 10. Updated_at Triggers ───────────────────────────────────────────────

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'reviews', 'review_responses'
    ]) LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW
             EXECUTE FUNCTION fn_update_timestamp()',
            tbl, tbl
        );
    END LOOP;
END $$;

-- ─── 11. Seed Review Dimensions ────────────────────────────────────────────
-- 23 dimensions across 5 reviewable types

INSERT INTO review_dimensions (reviewable_type, dimension_key, label_en, label_ar, weight, sort_order)
VALUES
    -- Contractor dimensions (5)
    ('contractor_profiles', 'work_quality',    'Work Quality',        'جودة العمل',            1.50, 1),
    ('contractor_profiles', 'timeliness',      'Timeliness',          'الالتزام بالمواعيد',      1.20, 2),
    ('contractor_profiles', 'communication',   'Communication',       'التواصل',                1.00, 3),
    ('contractor_profiles', 'safety',          'Safety Standards',    'معايير السلامة',          1.30, 4),
    ('contractor_profiles', 'value_for_money', 'Value for Money',     'القيمة مقابل المال',      1.00, 5),

    -- Supplier dimensions (5)
    ('supplier_profiles',   'material_quality', 'Material Quality',   'جودة المواد',            1.50, 1),
    ('supplier_profiles',   'delivery_speed',   'Delivery Speed',     'سرعة التسليم',           1.20, 2),
    ('supplier_profiles',   'packaging',        'Packaging',          'التغليف والتعبئة',        1.00, 3),
    ('supplier_profiles',   'accuracy',         'Order Accuracy',     'دقة الطلب',              1.30, 4),
    ('supplier_profiles',   'pricing_fairness', 'Pricing Fairness',   'عدالة التسعير',           1.00, 5),

    -- Engineer dimensions (4)
    ('engineer_profiles',   'assessment_accuracy', 'Assessment Accuracy', 'دقة التقييم',         1.50, 1),
    ('engineer_profiles',   'technical_expertise', 'Technical Expertise', 'الخبرة الفنية',       1.30, 2),
    ('engineer_profiles',   'report_quality',      'Report Quality',      'جودة التقارير',       1.20, 3),
    ('engineer_profiles',   'responsiveness',      'Responsiveness',      'سرعة الاستجابة',      1.00, 4),

    -- Tradesperson dimensions (4)
    ('tradesperson_profiles', 'craftsmanship',   'Craftsmanship',     'جودة الحرفة',            1.50, 1),
    ('tradesperson_profiles', 'reliability',     'Reliability',       'الموثوقية',               1.20, 2),
    ('tradesperson_profiles', 'cleanliness',     'Cleanliness',       'النظافة',                 1.00, 3),
    ('tradesperson_profiles', 'professionalism', 'Professionalism',   'الاحترافية',              1.00, 4),

    -- Project dimensions (5) — donors reviewing projects
    ('project',             'transparency',       'Transparency',     'الشفافية',                1.50, 1),
    ('project',             'impact',             'Impact',           'الأثر الاجتماعي',          1.30, 2),
    ('project',             'communication',      'Communication',    'التواصل والتحديثات',       1.00, 3),
    ('project',             'fund_usage',         'Fund Usage',       'استخدام الأموال',          1.50, 4),
    ('project',             'progress_accuracy',  'Progress Accuracy','دقة تتبع التقدم',         1.20, 5)
ON CONFLICT (reviewable_type, dimension_key) DO NOTHING;

COMMIT;
