// ============================================================================
// Nammerha Backend — Donor Service (المانح / المتبرع)
// Impact dashboard, donation tracking, proof gallery
// Complements crowdfunding.service.ts (which handles the funding mechanics)
// ============================================================================
import { query } from '../config/database';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DonorStats {
    total_donated: number;          // cents
    projects_supported: number;
    items_funded: number;
    escrow_locked: number;          // cents — still held
    escrow_released: number;        // cents — released to suppliers
    impact_score: number;           // 0-100, based on projects completed
}

export interface DonorDonation {
    escrow_id: string;
    project_id: string;
    project_title: string;
    item_id: string;
    material_name: string;
    amount_locked: number;          // cents
    status: string;                 // locked | released | refunded
    locked_at: Date;
    released_at: Date | null;
}

export interface FundedProject {
    project_id: string;
    title: string;
    damage_type: string;
    region: string | null;
    status: string;
    my_total_donated: number;       // cents
    total_project_cost: number;     // cents
    funded_percentage: number;
    items_i_funded: number;
    created_at: Date;
}

export interface ProjectFundingDetail {
    item_id: string;
    material_name: string;
    unit: string;
    unit_price: number;
    required_quantity: number;
    total_item_cost: number;
    total_funded: number;
    my_contribution: number;        // cents
    funding_percentage: number;
    supplier_name: string | null;
}

export interface ProofEntry {
    proof_id: string;
    project_id: string;
    project_title: string;
    material_name: string;
    photo_url: string | null;
    gps_lat: number | null;
    gps_lng: number | null;
    verified_by: string | null;
    verified_at: Date | null;
    description: string | null;
}

// ─── 1. Dashboard KPIs ─────────────────────────────────────────────────────

/**
 * Aggregate donor impact KPIs across all funded projects.
 */
export async function getMyStats(
    donorId: string,
): Promise<DonorStats> {
    const result = await query<{
        total_donated: string;
        items_funded: string;
        projects_supported: string;
        escrow_locked: string;
        escrow_released: string;
        projects_completed: string;
    }>(
        `SELECT
            COALESCE(SUM(el.amount_locked), 0) AS total_donated,
            COUNT(DISTINCT el.item_id) AS items_funded,
            COUNT(DISTINCT el.project_id) AS projects_supported,
            COALESCE(SUM(el.amount_locked) FILTER (WHERE el.payment_status = 'locked'), 0) AS escrow_locked,
            COALESCE(SUM(el.amount_locked) FILTER (WHERE el.payment_status = 'released'), 0) AS escrow_released,
            COUNT(DISTINCT el.project_id) FILTER (
                WHERE EXISTS (
                    SELECT 1 FROM projects p
                    WHERE p.project_id = el.project_id AND p.status = 'completed'
                )
            ) AS projects_completed
         FROM escrow_ledger el
         WHERE el.donor_id = $1`,
        [donorId],
    );

    const r = result.rows[0];
    const totalDonated = parseInt(r?.total_donated ?? '0', 10);
    const projectsSupported = parseInt(r?.projects_supported ?? '0', 10);
    const projectsCompleted = parseInt(r?.projects_completed ?? '0', 10);

    return {
        total_donated: totalDonated,
        projects_supported: projectsSupported,
        items_funded: parseInt(r?.items_funded ?? '0', 10),
        escrow_locked: parseInt(r?.escrow_locked ?? '0', 10),
        escrow_released: parseInt(r?.escrow_released ?? '0', 10),
        impact_score: projectsSupported > 0
            ? Math.round((projectsCompleted / projectsSupported) * 100)
            : 0,
    };
}

// ─── 2. Donation History ────────────────────────────────────────────────────

/**
 * Full donation history with project and item details.
 */
export async function getMyDonations(
    donorId: string,
    limit = 50,
): Promise<DonorDonation[]> {
    const result = await query<DonorDonation>(
        `SELECT
            el.escrow_id,
            el.project_id,
            p.title AS project_title,
            el.item_id,
            b.material_name,
            el.amount_locked,
            el.payment_status AS status,
            el.locked_at,
            el.released_at
         FROM escrow_ledger el
         JOIN projects p ON p.project_id = el.project_id
         JOIN itemized_boq b ON b.item_id = el.item_id
         WHERE el.donor_id = $1
         ORDER BY el.locked_at DESC
         LIMIT $2`,
        [donorId, limit],
    );
    return result.rows;
}

// ─── 3. My Impact (Projects I Funded) ───────────────────────────────────────

/**
 * Projects funded by donor with progress and completion status.
 */
export async function getMyImpact(
    donorId: string,
): Promise<FundedProject[]> {
    const result = await query<FundedProject>(
        `SELECT
            p.project_id,
            p.title,
            p.damage_type,
            p.address_text AS region,
            p.status,
            COALESCE(my.my_total, 0)::INT AS my_total_donated,
            COALESCE(boq.total_cost, 0)::INT AS total_project_cost,
            CASE WHEN COALESCE(boq.total_cost, 0) > 0
                 THEN ROUND((COALESCE(funded.total_funded, 0)::NUMERIC / boq.total_cost) * 100, 1)
                 ELSE 0
            END AS funded_percentage,
            COALESCE(my.items_count, 0)::INT AS items_i_funded,
            p.created_at
         FROM projects p
         JOIN (
            SELECT project_id,
                   SUM(amount_locked) AS my_total,
                   COUNT(DISTINCT item_id) AS items_count
            FROM escrow_ledger
            WHERE donor_id = $1
            GROUP BY project_id
         ) my ON my.project_id = p.project_id
         LEFT JOIN (
            SELECT project_id, SUM(unit_price * required_quantity) AS total_cost
            FROM itemized_boq GROUP BY project_id
         ) boq ON boq.project_id = p.project_id
         LEFT JOIN (
            SELECT project_id, SUM(amount_locked) AS total_funded
            FROM escrow_ledger GROUP BY project_id
         ) funded ON funded.project_id = p.project_id
         ORDER BY p.created_at DESC`,
        [donorId],
    );
    return result.rows;
}

// ─── 4. Marketplace (Browse Projects for Funding) ───────────────────────────

export interface MarketplaceProject {
    project_id: string;
    title: string;
    damage_type: string;
    region: string | null;
    status: string;
    total_cost: number;
    total_funded: number;
    funded_percentage: number;
    items_count: number;
    published_at: Date | null;
}

/**
 * Browse published projects available for funding.
 */
export async function getMarketplace(): Promise<MarketplaceProject[]> {
    const result = await query<MarketplaceProject>(
        `SELECT
            p.project_id,
            p.title,
            p.damage_type,
            p.address_text AS region,
            p.status,
            COALESCE(boq.total_cost, 0)::INT AS total_cost,
            COALESCE(funded.total_funded, 0)::INT AS total_funded,
            CASE WHEN COALESCE(boq.total_cost, 0) > 0
                 THEN ROUND((COALESCE(funded.total_funded, 0)::NUMERIC / boq.total_cost) * 100, 1)
                 ELSE 0
            END AS funded_percentage,
            COALESCE(boq.items_count, 0)::INT AS items_count,
            p.published_at
         FROM projects p
         LEFT JOIN (
            SELECT project_id,
                   SUM(unit_price * required_quantity) AS total_cost,
                   COUNT(*) AS items_count
            FROM itemized_boq GROUP BY project_id
         ) boq ON boq.project_id = p.project_id
         LEFT JOIN (
            SELECT project_id, SUM(amount_locked) AS total_funded
            FROM escrow_ledger WHERE status IN ('locked', 'released')
            GROUP BY project_id
         ) funded ON funded.project_id = p.project_id
         WHERE p.status = 'published'
         ORDER BY p.published_at DESC NULLS LAST`,
    );
    return result.rows;
}

// ─── 5. My Funding for a Specific Project ───────────────────────────────────

/**
 * Get BOQ items with my contribution for a specific project.
 */
export async function getProjectFunding(
    donorId: string,
    projectId: string,
): Promise<ProjectFundingDetail[]> {
    const result = await query<ProjectFundingDetail>(
        `SELECT
            b.item_id,
            b.material_name,
            b.unit,
            b.unit_price,
            b.required_quantity,
            (b.unit_price * b.required_quantity) AS total_item_cost,
            COALESCE(all_funded.total, 0)::INT AS total_funded,
            COALESCE(my_funded.my_total, 0)::INT AS my_contribution,
            CASE WHEN (b.unit_price * b.required_quantity) > 0
                 THEN ROUND((COALESCE(all_funded.total, 0)::NUMERIC / (b.unit_price * b.required_quantity)) * 100, 1)
                 ELSE 0
            END AS funding_percentage,
            sup.full_name AS supplier_name
         FROM itemized_boq b
         LEFT JOIN users sup ON sup.user_id = b.preferred_supplier_id
         LEFT JOIN (
            SELECT item_id, SUM(amount_locked) AS total
            FROM escrow_ledger WHERE status IN ('locked', 'released')
            GROUP BY item_id
         ) all_funded ON all_funded.item_id = b.item_id
         LEFT JOIN (
            SELECT item_id, SUM(amount_locked) AS my_total
            FROM escrow_ledger WHERE donor_id = $1 AND status IN ('locked', 'released')
            GROUP BY item_id
         ) my_funded ON my_funded.item_id = b.item_id
         WHERE b.project_id = $2
         ORDER BY b.material_name`,
        [donorId, projectId],
    );
    return result.rows;
}

// ─── 6. Proof Gallery ───────────────────────────────────────────────────────

/**
 * GPS-verified proof photos for items the donor funded.
 */
export async function getMyProofGallery(
    donorId: string,
): Promise<ProofEntry[]> {
    const result = await query<ProofEntry>(
        `SELECT
            dl.log_id AS proof_id,
            dl.project_id,
            p.title AS project_title,
            b.material_name,
            dl.photo_url,
            dl.gps_lat,
            dl.gps_lng,
            eng.full_name AS verified_by,
            dl.created_at AS verified_at,
            dl.description
         FROM daily_construction_logs dl
         JOIN projects p ON p.project_id = dl.project_id
         LEFT JOIN itemized_boq b ON b.project_id = dl.project_id
         LEFT JOIN escrow_ledger el ON el.item_id = b.item_id AND el.donor_id = $1
         LEFT JOIN users eng ON eng.user_id = dl.engineer_id
         WHERE el.donor_id = $1
           AND dl.photo_url IS NOT NULL
         GROUP BY dl.log_id, p.title, b.material_name, eng.full_name
         ORDER BY dl.created_at DESC
         LIMIT 50`,
        [donorId],
    );
    return result.rows;
}

// ─── 7. Impact Timeline (ENH-1) ────────────────────────────────────────────

/**
 * Chronological timeline of a donor's impact: donation → delivery → verification → release.
 * Each event shows what happened, when, and proof evidence where available.
 *
 * ENH-1: This is the "where did my money go?" feature — the core trust mechanism.
 * Links escrow_ledger → spatial_proof → itemized_boq → projects in a single query.
 */

export interface TimelineEvent {
    event_type: 'donated' | 'delivered' | 'verified' | 'released' | 'refunded';
    event_date: Date;
    project_id: string;
    project_title: string;
    item_id: string;
    material_name: string;
    amount: number;                 // cents
    // Proof evidence (null if not yet delivered/verified)
    proof_image_url: string | null;
    proof_gps_lat: number | null;
    proof_gps_lng: number | null;
    verified_by_name: string | null;
    verified_at: Date | null;
    // Gift metadata (ENH-4)
    gift_recipient_name: string | null;
    // Intent (ENH-5)
    donation_intent: string | null;
}

export async function getMyImpactTimeline(
    donorId: string,
    limit = 100,
): Promise<TimelineEvent[]> {
    // Single efficient query producing a UNION of 4 event types:
    //   1. 'donated'  — when escrow entry was created (locked_at)
    //   2. 'delivered' — when spatial proof was submitted (captured_at)
    //   3. 'verified' — when auditor verified the proof (verified_at)
    //   4. 'released' — when escrow was released (released_at)
    //   5. 'refunded' — when escrow was refunded (refunded_at)
    const result = await query<TimelineEvent>(
        `WITH donor_escrow AS (
            SELECT el.transaction_id, el.item_id, el.project_id,
                   el.amount_locked, el.payment_status,
                   el.locked_at, el.released_at, el.released_by,
                   el.refunded_at, el.release_proof_id,
                   el.gift_recipient_name, el.donation_intent
            FROM escrow_ledger el
            WHERE el.donor_id = $1
        ),
        -- F-4 FIX: Pick exactly ONE proof per (item_id, project_id)
        -- to prevent N×M cartesian with multiple proofs or escrow entries.
        latest_proof AS (
            SELECT DISTINCT ON (sp.item_id, sp.project_id)
                   sp.proof_id, sp.item_id, sp.project_id,
                   sp.image_url, sp.gps_coordinates,
                   sp.captured_at, sp.verified_at, sp.verified_by,
                   sp.verification_status
            FROM spatial_proof sp
            ORDER BY sp.item_id, sp.project_id, sp.captured_at DESC
        )
        -- Event 1: Donation created
        SELECT
            'donated'::TEXT AS event_type,
            de.locked_at AS event_date,
            de.project_id,
            p.title AS project_title,
            de.item_id,
            b.material_name,
            de.amount_locked AS amount,
            NULL::TEXT AS proof_image_url,
            NULL::NUMERIC AS proof_gps_lat,
            NULL::NUMERIC AS proof_gps_lng,
            NULL::TEXT AS verified_by_name,
            NULL::TIMESTAMPTZ AS verified_at,
            de.gift_recipient_name,
            de.donation_intent
        FROM donor_escrow de
        JOIN projects p ON p.project_id = de.project_id
        JOIN itemized_boq b ON b.item_id = de.item_id

        UNION ALL

        -- Event 2: Material delivered (spatial proof submitted)
        SELECT
            'delivered'::TEXT,
            lp.captured_at,
            de.project_id,
            p.title,
            de.item_id,
            b.material_name,
            de.amount_locked,
            lp.image_url,
            ST_Y(lp.gps_coordinates::GEOMETRY)::NUMERIC,
            ST_X(lp.gps_coordinates::GEOMETRY)::NUMERIC,
            NULL::TEXT,
            NULL::TIMESTAMPTZ,
            de.gift_recipient_name,
            de.donation_intent
        FROM donor_escrow de
        JOIN latest_proof lp ON lp.item_id = de.item_id AND lp.project_id = de.project_id
        JOIN projects p ON p.project_id = de.project_id
        JOIN itemized_boq b ON b.item_id = de.item_id

        UNION ALL

        -- Event 3: Proof verified by auditor
        SELECT
            'verified'::TEXT,
            lp.verified_at,
            de.project_id,
            p.title,
            de.item_id,
            b.material_name,
            de.amount_locked,
            lp.image_url,
            ST_Y(lp.gps_coordinates::GEOMETRY)::NUMERIC,
            ST_X(lp.gps_coordinates::GEOMETRY)::NUMERIC,
            auditor.full_name,
            lp.verified_at,
            de.gift_recipient_name,
            de.donation_intent
        FROM donor_escrow de
        JOIN latest_proof lp ON lp.item_id = de.item_id
            AND lp.project_id = de.project_id
            AND lp.verification_status = 'verified'
        JOIN projects p ON p.project_id = de.project_id
        JOIN itemized_boq b ON b.item_id = de.item_id
        LEFT JOIN users auditor ON auditor.user_id = lp.verified_by

        UNION ALL

        -- Event 4: Funds released
        SELECT
            'released'::TEXT,
            de.released_at,
            de.project_id,
            p.title,
            de.item_id,
            b.material_name,
            de.amount_locked,
            NULL::TEXT,
            NULL::NUMERIC,
            NULL::NUMERIC,
            releaser.full_name,
            de.released_at,
            de.gift_recipient_name,
            de.donation_intent
        FROM donor_escrow de
        JOIN projects p ON p.project_id = de.project_id
        JOIN itemized_boq b ON b.item_id = de.item_id
        LEFT JOIN users releaser ON releaser.user_id = de.released_by
        WHERE de.payment_status = 'released' AND de.released_at IS NOT NULL

        UNION ALL

        -- Event 5: Funds refunded
        SELECT
            'refunded'::TEXT,
            de.refunded_at,
            de.project_id,
            p.title,
            de.item_id,
            b.material_name,
            de.amount_locked,
            NULL::TEXT,
            NULL::NUMERIC,
            NULL::NUMERIC,
            NULL::TEXT,
            NULL::TIMESTAMPTZ,
            de.gift_recipient_name,
            de.donation_intent
        FROM donor_escrow de
        JOIN projects p ON p.project_id = de.project_id
        JOIN itemized_boq b ON b.item_id = de.item_id
        WHERE de.payment_status = 'refunded' AND de.refunded_at IS NOT NULL

        ORDER BY event_date DESC NULLS LAST
        LIMIT $2`,
        [donorId, limit],
    );
    return result.rows;
}

