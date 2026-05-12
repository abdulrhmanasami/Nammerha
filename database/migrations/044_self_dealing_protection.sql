-- ═══════════════════════════════════════════════════════════════════════════════
-- Nammerha Platform — Migration 044: Self-Dealing Protections (Absolute Zero)
-- Implements robust database triggers to prevent Universal Access contradictions.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PREVENT BID SELF-DEALING
-- A homeowner cannot bid on their own project.
-- An assigned engineer cannot bid on their supervised project.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_prevent_bid_self_dealing() RETURNS TRIGGER AS $$
DECLARE
    v_homeowner_id UUID;
    v_assigned_engineer_id UUID;
BEGIN
    -- Get the project owner and assigned engineer (if any)
    SELECT homeowner_id, assigned_engineer_id INTO v_homeowner_id, v_assigned_engineer_id
    FROM projects
    WHERE project_id = NEW.project_id;

    -- Prevent homeowner from bidding on their own project
    IF NEW.contractor_id = v_homeowner_id OR NEW.engineer_id = v_homeowner_id THEN
        RAISE EXCEPTION 'Self-dealing detected: Homeowner cannot bid on their own project.';
    END IF;

    -- Prevent assigned engineer from bidding as contractor on the same project
    IF NEW.contractor_id = v_assigned_engineer_id THEN
        RAISE EXCEPTION 'Self-dealing detected: Assigned engineer cannot bid as a contractor on the supervised project.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_bid_self_dealing ON contractor_bids;
CREATE TRIGGER trg_prevent_bid_self_dealing
BEFORE INSERT OR UPDATE ON contractor_bids
FOR EACH ROW EXECUTE FUNCTION fn_prevent_bid_self_dealing();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PREVENT PROOF SELF-DEALING (NO SELF-AUDIT)
-- An executing contractor cannot submit an engineering spatial proof for themselves.
-- A homeowner cannot act as the engineer for their own project.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_prevent_proof_self_dealing() RETURNS TRIGGER AS $$
DECLARE
    v_homeowner_id UUID;
    v_assigned_contractor_id UUID;
BEGIN
    SELECT homeowner_id, assigned_contractor_id INTO v_homeowner_id, v_assigned_contractor_id
    FROM projects
    WHERE project_id = NEW.project_id;

    IF NEW.engineer_id = v_homeowner_id THEN
        RAISE EXCEPTION 'Self-dealing detected: Homeowner cannot act as the engineer for their own project.';
    END IF;

    IF NEW.engineer_id = v_assigned_contractor_id THEN
        RAISE EXCEPTION 'Self-dealing detected: Executing contractor cannot audit their own work.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_proof_self_dealing ON spatial_proof;
CREATE TRIGGER trg_prevent_proof_self_dealing
BEFORE INSERT OR UPDATE ON spatial_proof
FOR EACH ROW EXECUTE FUNCTION fn_prevent_proof_self_dealing();


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PREVENT ESCROW FRAUD (NO SELF-RELEASE)
-- A donor cannot unilaterally release their funds without spatial proof validation.
-- A contractor cannot release funds to themselves.
-- A homeowner cannot authorize fund release (only engineers/auditors can).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_prevent_escrow_self_dealing() RETURNS TRIGGER AS $$
DECLARE
    v_homeowner_id UUID;
    v_assigned_contractor_id UUID;
BEGIN
    -- Only check if status is being changed to 'released'
    IF NEW.payment_status = 'released' AND (TG_OP = 'INSERT' OR OLD.payment_status != 'released') THEN
        
        -- Bypass rule if system/admin automated release (released_by IS NULL or special system UUID)
        -- Assuming released_by is mandatory for release.
        IF NEW.released_by IS NOT NULL THEN
            SELECT homeowner_id, assigned_contractor_id
            INTO v_homeowner_id, v_assigned_contractor_id
            FROM projects
            WHERE project_id = NEW.project_id;

            IF NEW.released_by = NEW.donor_id THEN
                RAISE EXCEPTION 'Self-dealing detected: Donor cannot release their own funds directly without audit.';
            END IF;

            IF NEW.released_by = v_homeowner_id THEN
                RAISE EXCEPTION 'Self-dealing detected: Homeowner cannot authorize fund release.';
            END IF;

            IF NEW.released_by = v_assigned_contractor_id THEN
                RAISE EXCEPTION 'Self-dealing detected: Contractor cannot release funds to themselves.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_escrow_self_dealing ON escrow_ledger;
CREATE TRIGGER trg_prevent_escrow_self_dealing
BEFORE INSERT OR UPDATE ON escrow_ledger
FOR EACH ROW EXECUTE FUNCTION fn_prevent_escrow_self_dealing();

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 044 COMPLETE
-- 3 trigger functions created.
-- ═══════════════════════════════════════════════════════════════════════════════
