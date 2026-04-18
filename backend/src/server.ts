// ============================================================================
// Nammerha Backend — Server Entry Point
// ============================================================================
// OCDS-Compliant Platform Backend for Syria Reconstruction
// Implements 4 Secure Data Flow Paths:
//   Path 1: Homeowner → Engineer (damage report, BOQ)
//   Path 2: Donor → Escrow (itemized crowdfunding)
//   Path 3: Execution → Spatial Proof (GPS-verified delivery)
//   Path 4: Release → Notify (escrow release, donor notification)
//
// IMP-004 Refactor: Rate limiters → middleware/rate-limiters.ts
//                   CSRF protection → middleware/csrf.middleware.ts
//                   Route registration → routes/index.ts
// ============================================================================

// ── APM MUST be initialized FIRST (before all other imports) ────────────────
import { initAPM, requestTimingMiddleware } from './config/apm';
initAPM();
// ────────────────────────────────────────────────────────────────────────────

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import * as path from 'path';
import { readFileSync } from 'fs';
import cookieParser from 'cookie-parser';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

// Middleware
import { auditMiddleware } from './middleware/audit.middleware';
import { idempotencyMiddleware } from './middleware/idempotency.middleware';
import { globalLimiter } from './middleware/rate-limiters';
import { csrfProtection, csrfTokenRateLimiter, csrfTokenHandler } from './middleware/csrf.middleware';
import { mobileGuardMiddleware } from './middleware/mobile-guard.middleware';

// Route registry
import { registerRoutes } from './routes/index';

// GraphQL gateway (Phase 1: Strangler Fig pattern)
import { mountGraphQL } from './graphql/server';

// Locale pages middleware (handles /:locale/:page SSR)
import localeRouter from './middleware/locale-pages.middleware';

// Background jobs
import { startStalePaymentCleanup, stopStalePaymentCleanup } from './jobs/stale-payment-cleanup';

// P3-AUD-NEW-002 FIX: Dynamic version from package.json instead of hardcoded '1.0.0'
const PKG_VERSION = (() => {
    try { return JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf-8')).version; }
    catch { return '0.0.0'; }
})();

// ─── Create Express App ─────────────────────────────────────────────────────
const app = express();
const PORT = parseInt(process.env['PORT'] ?? '3001', 10);

// P1-NEW-001 FIX: Trust Local proxies (loopback, linklocal, uniquelocal).
// Supports environments with multiple reverse proxies (e.g. Cloudflare -> Nginx -> Node)
// by trusting the internal network's IPs and evaluating the X-Forwarded-For chain properly.
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

// ─── Security Headers (Report §5: Cybersecurity Architecture) ───────────────
// Helmet v8 sets HSTS, CSP, X-Frame-Options, X-Content-Type-Options by default.
// We customize HSTS for preload eligibility and CSP for required external resources.
app.use(helmet({
    // HSTS: 2 years + includeSubDomains + preload (eligible for https://hstspreload.org)
    strictTransportSecurity: {
        maxAge: 63072000,       // 2 years in seconds (preload requirement)
        includeSubDomains: true,
        preload: true,
    },
    // Content Security Policy: whitelist required CDN/external resources
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            // P1-AUD-CSP-001 FIX: Added cdnjs.cloudflare.com for GSAP (about.html scroll animations).
            // SEC-005: 'unsafe-inline' remains removed — use nonce-based CSP for inline scripts.
            scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            // PLT-AUDIT-008: styleSrc 'unsafe-inline' is an ACCEPTED RISK.
            // ───────────────────────────────────────────────────────────────
            // Required by: MapLibre GL (map library) which injects inline styles
            // for canvas overlays, popup positioning, and marker transforms.
            // Compensating controls:
            //   1. scriptSrc does NOT allow 'unsafe-inline' (critical XSS vector)
            //   2. CSP violation reporting enabled via reportUri
            //   3. Style injection is low-severity compared to script injection
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https://*.nammerha.com"],
            connectSrc: [
                "'self'",
                "https://*.nammerha.com",
                "https://*.auth0.com",
                "https://*.visa.com",       // Visa Checkout/Direct API
                "https://api.fatora.io",    // Fatora payment gateway
                "https://checkout.fatora.io", // Fatora checkout iframe
            ],
            frameSrc: ["'self'", "https://checkout.fatora.io"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: [],
            // PLT-AUDIT-008: CSP violation reporting for security monitoring
            reportUri: '/api/csp-report',
        },
    },
}));

// CRT-005: CORS with explicit origin whitelist (was wide-open)
const ALLOWED_ORIGINS = (process.env['CORS_ORIGINS'] ?? 'http://localhost:3000,https://nammerha.com,https://www.nammerha.com').split(',');
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, server-to-server, health checks)
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS: Origin '${origin}' not allowed`));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    // SEC-011: Only expose X-User-Id header in development mode.
    // In production, this dev-only header should not be in the CORS allowlist.
    allowedHeaders: process.env['NODE_ENV'] === 'development'
        ? ['Content-Type', 'Authorization', 'X-User-Id', 'Idempotency-Key', 'X-CSRF-Token']
        : ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-CSRF-Token'],
    credentials: true,
    maxAge: 86400, // 24h preflight cache
}));

// NMR-AUD-005 FIX: Capture raw request body for HMAC webhook verification.
// The `verify` callback stores the raw bytes on `req.rawBody` BEFORE JSON
// parsing, so the webhook handler can verify against the exact payload the
// gateway signed — not a reconstructed/re-serialized version (which is
// fragile due to JSON key ordering and extra-field stripping).
app.use(express.json({
    limit: '2mb',
    verify: (req: express.Request, _res, buf: Buffer) => {
        // Only capture raw body for the webhook endpoint (performance: avoid
        // unnecessary Buffer→string copies on every request)
        if (req.url === '/webhook' || req.originalUrl?.includes('/payments/webhook')) {
            (req as express.Request & { rawBody?: string }).rawBody = buf.toString('utf-8');
        }
    },
}));
app.use(express.urlencoded({ extended: true }));   // URL-encoded body parser
app.use(cookieParser());                           // NMR-PLT-001 FIX: Parse cookies for CSRF double-submit
app.use(mobileGuardMiddleware);                    // Enforce API versioning for mobile apps
app.use(requestTimingMiddleware());                // APM request timing (>200ms alerts)
app.use(auditMiddleware);                          // Auto audit trail
app.use(idempotencyMiddleware);                    // Titan Architect FIX: Idempotency enforcement

// ─── Rate Limiting (MED-001) ────────────────────────────────────────────────
app.use('/api', globalLimiter);

// ─── CSRF Protection ────────────────────────────────────────────────────────
app.get('/api/csrf-token', csrfTokenRateLimiter, csrfTokenHandler);
app.use('/api', csrfProtection);

// ─── Health Check ───────────────────────────────────────────────────────────
// MED-010: Verify actual DB connectivity instead of always returning 'healthy'
app.get('/health', async (_req, res) => {
    try {
        const { query: dbQuery } = await import('./config/database');
        await dbQuery('SELECT 1');
        res.json({
            status: 'healthy',
            service: 'nammerha-backend',
            version: PKG_VERSION,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        logger.warn('Health check: DB connectivity failed', {
            error: err instanceof Error ? err.message : String(err),
        });
        res.status(503).json({
            status: 'unhealthy',
            service: 'nammerha-backend',
            version: PKG_VERSION,
            timestamp: new Date().toISOString(),
            error: 'Database connection failed',
        });
    }
});

// ─── API Routes (registered from centralized registry) ──────────────────────
registerRoutes(app);

// ─── GraphQL Gateway (Phase 1: Strangler Fig Pattern) ────────────────────────
// Apollo Server requires async initialization. We mount it here so it's
// available AFTER REST routes but BEFORE the 404 catch-all.
// During the migration period, both REST (/api/*) and GraphQL (/graphql)
// operate simultaneously — clients choose which to use.
import { authMiddleware } from './middleware/auth.middleware';

// Mount auth middleware for GraphQL path (optional auth — doesn't 401 on missing token)
// The authMiddleware populates req.authUser if a valid token exists but does NOT
// reject unauthenticated requests (that's handled by resolver-level guards).
// We need a permissive wrapper that always calls next().
app.use('/graphql', async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const hasCookie = req.cookies?.['nammerha_jwt'];
    if (authHeader || hasCookie) {
        // Only run auth middleware if credentials are present
        return authMiddleware(req, res, next);
    }
    // No credentials → proceed as unauthenticated (public queries)
    next();
});

// Async mount of Apollo Server
mountGraphQL(app).catch((err) => {
    logger.error('CRITICAL: Failed to mount GraphQL server', {
        error: err instanceof Error ? err.message : String(err),
    });
});

// ─── Locale Pages (§5.1 URL Subdirectories + §5.2 Hreflang + §5.3 Metadata) ──
// Serves stitch pages at /:locale/:page with server-side HTML injection
app.use('/', localeRouter);

// ─── Stitch Static Assets ──────────────────────────────────────────────────
// Serve i18n module, phosphor icons, and page assets from stitch directory
const STITCH_ROOT = path.resolve(__dirname, '../stitch');
app.use('/i18n', express.static(path.join(STITCH_ROOT, 'i18n')));
app.use('/phosphor-icons', express.static(path.join(STITCH_ROOT, 'phosphor-icons')));

// ─── 404 Handler ────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
    });
});

// ─── Global Error Handler ───────────────────────────────────────────────────
// SEC-008 FIX: NEVER expose internal error messages to the client,
// regardless of NODE_ENV. Internal details are logged server-side only.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled error in request pipeline', { error: err.message, stack: err.stack });
    res.status(500).json({
        success: false,
        error: 'Internal server error',
    });
});

// ─── Start Server & Graceful Shutdown (CRT-001: single listen) ──────────────
const server = app.listen(PORT, () => {
    logger.info('Nammerha backend started', {
        port: PORT,
        environment: process.env['NODE_ENV'] ?? 'development',
        pid: process.pid,
    });

    // P1-PLT-001: Start background job to expire stale 'pending' payments
    startStalePaymentCleanup();
});

async function gracefulShutdown(signal: string): Promise<void> {
    logger.info('Graceful shutdown initiated', { signal });

    // P1-PLT-001: Stop stale payment cleanup before draining connections
    stopStalePaymentCleanup();

    // LOW-AUD-002 FIX: Force-kill safety net — if draining hangs, forcibly exit
    // after 30 seconds to prevent zombie processes.
    const forceKillTimer = setTimeout(() => {
        logger.error('Graceful shutdown timed out after 30s — forcing exit');
        process.exit(1);
    }, 30_000);
    forceKillTimer.unref(); // Don't prevent exit if everything cleans up before 30s

    // 1. Stop accepting new connections
    await new Promise<void>((resolve) => {
        server.close(() => {
            logger.info('HTTP server closed — no new connections accepted');
            resolve();
        });
    });

    // 2. Drain database connection pool (waits for in-flight queries to complete)
    try {
        const { default: pool } = await import('./config/database');
        await pool.end();
        logger.info('Database pool drained — all connections released');
    } catch (err) {
        logger.error('Error closing database pool', {
            error: err instanceof Error ? err.message : String(err),
        });
    }

    // 3. Clean exit
    logger.info('Graceful shutdown complete');
    process.exit(0);
}

process.on('SIGTERM', () => { gracefulShutdown('SIGTERM'); });
process.on('SIGINT', () => { gracefulShutdown('SIGINT'); });

// PLATINUM STANDARD FIX: Prevent sudden exits from unhandled errors, ensuring APM logs them before clean termination.
process.on('uncaughtException', (err: Error) => {
    logger.error('CRITICAL: Uncaught Exception', { error: err.message, stack: err.stack });
    gracefulShutdown('uncaughtException').catch(() => process.exit(1));
});

process.on('unhandledRejection', (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    logger.error('CRITICAL: Unhandled Promise Rejection', { error: message, stack });
    gracefulShutdown('unhandledRejection').catch(() => process.exit(1));
});

export default app;
