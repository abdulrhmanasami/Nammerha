-- ═══════════════════════════════════════════════════════════════════════════════
-- Nammerha Platform — Migration 009: Translation Engine & Localization
-- Epic 10: Hybrid NMT/LLM Translation, Glossary, QE, Locale Detection
-- ═══════════════════════════════════════════════════════════════════════════════
-- Implements وثيقة "تأسيس محرك ترجمة احترافي للمنصة":
--   §1: Hybrid NMT + LLM translation architecture
--   §2: RAG terminology with PostgreSQL pg_trgm (replaces FAISS)
--   §3: Quality Estimation module
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SUPPORTED LANGUAGES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE supported_locale AS ENUM ('ar', 'en', 'de', 'fr', 'tr');
-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TRANSLATION GLOSSARY — Approved bilingual terminology
--    Replaces FAISS vector DB with PostgreSQL pg_trgm fuzzy matching.
--    Stores the "golden" translations for domain-specific terms.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE translation_glossary (
    term_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Source term (canonical English by default)
    source_term TEXT NOT NULL,
    source_lang supported_locale NOT NULL DEFAULT 'en',
    -- Approved translation
    target_lang supported_locale NOT NULL,
    approved_translation TEXT NOT NULL,
    -- Context helps disambiguate terms with multiple meanings
    context VARCHAR(100),
    -- e.g. 'finance', 'engineering', 'legal', 'ui'
    -- Metadata
    added_by UUID REFERENCES users(user_id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Unique per source+target+context
    UNIQUE (source_term, source_lang, target_lang, context)
);
COMMENT ON TABLE translation_glossary IS 'Approved bilingual terminology DB. Enforced as system instructions on translation engines to prevent terminology drift (doc §2).';
CREATE INDEX idx_glossary_source_trgm ON translation_glossary USING GIN (source_term gin_trgm_ops);
CREATE INDEX idx_glossary_lang_pair ON translation_glossary (source_lang, target_lang, is_active);
CREATE INDEX idx_glossary_context ON translation_glossary (context)
WHERE context IS NOT NULL;
-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TRANSLATIONS — Cached translation results with QE scores
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE translation_provider AS ENUM (
    'deepl',
    'openai',
    'anthropic',
    'google_nmt',
    'manual',
    'cached'
);
CREATE TYPE translation_content_type AS ENUM (
    'structured',
    'creative',
    'ui',
    'legal',
    'financial'
);
CREATE TYPE translation_status AS ENUM (
    'auto_published',
    'pending_review',
    'approved',
    'rejected'
);
CREATE TABLE translations (
    translation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Source
    source_text_hash VARCHAR(64) NOT NULL,
    -- SHA-256 of source text (for cache lookup)
    source_text TEXT NOT NULL,
    source_lang supported_locale NOT NULL,
    -- Target
    target_lang supported_locale NOT NULL,
    translated_text TEXT NOT NULL,
    -- Provider & routing
    provider translation_provider NOT NULL,
    content_type translation_content_type NOT NULL DEFAULT 'creative',
    -- Quality Estimation (doc §3)
    qe_score DECIMAL(5, 2) NOT NULL DEFAULT 0,
    -- 0.00 to 100.00
    qe_details JSONB NOT NULL DEFAULT '{}',
    -- Breakdown of QE checks
    -- Status
    status translation_status NOT NULL DEFAULT 'auto_published',
    -- Review
    reviewed_by UUID REFERENCES users(user_id),
    reviewed_at TIMESTAMPTZ,
    -- Cache management
    cache_expires_at TIMESTAMPTZ,
    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE translations IS 'Cached translations with QE scores. Auto-published if score ≥85%, otherwise pending_review (doc §3.2).';
-- Cache lookup index: find by source hash + target language
CREATE UNIQUE INDEX idx_translation_cache ON translations (source_text_hash, target_lang)
WHERE status IN ('auto_published', 'approved');
CREATE INDEX idx_translation_status ON translations (status, created_at DESC)
WHERE status = 'pending_review';
CREATE INDEX idx_translation_provider ON translations (provider, created_at DESC);
-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TRANSLATION REVIEW QUEUE — Low-confidence translations for human review
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE translation_review_queue (
    review_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    translation_id UUID NOT NULL REFERENCES translations(translation_id) ON DELETE CASCADE,
    -- Why flagged
    flag_reason TEXT NOT NULL,
    -- 'low_qe_score', 'glossary_mismatch', 'tag_corruption', etc.
    qe_score DECIMAL(5, 2) NOT NULL,
    -- Review
    reviewer_id UUID REFERENCES users(user_id),
    corrected_text TEXT,
    -- If reviewer provides correction
    resolution VARCHAR(20) CHECK (
        resolution IN ('approved', 'corrected', 'rejected')
    ),
    resolved_at TIMESTAMPTZ,
    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE translation_review_queue IS 'Human-in-the-loop review queue for low-confidence translations (doc §3.2).';
CREATE INDEX idx_review_pending ON translation_review_queue (created_at ASC)
WHERE resolution IS NULL;
-- ─────────────────────────────────────────────────────────────────────────────
-- 5. TRIGGERS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_glossary_updated_at BEFORE
UPDATE ON translation_glossary FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
COMMIT;
-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 009 COMPLETE
-- New tables: translation_glossary, translations, translation_review_queue
-- Enums: supported_locale, translation_provider, translation_content_type,
--        translation_status
-- ═══════════════════════════════════════════════════════════════════════════════