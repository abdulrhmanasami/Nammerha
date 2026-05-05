# Changelog

All notable changes to the Nammerha platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-05-05

### Added — Platinum Certification Wave
- **GAP-P5**: Crypto Web Worker for offloading SHA-256 hashing (922-byte bundle, zero main-thread blocking)
- **GAP-O2**: Real User Monitoring (RUM) — captures all 5 Core Web Vitals (LCP, FID, CLS, TTFB, INP)
- **GAP-O4**: Redis circuit breaker health endpoint (`GET /health/redis`)
- **GAP-T1**: Frontend unit tests — password-strength (22 tests) + i18n (10 tests)
- **GAP-A4**: Comprehensive `prefers-reduced-motion` guard (WCAG 2.3.3 AAA)
- **GAP-AR4**: Automated PostgreSQL backup script with encryption and rotation
- **GAP-AR2**: PM2 ecosystem config for cluster mode horizontal scaling
- **GAP-AR5**: Semantic versioning + CHANGELOG governance

### Changed
- **GAP-P3**: API monolith decomposed from 1521-line `api.ts` into 12 focused domain modules (51% reduction)
- **GAP-S1**: Financial transactions now enforce `SERIALIZABLE` isolation level with retry logic
- **GAP-P1**: Nginx configured with gzip-9 compression, HTML caching, and tightened CSP
- **GAP-A5**: Last RTL physical CSS violation fixed (`border-r` → `border-e`)
- Vitest config updated to include modular `api/` and `workers/` in coverage

### Fixed
- **GAP-S2**: Correlation ID middleware registered in server.ts (was imported but not used)
- **GAP-S3**: Redis password hidden via `REDISCLI_AUTH` environment variable in Docker healthcheck
- **GAP-S6**: Per-route body size limits (auth: 10KB, upload: 50MB, general: 1MB)
- **GAP-O3**: Slow query logging enabled in production for queries >200ms

### Security
- CSP stale CDN domains removed from `connect-src` and `script-src`
- Worker CSP verified: `worker-src 'self' blob:` already present
- Zero external CDN scripts — all assets self-hosted

## [1.0.0] - 2026-03-01

### Added
- Initial platform release
- 4 Secure Data Flow Paths (Homeowner → Engineer → Donor → Admin)
- OCDS-compliant project structure
- GPS-verified Spatial Proof system
- Multi-role portal architecture (Homeowner, Donor, Engineer, Contractor, Supplier, Admin)
- Fatora payment integration with webhook idempotency
- Trilingual i18n engine (Arabic, English, Turkish)
- Dark mode + RTL-first design system
