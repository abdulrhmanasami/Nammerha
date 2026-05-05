// ============================================================================
// Nammerha Frontend — API Module Index (GAP-P3 PLATINUM)
// ============================================================================
// Barrel re-export for backward compatibility. All existing `import { X } from
// '../api'` statements continue to work without changes.
//
// Architecture:
//   src/api/
//   ├── _client.ts       → Shared request(), CSRF, retry logic (140 lines)
//   ├── projects.ts      → Path 1: Homeowner → Engineer
//   ├── marketplace.ts   → Path 2: Public marketplace browsing
//   ├── donations.ts     → Path 2-3: Donations + Spatial Proof
//   ├── admin.ts         → Path 4: Admin panel + KYC
//   ├── auth.ts          → Auth + Role management
//   ├── cross-cutting.ts → Notifications, Health, Contact, Payments
//   ├── matchmaking.ts   → Matchmaking + EPA Oracle (FIDIC 13.8)
//   ├── platform.ts      → Dashboard, Reality Capture, Open Data, Compliance, Translation
//   ├── portals.ts       → All 6 role portals (Tradesperson→Donor)
//   ├── fintech.ts       → Revenue, Subscriptions, Storage, Enterprise
//   └── index.ts         → THIS FILE (barrel re-export)
//
// Previous: 1 monolithic file (1521 lines, 58KB)
// Now:      11 focused modules averaging ~80 lines each
//
// Tree-shaking: Vite statically analyzes named imports and eliminates unused
// domain modules from the production bundle. A page importing only `{ auth }`
// no longer pulls in 28 other domain objects.
// ============================================================================

// ── Shared infrastructure (exported for advanced use cases) ─────────────────
export type { ApiResponse } from './_client';

// ── Domain modules ──────────────────────────────────────────────────────────
export { projects } from './projects';
export { marketplace } from './marketplace';
export { donations, spatialProof } from './donations';
export { admin } from './admin';
export { auth, roles } from './auth';
export { notifications, health, contact, payments } from './cross-cutting';
export { matchmaking, epaOracle } from './matchmaking';
export { dashboard, realityCapture, openData, compliance, translation } from './platform';
export { tradesperson, supplier, engineer, contractor, homeowner, donor } from './portals';
export { revenueAdmin, subscriptions, storage, enterpriseAdmin } from './fintech';

// ── Exported types (used by pages via `import type`) ────────────────────────
export type {
    RevenueAdminSummary,
    CommissionTier,
    CommissionEntry,
    TipEntry,
    PresignResponse,
    EscrowFeeSummary,
    FeeConfig,
    EnterpriseOrg,
} from './fintech';
