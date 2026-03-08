-- ============================================================================
-- Migration 003: Payment Transactions Table
-- Supports Visa + Fatora gateway integration with escrow linkage
-- ============================================================================
BEGIN;
CREATE TABLE IF NOT EXISTS payment_transactions (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(50) UNIQUE NOT NULL,
    donor_id UUID NOT NULL REFERENCES users(user_id),
    item_id UUID NOT NULL REFERENCES itemized_boq(item_id),
    project_id VARCHAR(20) NOT NULL REFERENCES projects(project_id),
    amount BIGINT NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    gateway VARCHAR(20) NOT NULL CHECK (gateway IN ('visa', 'fatora')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
        status IN (
            'pending',
            'processing',
            'completed',
            'failed',
            'refunded'
        )
    ),
    gateway_tx_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);
-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_payment_transactions_reference ON payment_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_donor ON payment_transactions(donor_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_gateway ON payment_transactions(gateway);
COMMENT ON TABLE payment_transactions IS 'Payment records for Visa/Fatora gateway transactions linked to BOQ item donations';
COMMIT;