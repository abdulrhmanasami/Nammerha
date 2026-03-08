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
import localeRouter from './middleware/locale-pages.middleware';
import * as path from 'path';

// ─── Create Express App ─────────────────────────────────────────────────────
const app = express();
const PORT = parseInt(process.env['PORT'] ?? '3001', 10);

// ─── Global Middleware ──────────────────────────────────────────────────────
app.use(helmet());                                 // Security headers

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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id'],
    credentials: true,
    maxAge: 86400, // 24h preflight cache
}));

app.use(express.json({ limit: '2mb' }));           // JSON body parser (reduced from 10mb)
app.use(express.urlencoded({ extended: true }));   // URL-encoded body parser
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
app.use('/api/matchmaking', matchmakingRoutes);

// Phase 2: EPA Oracle (FIDIC 13.8 price adjustment engine)
app.use('/api/oracle', epaOracleRoutes);

// Phase 2: Client Dashboard (bird's eye project view)
app.use('/api/dashboard', dashboardRoutes);

// Phase 3: Reality Capture (PlanRadar 360 + Houzz Pro LIDAR patterns)
app.use('/api/reality-capture', realityCaptureRoutes);

// Phase 4: Open Data Portal (OCDS public APIs — بوابة البيانات المفتوحة)
app.use('/api/open-data', openDataRoutes);

// Phase 4: Global Compliance Engine (SDN screening, export controls, security events)
app.use('/api/compliance', complianceRoutes);

// Phase 5: Translation Engine & Localization (hybrid NMT/LLM, glossary, locale detection)
app.use('/api/translation', translationRoutes);

// Phase 6: Storage Service (pre-signed S3-compatible uploads — P2-005)
app.use('/api/storage', storageRoutes);

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
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Server] Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: process.env['NODE_ENV'] === 'development' ? err.message : 'Internal server error',
    });
});

// ─── Start Server & Graceful Shutdown (CRT-001: single listen) ──────────────
const server = app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║       NAMMERHA BACKEND — OCDS Platform             ║
║       Port: ${PORT}                                   ║
║       Environment: ${process.env['NODE_ENV'] ?? 'development'}                    ║
╚════════════════════════════════════════════════════╝
    `);
});

async function gracefulShutdown(signal: string): Promise<void> {
    console.warn(`[Nammerha] ${signal} received — shutting down gracefully...`);
    server.close(() => {
        console.warn('[Nammerha] HTTP server closed.');
    });
    try {
        const { default: pool } = await import('./config/database');
        await pool.end();
        console.warn('[Nammerha] Database pool closed.');
    } catch (err) {
        console.error('[Nammerha] Error closing database pool:', err);
    }
    process.exit(0);
}

process.on('SIGTERM', () => { gracefulShutdown('SIGTERM'); });
process.on('SIGINT', () => { gracefulShutdown('SIGINT'); });

export default app;
