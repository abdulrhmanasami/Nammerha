// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — Translation & Locale Routes (Epic 10)
// Hybrid Translation API + Glossary Admin + Locale Detection + Hreflang
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as translation from '../services/translation.service';
import * as locale from '../services/locale.service';
import type { ApiResponse } from '../types';
import { safeRouteError } from '../utils/safe-error';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';
import { translateSchema, batchTranslateRequestSchema, addGlossaryTermSchema, resolveConflictSchema } from '../validation/schemas';

const router = Router();

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC ENDPOINTS (no auth required)
// ═════════════════════════════════════════════════════════════════════════════

// ─── GET /api/translation/supported-languages — Language List ───────────────
router.get('/supported-languages', (_req: Request, res: Response) => {
    const languages = locale.getSupportedLanguages();
    const response: ApiResponse = {
        success: true,
        data: languages,
        message: `${languages.length} supported languages`,
    };
    res.json(response);
});

// ─── GET /api/translation/locale/detect — Detect User Locale ────────────────
router.get('/locale/detect', (req: Request, res: Response) => {
    const acceptLanguage = req.headers['accept-language'] as string | undefined;
    // Country code can come from Cloudflare header or query param
    const countryCode = (req.headers['cf-ipcountry'] as string)
        || (req.query.country as string)
        || undefined;

    const result = locale.detectLocale(acceptLanguage, countryCode);

    const response: ApiResponse = {
        success: true,
        data: result,
        message: `Detected: ${result.detected_locale} (${result.confidence} confidence via ${result.source})`,
    };
    res.json(response);
});

// ─── GET /api/translation/locale/hreflang — Hreflang Tags ──────────────────
router.get('/locale/hreflang', (req: Request, res: Response) => {
    const urlPath = req.query.path as string;
    if (!urlPath) {
        res.status(400).json({
            success: false,
            error: 'Required query param: path (e.g. /projects/123)',
        } as ApiResponse);
        return;
    }

    const baseUrl = req.query.base as string | undefined;
    const tags = locale.generateHreflangTags(urlPath, baseUrl);

    const response: ApiResponse = {
        success: true,
        data: tags,
        message: `${tags.length} hreflang tags generated`,
    };
    res.json(response);
});

// ─── GET /api/translation/locale/suggestion — Suggestion Banner ─────────────
router.get('/locale/suggestion', (req: Request, res: Response) => {
    const currentLocale = (req.query.current as locale.SupportedLocale) || 'ar';
    const acceptLanguage = req.headers['accept-language'] as string | undefined;
    const countryCode = (req.headers['cf-ipcountry'] as string)
        || (req.query.country as string)
        || undefined;

    const detection = locale.detectLocale(acceptLanguage, countryCode);
    const banner = locale.buildSuggestionBanner(currentLocale, detection.detected_locale);

    const response: ApiResponse = {
        success: true,
        data: {
            ...banner,
            detection,
        },
        message: banner.show ? 'Language suggestion available' : 'No suggestion needed',
    };
    res.json(response);
});

// ═════════════════════════════════════════════════════════════════════════════
// AUTHENTICATED ENDPOINTS
// ═════════════════════════════════════════════════════════════════════════════

router.use(authMiddleware);
router.use(requireActive);

// ─── POST /api/translation/translate — Translate Text ───────────────────────
router.post('/translate', async (req: Request, res: Response) => {
    try {
        const dto = translateSchema.parse(req.body) as translation.TranslateDTO;

        const result = await translation.translateText(dto);

        const response: ApiResponse = {
            success: true,
            data: result,
            message: result.from_cache
                ? `Cached translation (QE: ${result.qe_score}%)`
                : `Translated via ${result.provider} (QE: ${result.qe_score}%, ${result.glossary_terms_enforced} glossary terms enforced)`,
        };
        res.json(response);
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
            return;
        }
        safeRouteError(res, error, 'Translation');
    }
});

// ─── POST /api/translation/translate/batch — Batch Translate ────────────────
router.post('/translate/batch', async (req: Request, res: Response) => {
    try {
        const { items, source_lang, target_lang, content_type, context } = batchTranslateRequestSchema.parse(req.body);

        // P2-NEW-005 FIX: Parallel batch translation with concurrency limiting.
        // Sequential processing of 50 items risks HTTP timeout (30s+).
        // Promise.allSettled processes in parallel while capturing individual failures.
        const CONCURRENCY_LIMIT = 5;
        const results: Array<Awaited<ReturnType<typeof translation.translateText>>> = [];

        // Process in chunks of CONCURRENCY_LIMIT to avoid overwhelming the translation backend
        for (let i = 0; i < items.length; i += CONCURRENCY_LIMIT) {
            const chunk = items.slice(i, i + CONCURRENCY_LIMIT);
            const chunkResults = await Promise.allSettled(
                chunk.map((text: string) =>
                    translation.translateText({
                        text,
                        source_lang: source_lang as translation.SupportedLocale,
                        target_lang: target_lang as translation.SupportedLocale,
                        content_type: content_type as translation.ContentType | undefined,
                        context,
                    })
                )
            );

            for (const result of chunkResults) {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    // Log individual translation failure but continue batch
                    logger.error('Translation: Batch item failed', { error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
                    results.push({
                        original: '',
                        translated: '',
                        source_lang,
                        target_lang,
                        from_cache: false,
                        error: result.reason instanceof Error ? result.reason.message : 'Translation failed',
                    } as unknown as Awaited<ReturnType<typeof translation.translateText>>);
                }
            }
        }

        const response: ApiResponse = {
            success: true,
            data: {
                total: results.length,
                from_cache: results.filter((r) => r.from_cache).length,
                results,
            },
            message: `${results.length} items translated`,
        };
        res.json(response);
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
            return;
        }
        safeRouteError(res, error, 'Translation');
    }
});

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS — Glossary Management
// ═════════════════════════════════════════════════════════════════════════════

// ─── GET /api/translation/glossary — List Glossary Terms ────────────────────
router.get('/glossary', async (req: Request, res: Response) => {
    try {
        const sourceLang = req.query.source as translation.SupportedLocale | undefined;
        const targetLang = req.query.target as translation.SupportedLocale | undefined;
        const context = req.query.context as string | undefined;

        const terms = await translation.listGlossaryTerms(sourceLang, targetLang, context);

        const response: ApiResponse = {
            success: true,
            data: terms,
            message: `${terms.length} glossary terms`,
        };
        res.json(response);
            } catch (error) {
                safeRouteError(res, error, 'Translation');
    }
});

// ─── POST /api/translation/glossary — Add Glossary Term ─────────────────────
router.post(
    '/glossary',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const dto = addGlossaryTermSchema.parse(req.body) as translation.AddGlossaryTermDTO;

            const term = await translation.addGlossaryTerm(getAuthUser(req).user_id, dto);

            const response: ApiResponse = {
                success: true,
                data: term,
                message: `Glossary term added: "${term.source_term}" → "${term.approved_translation}"`,
            };
            res.status(201).json(response);
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
                return;
            }
            safeRouteError(res, error, 'Translation');
        }
    }
);

// ─── DELETE /api/translation/glossary/:termId — Remove Glossary Term ────────
router.delete(
    '/glossary/:termId',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const removed = await translation.removeGlossaryTerm(
                String(req.params.termId)
            );

            if (!removed) {
                res.status(404).json({
                    success: false,
                    error: 'Term not found',
                } as ApiResponse);
                return;
            }

            const response: ApiResponse = {
                success: true,
                data: null,
                message: 'Glossary term removed',
            };
            res.json(response);
                } catch (error) {
                    safeRouteError(res, error, 'Translation');
        }
    }
);

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS — Review Queue
// ═════════════════════════════════════════════════════════════════════════════

// ─── GET /api/translation/review-queue — Pending Reviews ────────────────────
router.get(
    '/review-queue',
    requireRole('admin'),
    async (_req: Request, res: Response) => {
        try {
            const queue = await translation.getReviewQueue();

            const response: ApiResponse = {
                success: true,
                data: queue,
                message: `${queue.length} pending reviews`,
            };
            res.json(response);
                } catch (error) {
                    safeRouteError(res, error, 'Translation');
        }
    }
);

// ─── PATCH /api/translation/review/:reviewId — Review Translation ───────────
router.patch(
    '/review/:reviewId',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const { resolution, corrected_text } = resolveConflictSchema.parse(req.body);

            const result = await translation.reviewTranslation(
                String(req.params.reviewId),
                getAuthUser(req).user_id,
                resolution,
                corrected_text
            );

            const response: ApiResponse = {
                success: true,
                data: result,
                message: `Translation ${resolution}`,
            };
            res.json(response);
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
                return;
            }
            safeRouteError(res, error, 'Translation');
        }
    }
);

// ─── GET /api/translation/stats — Translation Statistics ────────────────────
router.get(
    '/stats',
    requireRole('admin'),
    async (_req: Request, res: Response) => {
        try {
            const stats = await translation.getTranslationStats();

            const response: ApiResponse = {
                success: true,
                data: stats,
                message: 'Translation engine statistics',
            };
            res.json(response);
                } catch (error) {
                    safeRouteError(res, error, 'Translation');
        }
    }
);

export default router;
