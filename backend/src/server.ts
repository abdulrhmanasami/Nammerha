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

// ─── Create Express App ─────────────────────────────────────────────────────
const app = express();
const PORT = parseInt(process.env['PORT'] ?? '3001', 10);

// ─── Global Middleware ──────────────────────────────────────────────────────
app.use(helmet());                                 // Security headers
app.use(cors());                                   // CORS (configure origins in production)
app.use(express.json({ limit: '10mb' }));          // JSON body parser
app.use(express.urlencoded({ extended: true }));   // URL-encoded body parser
app.use(requestTimingMiddleware());                // APM request timing (>200ms alerts)
app.use(auditMiddleware);                          // Auto audit trail

// ─── Health Check ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({
        status: 'healthy',
        service: 'nammerha-backend',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
    });
});

// ─── API Routes ─────────────────────────────────────────────────────────────
// Auth (public — no middleware)
app.use('/api/auth', authRoutes);

// Path 1: Homeowner → Engineer
app.use('/api/projects', projectRoutes);

// Path 2: Donor → Escrow (public marketplace + authenticated donations)
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/donations', donationRoutes);

// Path 3: Execution → Spatial Proof
app.use('/api/spatial-proof', spatialProofRoutes);

// Path 4: Release → Notify (admin panel)
app.use('/api/admin', adminRoutes);

// Payment Gateway (Visa + Fatora)
app.use('/api/payments', paymentRoutes);

// Cross-cutting: Notifications
app.use('/api/notifications', notificationRoutes);

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

// ─── Start Server ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║       NAMMERHA BACKEND — OCDS Platform             ║
║       Port: ${PORT}                                   ║
║       Environment: ${process.env['NODE_ENV'] ?? 'development'}                    ║
╚════════════════════════════════════════════════════╝

Routes:
  [Auth]   POST   /api/auth/register                       → Create account
  [Auth]   POST   /api/auth/login                          → Get JWT token

  [Path 1] POST   /api/projects                         → Create damage report
  [Path 1] POST   /api/projects/:id/assign-engineer     → Auto-assign engineer
  [Path 1] POST   /api/projects/:id/boq                 → Add BOQ item
  [Path 1] PATCH  /api/projects/:id/publish              → Publish to marketplace

  [Path 2] GET    /api/marketplace/projects               → Browse projects
  [Path 2] GET    /api/marketplace/projects/:id/boq       → Project BOQ details
  [Path 2] POST   /api/donations                          → Fund BOQ items (escrow)

  [Path 3] POST   /api/spatial-proof                      → Submit GPS proof
  [Path 3] GET    /api/spatial-proof/project/:id          → Project purchase orders

  [Path 4] GET    /api/admin/verifications/pending         → Pending verifications
  [Path 4] POST   /api/admin/escrow/release                → Release escrow funds
  [Path 4] POST   /api/admin/escrow/flag                   → Flag discrepancy

  [Pay]    POST   /api/payments/initiate                    → Start payment
  [Pay]    POST   /api/payments/webhook                     → Gateway callback
  [Pay]    GET    /api/payments/status/:ref                 → Payment status
  [Pay]    GET    /api/payments/history                     → Donor history

  [Cross]  GET    /api/notifications                       → User notifications
  [Cross]  GET    /api/notifications/unread-count           → Badge count
  [Cross]  PATCH  /api/notifications/:id/read              → Mark read
  [Cross]  PATCH  /api/notifications/read-all              → Mark all read
  `);
});

export default app;
