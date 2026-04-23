-- E2E Critical Fix: Add missing payment_status enum values
-- The crowdfunding.service.ts uses 'pending' (initial state) and 'cancelled'
-- (cleanup of failed gateway items), but the PostgreSQL enum was missing both.
--
-- Lifecycle: pending → locked → released | refunded | cancelled | disputed
--
-- Applied: 2026-04-22 (E2E Test Session)

ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'pending' BEFORE 'locked';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'cancelled' AFTER 'disputed';
