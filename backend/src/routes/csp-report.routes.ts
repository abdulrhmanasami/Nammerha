// ============================================================================
// Nammerha Backend — CSP Violation Report Endpoint (PLT-AUDIT-008)
// ============================================================================
// Receives Content-Security-Policy violation reports from browsers.
// These reports are sent automatically when a CSP directive is violated,
// providing visibility into potential XSS attacks, misconfigurations,
// or browser extensions interfering with the platform.
//
// Security:
//   - No authentication required (browser sends reports automatically)
//   - Strict rate limiting (20/minute per IP — browsers can be noisy)
//   - Only accepts application/csp-report content type
//   - Logs through structured logger for security monitoring
// ============================================================================
import { Router } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';
import { cspReportSchema } from '../validation/schemas';

const router = Router();

// ─── Rate Limiter ───────────────────────────────────────────────────────────
const cspReportLimiter = rateLimit({
    windowMs: 60_000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
});

// CSP reports are sent as application/csp-report (JSON)
router.use(express.json({ type: 'application/csp-report', limit: '4kb' }));

// ─── POST /api/csp-report — Receive CSP violation reports ───────────────────
router.post('/', cspReportLimiter, (req, res) => {
    try {
        const report = cspReportSchema.parse(req.body);
        const violationReport = report['csp-report'] as Record<string, unknown> | undefined;

        if (!violationReport) {
            res.status(400).json({ error: 'Invalid CSP report' });
            return;
        }

        // Log through structured logger for security monitoring
        // Filter out noise: browser extensions often violate CSP
        const blockedUri = String(violationReport['blocked-uri'] ?? '');
        const isExtensionNoise = blockedUri.startsWith('chrome-extension://') ||
            blockedUri.startsWith('moz-extension://') ||
            blockedUri.startsWith('safari-extension://');

        if (isExtensionNoise) {
            // Don't flood logs with browser extension violations
            res.status(204).end();
            return;
        }

        logger.warn('CSP_VIOLATION', {
            blockedUri,
            violatedDirective: violationReport['violated-directive'],
            effectiveDirective: violationReport['effective-directive'],
            documentUri: violationReport['document-uri'],
            sourceFile: violationReport['source-file'],
            lineNumber: violationReport['line-number'],
            columnNumber: violationReport['column-number'],
            statusCode: violationReport['status-code'],
            clientIp: req.ip,
        });

        res.status(204).end();
    } catch (err) {
        if (err instanceof ZodError) {
            // Malformed CSP report — log but never fail
            logger.warn('CSP report validation failed', { details: err.issues });
            res.status(204).end();
            return;
        }
        logger.error('CSP report handler failed', {
            error: err instanceof Error ? err.message : String(err),
        });
        res.status(204).end(); // Never fail CSP reporting
    }
});

export default router;
