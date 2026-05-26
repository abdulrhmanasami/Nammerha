-- ============================================================================
-- Migration 007: Unified Citizen Model (AGENTS.md MEMO 1 Enforcement)
-- ============================================================================
-- Renames all remaining 'donor_id' columns to 'user_id' to eradicate the
-- 'donor' concept and enforce a unified identity across the platform.

BEGIN;

-- 1. Rename column in escrow_ledger
DO $$ 
BEGIN 
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'escrow_ledger' AND column_name = 'donor_id'
    ) THEN 
        ALTER TABLE escrow_ledger RENAME COLUMN donor_id TO user_id;
    END IF; 
END $$;

-- 2. Rename column in refund_requests
DO $$ 
BEGIN 
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'refund_requests' AND column_name = 'donor_id'
    ) THEN 
        ALTER TABLE refund_requests RENAME COLUMN donor_id TO user_id;
    END IF; 
END $$;

-- 3. Rename column in payment_transactions
DO $$ 
BEGIN 
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'payment_transactions' AND column_name = 'donor_id'
    ) THEN 
        ALTER TABLE payment_transactions RENAME COLUMN donor_id TO user_id;
    END IF; 
END $$;

-- 4. Rename column in impact_messages
DO $$ 
BEGIN 
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'impact_messages' AND column_name = 'donor_id'
    ) THEN 
        ALTER TABLE impact_messages RENAME COLUMN donor_id TO user_id;
    END IF; 
END $$;

-- 5. Rename column in vw_user_escrow_summary view (if it references donor_id)
-- Note: Views must be recreated if they depend on renamed columns, but Postgres 
-- usually handles RENAME COLUMN automatically for views unless it's a materialized view.

COMMIT;
