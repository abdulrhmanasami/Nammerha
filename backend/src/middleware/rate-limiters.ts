// ============================================================================
// Nammerha Backend — Centralized Rate Limiters (express-rate-limit)
// ============================================================================
// All IP-based rate limiters consolidated in one place for governance.
// For user-keyed per-endpoint limiters, see rate-limiter.middleware.ts.
//
// Extracted from server.ts (IMP-004 refactor) for architectural clarity.
// ============================================================================

import rateLimit from 'express-rate-limit';

/** Standard rate-limit error response body (Arabic for Platinum consistency) */
const rateLimitMessage = (context: string) => {
    const contextAr = {
        'authentication': 'التسجيل/الدخول',
        'payment': 'الدفع',
        'compliance': 'التحقق الأمني',
        'storage': 'التخزين',
        'translation': 'الترجمة',
        'matchmaking': 'البحث'
    }[context] || 'العمليات';

    return {
        success: false,
        error: `تم تجاوز الحد الأقصى لطلبات ${contextAr}. يرجى المحاولة لاحقاً.`,
    };
};

// ─── Global API Limiter (MED-001) ───────────────────────────────────────────
/** 100 requests per 15 minutes per IP across all /api/* routes */
export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage(''),
});

// ─── Auth Limiter (Brute-force protection) ──────────────────────────────────
/** 10 login/register attempts per 15 minutes per IP */
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage('authentication'),
});

// ─── Payment Limiter ────────────────────────────────────────────────────────
/** 20 payment requests per 15 minutes per IP */
export const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage('payment'),
});

// ─── Compliance/SDN Screening Limiter (HGH-AUD-005) ────────────────────────
/** 15 screening requests per 15 minutes per IP.
 *  Without this, an attacker could brute-force name variations against the
 *  SDN list to map the entire screening database within hours. */
export const complianceLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage('compliance'),
});

// ─── Storage Upload-URL Limiter (HGH-002) ──────────────────────────────────
/** 30 upload-url requests per 15 minutes per IP.
 *  Each call produces a pre-signed URL that reserves cloud resources. Without
 *  throttling, an attacker could exhaust storage quotas or generate millions
 *  of pending upload slots. */
export const storageLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage('storage'),
});

// ─── Translation Limiter (HGH-002) ─────────────────────────────────────────
/** 20 translation requests per 15 minutes per IP.
 *  Each call consumes external NMT/LLM quotas (DeepL, OpenAI). Without
 *  throttling, an attacker could exhaust the paid API quota within minutes. */
export const translationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage('translation'),
});

// ─── Matchmaking Search Limiter (HGH-002) ──────────────────────────────────
/** 30 search requests per 15 minutes per IP.
 *  Search queries trigger heavy PostGIS distance calculations and scoring.
 *  Without throttling, an attacker could DDoS the database via repeated queries. */
export const matchmakingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage('matchmaking'),
});
