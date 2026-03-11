// ============================================================================
// Nammerha Backend — Server Entry Point
// ============================================================================
// OCDS-Compliant Platform Backend for Syria Reconstruction
// Implements 4 Secure Data Flow Paths:
//   Path 1: Homeowner → Engineer (damage report, BOQ)
//   Path 2: Donor → Escrow (itemized crowdfunding)
//   Path 3: Execution → Spatial Proof (GPS-verified delivery)
//   Path 4: Release → Notify (escrow release, donor notification)
// ============================================================================

// ── APM MUST be initialized FIRST (before all other imports) ────────────────
import { initAPM, requestTimingMiddleware } from './config/apm';
initAPM();
// ────────────────────────────────────────────────────────────────────────────

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { logger } from './utils/logger';
import cookieParser from 'cookie-parser';

// Load environment variables
dotenv.config();

// Import middleware
import { auditMiddleware } from './middleware/audit.middleware';

// Import routes
import projectRoutes from './routes/project.routes';
import marketplaceRoutes from './routes/marketplace.routes';
import donationRoutes from './routes/donation.routes';
import spatialProofRoutes from './routes/spatial-proof.routes';
import adminRoutes from './routes/admin.routes';
import notificationRoutes from './routes/notification.routes';
import paymentRoutes from './routes/payment.routes';
import authRoutes from './routes/auth.routes';
import matchmakingRoutes from './routes/matchmaking.routes';
import epaOracleRoutes from './routes/epa-oracle.routes';
import dashboardRoutes from './routes/project-dashboard.routes';
import realityCaptureRoutes from './routes/reality-capture.routes';
import openDataRoutes from './routes/open-data.routes';
import complianceRoutes from './routes/compliance.routes';
import translationRoutes from './routes/translation.routes';
import storageRoutes from './routes/storage.routes';
import supplierRoutes from './routes/supplier.routes';
import engineerRoutes from './routes/engineer.routes';
import contractorRoutes from './routes/contractor.routes';
import tradespersonRoutes from './routes/tradesperson.routes';
import homeownerRoutes from './routes/homeowner.routes';
import donorRoutes from './routes/donor.routes';
import routingRoutes from './routes/routing.routes';
import spatialRoutes from './routes/spatial.routes';
import localeRouter from './middleware/locale-pages.middleware';
import adminStatsRoutes from './routes/admin-stats.routes';
import apiKeysRoutes from './routes/api-keys.routes';
import * as path from 'path';

// ─── Create Express App ─────────────────────────────────────────────────────
const app = express();
const PORT = parseInt(process.env['PORT'] ?? '3001', 10);

// P1-NEW-001 FIX: Trust the first proxy (Nginx/Caddy).
// Without this, all requests appear from the container gateway IP,
// breaking rate limiting and poisoning audit trail source IPs.
app.set('trust proxy', 1);

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
            scriptSrc: ["'self'"],  // SEC-005: Removed 'unsafe-inline' — use nonce-based CSP for inline scripts
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
app.use(requestTimingMiddleware());                // APM request timing (>200ms alerts)
app.use(auditMiddleware);                          // Auto audit trail

// ─── Rate Limiting (MED-001) ────────────────────────────────────────────────
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 100,                    // 100 requests per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests. Please try again later.' },
});
app.use('/api', globalLimiter);

// Stricter limiter for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,                     // 10 login/register attempts per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many authentication attempts. Please wait 15 minutes.' },
});

// Stricter limiter for payment endpoints
const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many payment requests. Please try again later.' },
});

// HGH-AUD-005 FIX: Rate limiter for compliance/SDN screening endpoints.
// Without this, an attacker could brute-force name variations against the SDN list
// to map the entire screening database within hours.
const complianceLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,                     // 15 screening requests per 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many compliance requests. Please try again later.' },
});

// HGH-002 FIX: Dedicated rate limiter for storage upload-url generation.
// Each call produces a pre-signed URL that reserves cloud resources. Without
// throttling, an attacker could exhaust storage quotas or generate millions of
// pending upload slots.
const storageLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,                     // 30 upload-url requests per 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many storage requests. Please try again later.' },
});

// HGH-002 FIX: Dedicated rate limiter for translation endpoints.
// Each call consumes external NMT/LLM quotas (DeepL, OpenAI). Without throttling,
// an attacker could exhaust the paid API quota within minutes.
const translationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,                     // 20 translation requests per 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many translation requests. Please try again later.' },
});

// HGH-002 FIX: Dedicated rate limiter for matchmaking search.
// Search queries trigger heavy PostGIS distance calculations and scoring.
// Without throttling, an attacker could DDOS the database via repeated queries.
const matchmakingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,                     // 30 search requests per 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many matchmaking requests. Please try again later.' },
});

// HGH-AUD-006 FIX: CSRF Protection via Double-Submit Cookie pattern.
// Since the platform uses JWT (Bearer token) for authentication — not session
// cookies — traditional CSRF attacks have limited impact. However, the CORS
// config uses `credentials: true`, which means cookies ARE sent cross-origin.
// This lightweight middleware adds an additional defense layer for state-changing
// operations without requiring an external dependency.
import crypto from 'crypto';

function csrfProtection(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
): void {
    // Skip CSRF for safe methods and webhook endpoints
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method)) {
        return next();
    }

    // Skip for webhook callbacks (gateway-to-server, not browser-initiated)
    if (req.path.includes('/webhook')) {
        return next();
    }

    // JWT Bearer tokens are inherently CSRF-safe (not auto-attached like cookies).
    // If the request uses Bearer auth, it's not vulnerable to CSRF.
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
        return next();
    }

    // Development fallback: skip CSRF for X-User-Id header auth
    if (process.env['NODE_ENV'] === 'development' && req.headers['x-user-id']) {
        return next();
    }

    // For cookie-based requests without Bearer token, require CSRF token
    const csrfCookie = req.cookies?.['_csrf'] as string | undefined;
    const csrfHeader = req.headers['x-csrf-token'] as string | undefined;

    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        res.status(403).json({
            success: false,
            error: 'CSRF token validation failed',
        });
        return;
    }

    next();
}

// PLT-AUD-004 FIX: Rate limiter for CSRF token generation.
// crypto.randomBytes(32) consumes entropy — without throttling, an attacker
// flooding this endpoint could exhaust the entropy pool and stall the event loop.
const csrfLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,                     // 10 CSRF token requests per 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests. Please try again later.' },
});

// Endpoint to obtain a CSRF token (the client calls this before making
// state-changing requests without a Bearer token)
app.get('/api/csrf-token', csrfLimiter, (_req, res) => {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('_csrf', token, {
        httpOnly: false,  // Client JS needs to read this to send as header
        sameSite: 'strict',
        secure: process.env['NODE_ENV'] === 'production',
        maxAge: 3600_000,  // 1 hour
    });
    res.json({ success: true, csrfToken: token });
});

// Apply CSRF protection to all API routes
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
            version: '1.0.0',
            timestamp: new Date().toISOString(),
        });
    } catch {
        res.status(503).json({
            status: 'unhealthy',
            service: 'nammerha-backend',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            error: 'Database connection failed',
        });
    }
});

// ─── API Routes ─────────────────────────────────────────────────────────────
// Auth (public — with strict rate limiting for brute-force protection)
app.use('/api/auth', authLimiter, authRoutes);

// Path 1: Homeowner → Engineer
app.use('/api/projects', projectRoutes);

// Path 2: Donor → Escrow (public marketplace + authenticated donations)
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/donations', donationRoutes);

// Path 3: Execution → Spatial Proof
app.use('/api/spatial-proof', spatialProofRoutes);

// Path 4: Release → Notify (admin panel)
app.use('/api/admin', adminRoutes);

// Payment Gateway (Visa + Fatora) — rate limited
app.use('/api/payments', paymentLimiter, paymentRoutes);

// Cross-cutting: Notifications
app.use('/api/notifications', notificationRoutes);

// Phase 2: Matchmaking Engine (BuildZoom + Thumbtack hybrid)
// HGH-002: Protected with dedicated rate limiter (heavy PostGIS queries)
app.use('/api/matchmaking', matchmakingLimiter, matchmakingRoutes);

// Georavity Routing Intelligence (self-hosted Valhalla engine)
app.use('/api/routing', routingRoutes);

// Phase 3: Spatial Intelligence (satellite imagery + geofencing compliance)
app.use('/api/spatial', spatialRoutes);

// Phase 2: EPA Oracle (FIDIC 13.8 price adjustment engine)
app.use('/api/oracle', epaOracleRoutes);

// Phase 2: Supplier Portal (catalog management, PO tracking, dashboard)
app.use('/api/supplier', supplierRoutes);

// Phase 2: Engineer Portal (projects, stats, bids, profile, camera)
app.use('/api/engineer', engineerRoutes);

// Phase 2: Contractor Portal (projects, marketplace, bids, payments)
app.use('/api/contractor', contractorRoutes);

// Phase 2: Tradesperson Portal (requests, assignments, earnings)
app.use('/api/tradesperson', tradespersonRoutes);

// Phase 2: Homeowner Portal (projects, service requests, approvals, escrow)
app.use('/api/homeowner', homeownerRoutes);

// Phase 2: Donor Portal (impact, donations, marketplace, proofs)
app.use('/api/donor', donorRoutes);

// Phase 2: Client Dashboard (bird's eye project view)
app.use('/api/dashboard', dashboardRoutes);

// Phase 3: Reality Capture (PlanRadar 360 + Houzz Pro LIDAR patterns)
app.use('/api/reality-capture', realityCaptureRoutes);

// Phase 4: Open Data Portal (OCDS public APIs — بوابة البيانات المفتوحة)
app.use('/api/open-data', openDataRoutes);

// Phase 4: Global Compliance Engine (SDN screening, export controls, security events)
// HGH-AUD-005: Protected with dedicated rate limiter
app.use('/api/compliance', complianceLimiter, complianceRoutes);

// Phase 5: Translation Engine & Localization (hybrid NMT/LLM, glossary, locale detection)
// HGH-002: Protected with dedicated rate limiter (external API quota protection)
app.use('/api/translation', translationLimiter, translationRoutes);

// Phase 6: Storage Service (pre-signed S3-compatible uploads — P2-005)
// HGH-002: Protected with dedicated rate limiter (pre-signed URL abuse prevention)
app.use('/api/storage', storageLimiter, storageRoutes);

// Admin Statistics (time-series data for dashboard charts)
app.use('/api/admin/stats', adminStatsRoutes);

// API Key Management (Feature 5: create, list, revoke, usage)
app.use('/api/keys', apiKeysRoutes);

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
});

async function gracefulShutdown(signal: string): Promise<void> {
    logger.info('Graceful shutdown initiated', { signal });

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

export default app;
