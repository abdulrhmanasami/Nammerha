// ============================================================================
// Nammerha Backend — Translation Service (Ticket 10.1)
// Hybrid NMT/LLM Translation with Glossary Enforcement & QE Scoring
// ============================================================================
// Architecture per "تأسيس محرك ترجمة احترافي للمنصة.md":
//   §1: Hybrid routing → structured content → NMT, creative → LLM
//   §2: RAG glossary via PostgreSQL pg_trgm (replaces FAISS)
//   §3: Quality Estimation (heuristic MVP)
//
// External providers are ABSTRACTED via environment variables.
// Works without API keys — returns cached translations or flags for review.
// ============================================================================
import { createHash } from 'crypto';
import pool from '../config/database';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SupportedLocale = 'ar' | 'en' | 'de' | 'fr' | 'tr';
export type ContentType = 'structured' | 'creative' | 'ui' | 'legal' | 'financial';
export type TranslationProvider = 'deepl' | 'openai' | 'anthropic' | 'google_nmt' | 'manual' | 'cached';
export type TranslationStatus = 'auto_published' | 'pending_review' | 'approved' | 'rejected';

export interface TranslateDTO {
    text: string;
    source_lang: SupportedLocale;
    target_lang: SupportedLocale;
    content_type?: ContentType;
    context?: string;  // e.g. 'finance', 'engineering'
}

export interface TranslationResult {
    translation_id: string;
    source_text: string;
    translated_text: string;
    source_lang: SupportedLocale;
    target_lang: SupportedLocale;
    provider: TranslationProvider;
    content_type: ContentType;
    qe_score: number;
    status: TranslationStatus;
    from_cache: boolean;
    glossary_terms_enforced: number;
}

export interface GlossaryTerm {
    term_id: string;
    source_term: string;
    source_lang: SupportedLocale;
    target_lang: SupportedLocale;
    approved_translation: string;
    context: string | null;
    is_active: boolean;
    created_at: Date;
}

export interface AddGlossaryTermDTO {
    source_term: string;
    source_lang?: SupportedLocale;
    target_lang: SupportedLocale;
    approved_translation: string;
    context?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const QE_AUTO_PUBLISH_THRESHOLD = 85;
const SUPPORTED_LOCALES: SupportedLocale[] = ['ar', 'en', 'de', 'fr', 'tr'];

const LOCALE_NAMES: Record<SupportedLocale, string> = {
    ar: 'العربية',
    en: 'English',
    de: 'Deutsch',
    fr: 'Français',
    tr: 'Türkçe',
};

// Content type detection keywords
const STRUCTURED_KEYWORDS = [
    'escrow', 'boq', 'bill of quantities', 'invoice', 'contract',
    'ledger', 'financial', 'payment', 'sanctions', 'compliance',
    'fidic', 'retention', 'milestone', 'variation order',
];

// ─── Content Type Detection ─────────────────────────────────────────────────

/**
 * Detect whether content is structured (→NMT) or creative (→LLM).
 * Per doc §1.3: financial/legal → NMT, marketing/UI → LLM.
 */
export function detectContentType(text: string, hint?: ContentType): ContentType {
    if (hint) { return hint; }

    const lower = text.toLowerCase();

    // Check for HTML/JSON structure → structured
    if (/<[^>]+>/.test(text) || /^\s*[{[]/.test(text)) {
        return 'structured';
    }

    // Check for financial/legal keywords
    const structuredHits = STRUCTURED_KEYWORDS.filter((kw) => lower.includes(kw));
    if (structuredHits.length >= 2) { return 'financial'; }

    // Check for numbers density (tables, financial data)
    const numberRatio = (text.match(/\d/g) || []).length / text.length;
    if (numberRatio > 0.15) { return 'financial'; }

    // Default: creative content
    return 'creative';
}

/**
 * Route content type to appropriate provider.
 * Per doc §1.3: structured → DeepL (NMT), creative → LLM.
 */
function routeToProvider(contentType: ContentType): TranslationProvider {
    switch (contentType) {
        case 'structured':
        case 'financial':
        case 'legal':
            return 'deepl';       // NMT — preserves tags, fast, cheap
        case 'creative':
        case 'ui':
            return 'openai';      // LLM — cultural nuance for Arabic/Turkish
        default:
            return 'deepl';
    }
}

// ─── Translation Core ───────────────────────────────────────────────────────

/**
 * Hash source text for cache lookup.
 */
function hashText(text: string): string {
    return createHash('sha256').update(text.trim()).digest('hex');
}

/**
 * Translate text using the hybrid architecture.
 *
 * Flow: Cache check → Glossary retrieval → Provider routing → QE → Store
 */
export async function translateText(dto: TranslateDTO): Promise<TranslationResult> {
    const { text, source_lang, target_lang, context } = dto;

    // 1. Validate languages
    if (!SUPPORTED_LOCALES.includes(source_lang) || !SUPPORTED_LOCALES.includes(target_lang)) {
        throw new Error(`Unsupported locale. Supported: ${SUPPORTED_LOCALES.join(', ')}`);
    }
    if (source_lang === target_lang) {
        throw new Error('Source and target languages must be different');
    }

    const textHash = hashText(text);

    // 2. Cache check
    const cached = await pool.query(
        `SELECT * FROM translations
         WHERE source_text_hash = $1 AND target_lang = $2
           AND status IN ('auto_published', 'approved')
           AND (cache_expires_at IS NULL OR cache_expires_at > NOW())
         LIMIT 1`,
        [textHash, target_lang]
    );

    if (cached.rows.length > 0) {
        const row = cached.rows[0];
        return {
            translation_id: row.translation_id,
            source_text: row.source_text,
            translated_text: row.translated_text,
            source_lang: row.source_lang,
            target_lang: row.target_lang,
            provider: 'cached',
            content_type: row.content_type,
            qe_score: parseFloat(row.qe_score),
            status: row.status,
            from_cache: true,
            glossary_terms_enforced: 0,
        };
    }

    // 3. Detect content type and route to provider
    const contentType = detectContentType(text, dto.content_type);
    const provider = routeToProvider(contentType);

    // 4. Retrieve glossary terms for this language pair
    const glossaryTerms = await getGlossaryForPair(source_lang, target_lang, context);

    // 5. Call translation provider
    //    Calls DeepL (NMT) or OpenAI (LLM) based on content type routing.
    //    Falls back to [UNTRANSLATED] prefix when API keys are absent.
    let translatedText = await callProvider(provider, text, source_lang, target_lang, glossaryTerms);

    // 6. Enforce glossary post-processing
    let termsEnforced = 0;
    for (const term of glossaryTerms) {
        if (translatedText.includes(term.source_term)) {
            translatedText = translatedText.replace(
                // eslint-disable-next-line security/detect-non-literal-regexp -- Input is sanitized by escapeRegex()
                new RegExp(escapeRegex(term.source_term), 'gi'),
                term.approved_translation
            );
            termsEnforced++;
        }
    }

    // 7. Quality Estimation (doc §3)
    const qeResult = evaluateQuality(text, translatedText, source_lang, target_lang);
    const status: TranslationStatus = qeResult.score >= QE_AUTO_PUBLISH_THRESHOLD
        ? 'auto_published'
        : 'pending_review';

    // 8. Store translation
    const { rows } = await pool.query(
        `INSERT INTO translations
            (source_text_hash, source_text, source_lang, target_lang,
             translated_text, provider, content_type, qe_score, qe_details, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (source_text_hash, target_lang)
            WHERE status IN ('auto_published', 'approved')
        DO UPDATE SET
            translated_text = EXCLUDED.translated_text,
            provider = EXCLUDED.provider,
            qe_score = EXCLUDED.qe_score,
            qe_details = EXCLUDED.qe_details,
            status = EXCLUDED.status,
            created_at = NOW()
        RETURNING *`,
        [
            textHash, text, source_lang, target_lang,
            translatedText, provider, contentType,
            qeResult.score, JSON.stringify(qeResult.details), status,
        ]
    );

    // 9. If low confidence, add to review queue
    if (status === 'pending_review') {
        await pool.query(
            `INSERT INTO translation_review_queue (translation_id, flag_reason, qe_score)
            VALUES ($1, $2, $3)`,
            [rows[0].translation_id, qeResult.primary_issue, qeResult.score]
        );
    }

    return {
        translation_id: rows[0].translation_id,
        source_text: text,
        translated_text: translatedText,
        source_lang,
        target_lang,
        provider,
        content_type: contentType,
        qe_score: qeResult.score,
        status,
        from_cache: false,
        glossary_terms_enforced: termsEnforced,
    };
}

// ─── Provider Abstraction ───────────────────────────────────────────────────

/**
 * Call translation provider. Abstracted for pluggable backends.
 *
 * In production:
 * - DeepL: process.env.DEEPL_API_KEY → POST https://api-free.deepl.com/v2/translate
 * - OpenAI: process.env.OPENAI_API_KEY → POST https://api.openai.com/v1/chat/completions
 *
 * Without API keys, returns the source text tagged as [UNTRANSLATED].
 */
async function callProvider(
    provider: TranslationProvider,
    text: string,
    sourceLang: SupportedLocale,
    targetLang: SupportedLocale,
    glossaryTerms: GlossaryTerm[]
): Promise<string> {
    // Build glossary instruction for LLM providers
    const glossaryInstruction = glossaryTerms.length > 0
        ? `\nMandatory terminology (MUST use these exact translations):\n${glossaryTerms.map(
            (t) => `  "${t.source_term}" → "${t.approved_translation}"`
        ).join('\n')}\n`
        : '';

    const langNames: Record<SupportedLocale, string> = {
        ar: 'Arabic', en: 'English', de: 'German', fr: 'French', tr: 'Turkish',
    };

    switch (provider) {
        case 'deepl': {
            const apiKey = process.env.DEEPL_API_KEY;
            if (!apiKey) {
                return `[DEEPL_UNTRANSLATED:${targetLang}] ${text}`;
            }
            // DeepL API call
            try {
                const deepLLangMap: Record<SupportedLocale, string> = {
                    ar: 'AR', en: 'EN', de: 'DE', fr: 'FR', tr: 'TR',
                };
                const response = await fetch('https://api-free.deepl.com/v2/translate', {
                    method: 'POST',
                    headers: {
                        'Authorization': `DeepL-Auth-Key ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        text: [text],
                        source_lang: deepLLangMap[sourceLang],
                        target_lang: deepLLangMap[targetLang],
                        tag_handling: 'html',
                        preserve_formatting: true,
                    }),
                });
                if (!response.ok) {
                    console.error(`[Translation] DeepL error: ${response.status}`);
                    return `[DEEPL_ERROR:${response.status}] ${text}`;
                }
                const data = await response.json() as { translations: Array<{ text: string }> };
                return data.translations[0]?.text ?? text;
            } catch (err) {
                console.error('[Translation] DeepL call failed:', err);
                return `[DEEPL_OFFLINE] ${text}`;
            }
        }

        case 'openai': {
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) {
                return `[LLM_UNTRANSLATED:${targetLang}] ${text}`;
            }
            try {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o',
                        messages: [
                            {
                                role: 'system',
                                content: `You are a professional translator for the Nammerha reconstruction platform. Translate from ${langNames[sourceLang]} to ${langNames[targetLang]}. Preserve HTML tags exactly. Adapt cultural nuances naturally.${glossaryInstruction}`,
                            },
                            { role: 'user', content: text },
                        ],
                        temperature: 0.3,
                        max_tokens: Math.max(text.length * 3, 500),
                    }),
                });
                if (!response.ok) {
                    console.error(`[Translation] OpenAI error: ${response.status}`);
                    return `[LLM_ERROR:${response.status}] ${text}`;
                }
                const data = await response.json() as {
                    choices: Array<{ message: { content: string } }>;
                };
                return data.choices[0]?.message?.content?.trim() ?? text;
            } catch (err) {
                console.error('[Translation] OpenAI call failed:', err);
                return `[LLM_OFFLINE] ${text}`;
            }
        }

        default:
            return `[UNSUPPORTED_PROVIDER:${provider}] ${text}`;
    }
}

// ─── Quality Estimation (Doc §3) ────────────────────────────────────────────

interface QEResult {
    score: number;       // 0-100
    primary_issue: string;
    details: Record<string, number | string>;
}

/**
 * Heuristic Quality Estimation for MVP.
 *
 * Checks:
 * 1. Length ratio (source vs target) — catches truncation/hallucination
 * 2. HTML tag preservation — critical for UI content
 * 3. Untranslated markers — detects provider failures
 * 4. Number preservation — financial data must retain numbers
 */
export function evaluateQuality(
    source: string,
    translated: string,
    _sourceLang: SupportedLocale,
    _targetLang: SupportedLocale
): QEResult {
    let score = 100;
    const details: Record<string, number | string> = {};
    let primaryIssue = 'none';

    // 1. Length ratio check (±50% is suspicious, per doc §6.3)
    const lengthRatio = translated.length / Math.max(source.length, 1);
    details.length_ratio = Math.round(lengthRatio * 100) / 100;
    if (lengthRatio < 0.3 || lengthRatio > 3.0) {
        score -= 30;
        primaryIssue = 'extreme_length_deviation';
    } else if (lengthRatio < 0.5 || lengthRatio > 2.5) {
        score -= 15;
        if (primaryIssue === 'none') { primaryIssue = 'length_deviation'; }
    }

    // 2. HTML tag preservation
    const sourceTags = (source.match(/<[^>]+>/g) || []).length;
    const translatedTags = (translated.match(/<[^>]+>/g) || []).length;
    details.source_tags = sourceTags;
    details.translated_tags = translatedTags;
    if (sourceTags > 0 && sourceTags !== translatedTags) {
        const tagDiff = Math.abs(sourceTags - translatedTags);
        score -= tagDiff * 10;
        if (primaryIssue === 'none') { primaryIssue = 'tag_corruption'; }
    }

    // 3. Untranslated markers
    if (/\[.*?UNTRANSLATED.*?\]/.test(translated) || /\[.*?ERROR.*?\]/.test(translated) || /\[.*?OFFLINE.*?\]/.test(translated)) {
        score = 0;
        primaryIssue = 'provider_failure';
    }

    // SEC-FIELD-002 FIX: Atomic-safe number regex (no alternation inside groups)
    const sourceNumbers: string[] = source.match(/\d+(?:[.,]\d+)*/g) ?? [];
    const translatedNumbers: string[] = translated.match(/\d+(?:[.,]\d+)*/g) ?? [];
    details.source_numbers = sourceNumbers.length;
    details.translated_numbers = translatedNumbers.length;
    if (sourceNumbers.length > 0) {
        const preserved = sourceNumbers.filter((n) => translatedNumbers.includes(n)).length;
        const preservationRate = preserved / sourceNumbers.length;
        details.number_preservation = Math.round(preservationRate * 100);
        if (preservationRate < 0.8) {
            score -= 20;
            if (primaryIssue === 'none') { primaryIssue = 'number_loss'; }
        }
    }

    // 5. Empty translation
    if (translated.trim().length === 0) {
        score = 0;
        primaryIssue = 'empty_translation';
    }

    details.final_score = Math.max(0, Math.min(100, score));
    return {
        score: Math.max(0, Math.min(100, score)),
        primary_issue: primaryIssue,
        details,
    };
}

// ─── Glossary Management ────────────────────────────────────────────────────

/**
 * Get glossary terms for a language pair.
 */
async function getGlossaryForPair(
    sourceLang: SupportedLocale,
    targetLang: SupportedLocale,
    context?: string | null
): Promise<GlossaryTerm[]> {
    let sql = `SELECT * FROM translation_glossary
               WHERE source_lang = $1 AND target_lang = $2 AND is_active = true`;
    const params: unknown[] = [sourceLang, targetLang];

    if (context) {
        sql += ` AND (context = $3 OR context IS NULL)`;
        params.push(context);
    }

    sql += ` ORDER BY LENGTH(source_term) DESC`;  // Longest first to avoid partial replacements

    const { rows } = await pool.query(sql, params);
    return rows;
}

/**
 * Add an approved glossary term.
 */
export async function addGlossaryTerm(
    adminId: string,
    dto: AddGlossaryTermDTO
): Promise<GlossaryTerm> {
    const { rows } = await pool.query(
        `INSERT INTO translation_glossary
            (source_term, source_lang, target_lang, approved_translation, context, added_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (source_term, source_lang, target_lang, context)
        DO UPDATE SET approved_translation = EXCLUDED.approved_translation,
                      updated_at = NOW()
        RETURNING *`,
        [
            dto.source_term,
            dto.source_lang || 'en',
            dto.target_lang,
            dto.approved_translation,
            dto.context || null,
            adminId,
        ]
    );
    return rows[0];
}

/**
 * List glossary terms with optional filtering.
 */
export async function listGlossaryTerms(
    sourceLang?: SupportedLocale,
    targetLang?: SupportedLocale,
    context?: string
): Promise<GlossaryTerm[]> {
    let sql = `SELECT * FROM translation_glossary WHERE is_active = true`;
    const params: unknown[] = [];
    let paramIdx = 1;

    if (sourceLang) {
        sql += ` AND source_lang = $${paramIdx}`;
        params.push(sourceLang);
        paramIdx++;
    }
    if (targetLang) {
        sql += ` AND target_lang = $${paramIdx}`;
        params.push(targetLang);
        paramIdx++;
    }
    if (context) {
        sql += ` AND context = $${paramIdx}`;
        params.push(context);
        paramIdx++;
    }

    sql += ` ORDER BY source_term ASC`;

    const { rows } = await pool.query(sql, params);
    return rows;
}

/**
 * Remove a glossary term (soft delete).
 */
export async function removeGlossaryTerm(termId: string): Promise<boolean> {
    const { rowCount } = await pool.query(
        `UPDATE translation_glossary SET is_active = false WHERE term_id = $1`,
        [termId]
    );
    return (rowCount ?? 0) > 0;
}

// ─── Review Queue ───────────────────────────────────────────────────────────

/**
 * Get pending review queue.
 */
export async function getReviewQueue(): Promise<Record<string, unknown>[]> {
    const { rows } = await pool.query(
        `SELECT rq.*, t.source_text, t.translated_text, t.source_lang,
                t.target_lang, t.provider, t.content_type
         FROM translation_review_queue rq
         JOIN translations t ON t.translation_id = rq.translation_id
         WHERE rq.resolution IS NULL
         ORDER BY rq.qe_score ASC, rq.created_at ASC`
    );
    return rows;
}

/**
 * Review a translation — approve, correct, or reject.
 */
export async function reviewTranslation(
    reviewId: string,
    reviewerId: string,
    resolution: 'approved' | 'corrected' | 'rejected',
    correctedText?: string
): Promise<Record<string, unknown>> {
    // Update review queue
    const { rows: reviewRows } = await pool.query(
        `UPDATE translation_review_queue
         SET resolution = $1, reviewer_id = $2, corrected_text = $3, resolved_at = NOW()
         WHERE review_id = $4
         RETURNING *`,
        [resolution, reviewerId, correctedText || null, reviewId]
    );

    if (reviewRows.length === 0) {
        throw new Error('Review item not found');
    }

    const review = reviewRows[0];

    // Update translation status
    if (resolution === 'approved' || resolution === 'corrected') {
        const newText = resolution === 'corrected' && correctedText
            ? correctedText
            : undefined;

        const updateFields = newText
            ? `status = 'approved', translated_text = $2, reviewed_by = $3, reviewed_at = NOW()`
            : `status = 'approved', reviewed_by = $2, reviewed_at = NOW()`;

        const updateParams = newText
            ? [review.translation_id, newText, reviewerId]
            : [review.translation_id, reviewerId];

        await pool.query(
            `UPDATE translations SET ${updateFields} WHERE translation_id = $1`,
            updateParams
        );
    } else {
        await pool.query(
            `UPDATE translations SET status = 'rejected' WHERE translation_id = $1`,
            [review.translation_id]
        );
    }

    return review;
}

/**
 * Get translation statistics.
 */
export async function getTranslationStats(): Promise<Record<string, unknown>> {
    const [totalRes, byProviderRes, byStatusRes, glossaryRes, queueRes] = await Promise.all([
        pool.query(`SELECT COUNT(*) FROM translations`),
        pool.query(`SELECT provider, COUNT(*) FROM translations GROUP BY provider ORDER BY count DESC`),
        pool.query(`SELECT status, COUNT(*) FROM translations GROUP BY status`),
        pool.query(`SELECT COUNT(*) FROM translation_glossary WHERE is_active = true`),
        pool.query(`SELECT COUNT(*) FROM translation_review_queue WHERE resolution IS NULL`),
    ]);

    return {
        total_translations: parseInt(totalRes.rows[0].count as string, 10),
        by_provider: byProviderRes.rows,
        by_status: byStatusRes.rows,
        glossary_terms: parseInt(glossaryRes.rows[0].count as string, 10),
        pending_reviews: parseInt(queueRes.rows[0].count as string, 10),
        supported_locales: SUPPORTED_LOCALES,
        locale_names: LOCALE_NAMES,
    };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export { SUPPORTED_LOCALES, LOCALE_NAMES };
