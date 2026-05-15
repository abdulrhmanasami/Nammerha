// ============================================================================
// Nammerha Backend — Route Registry (Centralized Route Registration)
// ============================================================================
// All API route registration consolidated in one place.
// Extracted from server.ts (IMP-004 refactor) to eliminate God File.
//
// Each route group is documented with:
//   - Data Flow Path reference (Path 1-4)
//   - Phase indicator (Core, Phase 2-6)
//   - Dedicated rate limiter (if applicable)
// ============================================================================

import type { Express } from 'express';
import express from 'express';
import {
    authLimiter,
    paymentLimiter,
    complianceLimiter,
    storageLimiter,
    translationLimiter,
    matchmakingLimiter,
} from '../middleware/rate-limiters';

// ─── Route Imports ──────────────────────────────────────────────────────────
import projectRoutes from './project.routes';
import marketplaceRoutes from './marketplace.routes';
import donationRoutes from './donation.routes';
import spatialProofRoutes from './spatial-proof.routes';
import adminRoutes from './admin.routes';
import notificationRoutes from './notification.routes';
import paymentRoutes from './payment.routes';
import authRoutes from './auth.routes';
import matchmakingRoutes from './matchmaking.routes';
import epaOracleRoutes from './epa-oracle.routes';
import dashboardRoutes from './project-dashboard.routes';
import realityCaptureRoutes from './reality-capture.routes';
import openDataRoutes from './open-data.routes';
import complianceRoutes from './compliance.routes';
import translationRoutes from './translation.routes';
import storageRoutes from './storage.routes';
import supplierRoutes from './supplier.routes';
import engineerRoutes from './engineer.routes';
import contractorRoutes from './contractor.routes';
import tradespersonRoutes from './tradesperson.routes';
import homeownerRoutes from './homeowner.routes';
import donorRoutes from './donor.routes';
import routingRoutes from './routing.routes';
import spatialRoutes from './spatial.routes';
import adminStatsRoutes from './admin-stats.routes';
import apiKeysRoutes from './api-keys.routes';
import contactRoutes from './contact.routes';
import clientErrorRoutes from './client-error.routes';
import cspReportRoutes from './csp-report.routes';
import roleRoutes from './role.routes';
import reviewRoutes from './review.routes';
import privacyRoutes from './privacy.routes';
import impactRoutes from './impact.routes';
import monetizationRoutes from './monetization.routes';
import subscriptionRoutes from './subscription.routes';
import enterpriseRoutes from './enterprise.routes';
import socialAuthRoutes from './social-auth.routes';
import contractPaymentRoutes from './contract-payment.routes';

/**
 * Register all API routes on the Express app.
 *
 * Route registration order matters for Express — more specific paths
 * must be registered before greedy catch-all patterns.
 */
export function registerRoutes(app: Express): void {
    // ── Auth (public — with strict rate limiting for brute-force protection) ──
    // GAP-S6 PLATINUM FIX: Tighter body limit for auth endpoints.
    // No legitimate auth payload exceeds 10KB (login: ~200B, register: ~500B).
    // Prevents memory exhaustion from oversized payloads on public endpoints.
    app.use('/api/auth', express.json({ limit: '10kb' }), authLimiter, authRoutes);

    // ── Social OAuth (Google, Apple, Facebook) — same limiter as auth ────────
    app.use('/api/auth', express.json({ limit: '10kb' }), authLimiter, socialAuthRoutes);

    // ── Path 1: Homeowner → Engineer ─────────────────────────────────────────
    app.use('/api/projects', projectRoutes);

    // ── Path 2: Donor → Escrow (public marketplace + authenticated donations)
    app.use('/api/marketplace', marketplaceRoutes);
    app.use('/api/donations', donationRoutes);

    // ── Path 3: Execution → Spatial Proof ────────────────────────────────────
    app.use('/api/spatial-proof', spatialProofRoutes);

    // ── Path 4: Release → Notify (admin panel) ──────────────────────────────
    // PLT-MAR12-005: adminStatsRoutes registered BEFORE adminRoutes.
    // Express matches routes in registration order — a future wildcard on
    // /api/admin/:param in adminRoutes would shadow /api/admin/stats.
    app.use('/api/admin/stats', adminStatsRoutes);
    app.use('/api/admin', adminRoutes);

    // ── Payment Gateway (Visa + Fatora) — rate limited ──────────────────────
    app.use('/api/payments', paymentLimiter, paymentRoutes);

    // ── Cross-cutting: Notifications ────────────────────────────────────────
    app.use('/api/notifications', notificationRoutes);

    // ── Phase 2: Matchmaking Engine (PostGIS-heavy — rate limited) ──────────
    app.use('/api/matchmaking', matchmakingLimiter, matchmakingRoutes);

    // ── Georavity Routing Intelligence (self-hosted Valhalla) ───────────────
    app.use('/api/routing', routingRoutes);

    // ── Phase 3: Spatial Intelligence (satellite + geofencing) ──────────────
    app.use('/api/spatial', spatialRoutes);

    // ── Phase 2: EPA Oracle (FIDIC 13.8 price adjustment) ──────────────────
    app.use('/api/oracle', epaOracleRoutes);

    // ── Phase 2: Role Portals ───────────────────────────────────────────────
    app.use('/api/supplier', supplierRoutes);
    app.use('/api/engineer', engineerRoutes);
    app.use('/api/contractor', contractorRoutes);
    app.use('/api/tradesperson', tradespersonRoutes);
    app.use('/api/homeowner', homeownerRoutes);
    app.use('/api/donor', donorRoutes);

    // ── Phase 1 Backend: Service Contracts & Payments ────────────────────────
    // Rate limited with paymentLimiter — financial mutation endpoints.
    // IMPORTANT: Registered BEFORE /api/dashboard to prevent route shadowing.
    app.use('/api/contracts', paymentLimiter, contractPaymentRoutes);

    // ── Phase 2: Client Dashboard ──────────────────────────────────────────
    app.use('/api/dashboard', dashboardRoutes);

    // ── Phase 3: Reality Capture (360° + LIDAR) ────────────────────────────
    app.use('/api/reality-capture', realityCaptureRoutes);

    // ── Phase 4: Open Data Portal (OCDS public APIs) ──────────────────────
    app.use('/api/open-data', openDataRoutes);

    // ── Phase 4: Compliance Engine (SDN screening — rate limited) ──────────
    app.use('/api/compliance', complianceLimiter, complianceRoutes);

    // ── Phase 5: Translation Engine (external API quota — rate limited) ────
    app.use('/api/translation', translationLimiter, translationRoutes);

    // ── Phase 6: Storage Service (pre-signed URL abuse — rate limited) ─────
    app.use('/api/storage', storageLimiter, storageRoutes);

    // ── API Key Management ─────────────────────────────────────────────────
    app.use('/api/keys', apiKeysRoutes);

    // ── Contact Form ───────────────────────────────────────────────────────
    app.use('/api/contact', contactRoutes);

    // ── Client Error & CSP Reporting ───────────────────────────────────────
    app.use('/api/client-errors', clientErrorRoutes);
    app.use('/api/csp-report', cspReportRoutes);

    // ── Role Management (Multi-Role Architecture) ──────────────────────────
    app.use('/api/roles', roleRoutes);

    // ── Reviews System (Polymorphic Multi-Dimensional) ─────────────────────
    app.use('/api/reviews', reviewRoutes);
    app.use('/api/privacy', privacyRoutes);
    app.use('/api/impact', impactRoutes);

    // ── Monetization: Commission + Donor tipping ──────────────────────────
    app.use('/api/revenue', monetizationRoutes);

    // ── SaaS Subscriptions: Plan management + Feature gating ──────────────
    app.use('/api/subscriptions', subscriptionRoutes);

    // ── FinTech + Enterprise TaaS ─────────────────────────────────────────
    app.use('/api/enterprise', enterpriseRoutes);
}
