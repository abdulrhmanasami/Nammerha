// ============================================================================
// Nammerha Backend — Real User Monitoring (RUM) Routes
// ============================================================================
// Receives Web Vitals (LCP, FID, CLS, TTFB, INP) telemetry from the frontend.
// Used for monitoring real-world performance in Syria on 2G/3G networks.
//
// Security:
//   - No authentication required (public telemetry)
//   - Rate limited (30 reports/minute per IP)
//   - Payload size limited by global /api/rum JSON limit (10kb)
// ============================================================================

import { Router } from 'express';
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

const router = Router();

// ─── Rate Limiter (30 per minute per IP) ────────────────────────────────────
const rumReportLimiter = rateLimit({
  windowMs: 60_000, // 1 minute window
  max: 30, // 30 reports per window (allows for frequent page navigation)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many RUM reports — please try again later' },
});

// ─── Payload Validation ─────────────────────────────────────────────────────
interface WebVitalMetric {
  name: string;
  value: number;
  rating: string;
}

interface RUMPayload {
  url: string;
  timestamp: string;
  connection?: string;
  effectiveType?: string;
  metrics: WebVitalMetric[];
}

function isValidRUMPayload(body: unknown): body is RUMPayload {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const obj = body as Record<string, unknown>;

  if (typeof obj['url'] !== 'string' || typeof obj['timestamp'] !== 'string') {
    return false;
  }

  if (!Array.isArray(obj['metrics'])) {
    return false;
  }

  // Basic metric validation
  for (const metric of obj['metrics']) {
    if (
      typeof metric !== 'object' ||
      metric === null ||
      typeof (metric as Record<string, unknown>)['name'] !== 'string' ||
      typeof (metric as Record<string, unknown>)['value'] !== 'number'
    ) {
      return false;
    }
  }

  return true;
}

// ─── POST /api/rum/vitals ───────────────────────────────────────────────────
router.post('/vitals', rumReportLimiter, (req: Request, res: Response) => {
  try {
    if (!isValidRUMPayload(req.body)) {
      res.status(400).json({ error: 'Invalid RUM payload' });
      return;
    }

    const payload = req.body;

    // Log through structured logger (ops can parse these from ELK/Datadog)
    logger.info('RUM_METRICS', {
      url: payload.url.slice(0, 512),
      connection: payload.connection?.slice(0, 32),
      effectiveType: payload.effectiveType?.slice(0, 32),
      metrics: payload.metrics,
      clientIp: req.ip,
    });

    // 204 No Content for successful telemetry sink
    res.status(204).end();
  } catch (err) {
    // Silent failure for telemetry to avoid polluting error logs excessively
    logger.debug('RUMRoute: handler failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).end();
  }
});

export default router;
