// ============================================================================
// Nammerha Backend — Execution Service (Path 3: PO → Spatial Proof)
// ============================================================================
// Handles the proof-of-work flow:
//   1. Purchase Order is auto-generated (from Path 2)
//   2. Supplier delivers materials to site
//   3. Engineer captures GPS-stamped photo proof
//   4. System validates GPS proximity to project location
// ============================================================================
import crypto from 'crypto';
import { query, transaction } from '../config/database';
import type { SpatialProof, PurchaseOrder, SubmitSpatialProofDTO } from '../types';
import { logger } from '../utils/logger';

// GPS proximity threshold (meters) — configurable via env
const GPS_THRESHOLD = parseInt(
    process.env['GPS_PROXIMITY_THRESHOLD_METERS'] ?? '100',
    10
);

const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';

// ─── P1-AUT-001 FIX: SSRF Protection ───────────────────────────────────────
// Prevents Server-Side Request Forgery by validating image URLs before fetching.
// Blocks private/internal IPs, Docker service hostnames, and non-HTTPS in production.

const BLOCKED_HOSTNAMES = new Set([
    'localhost', 'nammerha-db', 'nammerha-minio', 'nammerha-backend',
    'nammerha-frontend', 'host.docker.internal', 'metadata.google.internal',
]);

/**
 * Validates that a URL points to an external, public resource.
 * Rejects private IP ranges, internal hostnames, and non-HTTPS in production.
 * @throws {Error} if URL is unsafe
 */
function validateExternalUrl(urlStr: string): void {
    let parsed: URL;
    try {
        parsed = new URL(urlStr);
    } catch {
        throw new Error('Invalid image URL format');
    }

    // Scheme check: only http/https allowed, require https in production
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Image URL must use HTTP or HTTPS protocol');
    }
    if (IS_PRODUCTION && parsed.protocol !== 'https:') {
        throw new Error('Image URL must use HTTPS in production');
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block known internal Docker hostnames
    if (BLOCKED_HOSTNAMES.has(hostname)) {
        throw new Error('Image URL points to an internal service — access denied');
    }

    // Block private/reserved IPv4 ranges
    // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16, 0.0.0.0
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
        const [, a, b] = ipv4Match.map(Number) as [number, number, number, number, number];
        if (
            a === 10 ||
            a === 127 ||
            a === 0 ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 169 && b === 254)
        ) {
            throw new Error('Image URL points to a private/reserved IP range — access denied');
        }
    }

    // Block IPv6 loopback and link-local
    if (hostname === '::1' || hostname.startsWith('fe80') || hostname === '[::1]') {
        throw new Error('Image URL points to a private IPv6 address — access denied');
    }
}

// ─── Path 3.1: Submit Spatial Proof ─────────────────────────────────────────

/**
 * Engineer submits a GPS-stamped photo proof of material delivery.
 *
 * Validations:
 *   1. Engineer is assigned to the project
 *   2. GPS coordinates are within GPS_THRESHOLD meters of project location
 *   3. Image hash (SHA-256) computed for tamper detection
 *
 * Creates spatial_proof entry with verification_status='submitted'.
 */
export async function submitSpatialProof(
    engineerId: string,
    dto: SubmitSpatialProofDTO
): Promise<SpatialProof> {
    return transaction(async (client) => {
        // 1. Verify engineer assignment
        const projectResult = await client.query<{
            project_id: string;
            assigned_engineer_id: string | null;
            gps_location: string | null;
        }>(
            'SELECT project_id, assigned_engineer_id, gps_location FROM projects WHERE project_id = $1',
            [dto.project_id]
        );
        const project = projectResult.rows[0];
        if (!project) { throw new Error(`Project ${dto.project_id} not found`); }
        if (project.assigned_engineer_id !== engineerId) {
            throw new Error('You are not assigned to this project');
        }

        // 2. Validate GPS proximity (engineer proof GPS vs project GPS)
        if (project.gps_location) {
            const distanceResult = await client.query<{ distance_meters: number }>(
                `SELECT ST_Distance(
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::GEOGRAPHY,
          gps_location
        ) AS distance_meters
        FROM projects WHERE project_id = $3`,
                [dto.gps_lng, dto.gps_lat, dto.project_id]
            );
            const distance = distanceResult.rows[0]?.distance_meters;
            if (distance !== undefined && distance > GPS_THRESHOLD) {
                throw new Error(
                    `GPS validation failed: proof location is ${Math.round(distance)}m from project site (threshold: ${GPS_THRESHOLD}m). ` +
                    `This may indicate fraud. Contact admin if you believe this is an error.`
                );
            }
        }

        // 3. Verify BOQ item exists and belongs to project
        const boqResult = await client.query<{ item_id: string }>(
            'SELECT item_id FROM itemized_boq WHERE item_id = $1 AND project_id = $2',
            [dto.item_id, dto.project_id]
        );
        if (!boqResult.rows[0]) {
            throw new Error(`BOQ item ${dto.item_id} not found in project ${dto.project_id}`);
        }

        // 4. Compute image hash (SHA-256) for tamper detection
        // P2-003 FIX: Download actual image binary and hash the raw bytes.
        // P1-AUT-001 FIX: Validate URL against SSRF before fetching.
        let imageHash: string;
        try {
            validateExternalUrl(dto.image_url);

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15_000); // 15s timeout
            const imageResponse = await fetch(dto.image_url, {
                signal: controller.signal,
                headers: { 'Accept': 'image/*' },
            });
            clearTimeout(timeout);

            if (!imageResponse.ok) {
                throw new Error(`Image download failed: HTTP ${imageResponse.status}`);
            }

            const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
            imageHash = crypto
                .createHash('sha256')
                .update(imageBuffer)
                .digest('hex');
        } catch (hashErr) {
            // NMR-AUD-202 FIX: Fail-secure — do NOT fall back to URL hashing.
            // A URL-hash fallback allows tampered images at the same URL to pass
            // verification silently, defeating the purpose of integrity checking.
            // On a financial accountability platform, security > availability.
            const reason = hashErr instanceof Error ? hashErr.message : 'Unknown error';
            logger.error('Image integrity check failed', { imageUrl: dto.image_url, reason });
            throw new Error(
                'Image verification failed: unable to download the image for SHA-256 integrity check. ' +
                'Please ensure the image is uploaded to storage and accessible, then re-submit the proof.'
            );
        }

        // 5. Create spatial proof
        const proofResult = await client.query<SpatialProof>(
            `INSERT INTO spatial_proof (
        item_id, project_id, engineer_id, gps_coordinates, gps_accuracy_meters,
        captured_at, image_url, image_hash, description, device_info, verification_status
      ) VALUES (
        $1, $2, $3,
        ST_SetSRID(ST_MakePoint($4, $5), 4326)::GEOGRAPHY,
        $6, NOW(), $7, $8, $9, $10, 'submitted'
      ) RETURNING *`,
            [
                dto.item_id,
                dto.project_id,
                engineerId,
                dto.gps_lng,
                dto.gps_lat,
                dto.gps_accuracy_meters ?? null,
                dto.image_url,
                imageHash,
                dto.description ?? null,
                dto.device_info ? JSON.stringify(dto.device_info) : null,
            ]
        );

        const proof = proofResult.rows[0];
        if (!proof) { throw new Error('Failed to create spatial proof'); }
        return proof;
    });
}

// ─── Purchase Order Queries ─────────────────────────────────────────────────

/**
 * Get all purchase orders for a project.
 */
export async function getProjectPurchaseOrders(
    projectId: string
): Promise<PurchaseOrder[]> {
    const result = await query<PurchaseOrder>(
        'SELECT * FROM purchase_orders WHERE project_id = $1 ORDER BY generated_at DESC',
        [projectId]
    );
    return result.rows;
}

/**
 * Get a single purchase order by PO number.
 */
export async function getPurchaseOrderByNumber(
    poNumber: string
): Promise<PurchaseOrder | null> {
    const result = await query<PurchaseOrder>(
        'SELECT * FROM purchase_orders WHERE po_number = $1',
        [poNumber]
    );
    return result.rows[0] ?? null;
}

/**
 * Update purchase order status (supplier workflow).
 */
export async function updatePOStatus(
    poId: string,
    newStatus: 'sent_to_supplier' | 'acknowledged' | 'shipped' | 'delivered',
    actorId: string
): Promise<PurchaseOrder> {
    const validFields: Record<string, string> = {
        sent_to_supplier: 'sent_at',
        acknowledged: 'acknowledged_at',
        shipped: 'shipped_at',
        delivered: 'delivered_at',
    };

    // Validate status is a known value before using as SQL column name
    if (!(newStatus in validFields)) { throw new Error(`Invalid PO status: ${newStatus}`); }
    const field = validFields[newStatus];

    const result = await query<PurchaseOrder>(
        `UPDATE purchase_orders SET status = $1, ${field} = NOW() WHERE po_id = $2 RETURNING *`,
        [newStatus, poId]
    );

    const po = result.rows[0];
    if (!po) { throw new Error(`Purchase order ${poId} not found`); }

    // P3-002 FIX: Log the actor who changed the PO status for audit trail
    // P0-002 FIX: Column name is `new_values` (JSONB), not `details` — matches 001_core_schema.sql
    await query(
        `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
         VALUES ($1, 'purchase_order', $2, $3, $4)`,
        [`po_status_${newStatus}`, poId, actorId, JSON.stringify({
            new_status: newStatus,
            po_number: po.po_number,
            project_id: po.project_id,
        })]
    );

    return po;
}
