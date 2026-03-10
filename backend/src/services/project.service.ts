// ============================================================================
// Nammerha Backend — Project Service (Path 1: Homeowner → Engineer)
// ============================================================================
// Handles the complete flow from damage report creation to BOQ publication:
//   1. Homeowner creates damage report (draft)
//   2. System assigns verified engineer (pending_assessment)
//   3. Engineer uploads BOQ items (assessed)
//   4. Engineer publishes project to marketplace (published)
// ============================================================================
import { query, transaction } from '../config/database';
import type {
    Project,
    ItemizedBOQ,
    CreateProjectDTO,
    AddBOQItemDTO,
} from '../types';

// ─── Path 1.1: Create Damage Report ─────────────────────────────────────────

/**
 * Creates a new project from a homeowner's damage report.
 * Generates an OCDS-compliant project ID (OCDS-SYR-NNNNN).
 * Initial status: 'draft'.
 */
export async function createProject(
    homeownerId: string,
    dto: CreateProjectDTO
): Promise<Project> {
    const result = await query<Project>(
        `INSERT INTO projects (
      project_id, homeowner_id, title, description, damage_type, damage_severity,
      gps_location, address_text, cover_image_url, status
    ) VALUES (
      generate_ocds_project_id(), $1, $2, $3, $4, $5,
      ST_SetSRID(ST_MakePoint($6, $7), 4326)::GEOGRAPHY, $8, $9, 'draft'
    ) RETURNING *`,
        [
            homeownerId,
            dto.title,
            dto.description ?? null,
            dto.damage_type,
            dto.damage_severity ?? null,
            dto.gps_lng,   // PostGIS: longitude first (X)
            dto.gps_lat,   // PostGIS: latitude second (Y)
            dto.address_text ?? null,
            dto.cover_image_url ?? null,
        ]
    );

    const project = result.rows[0];
    if (!project) {
        throw new Error('Failed to create project');
    }
    return project;
}

// ─── Path 1.2: Assign Engineer ──────────────────────────────────────────────

/**
 * Auto-assigns the nearest KYC-verified engineer to a project.
 * Uses PostGIS ST_Distance to find engineers within a reasonable range.
 * Changes project status: draft → pending_assessment.
 *
 * Social Underwriting: The system selects the engineer, not the homeowner.
 */
export async function assignEngineer(
    projectId: string
): Promise<{ engineer_id: string; engineer_name: string }> {
    return transaction(async (client) => {
        // 1. Get project to verify status and location
        const projectResult = await client.query<Project>(
            'SELECT * FROM projects WHERE project_id = $1 FOR UPDATE',
            [projectId]
        );
        const project = projectResult.rows[0];
        if (!project) throw new Error(`Project ${projectId} not found`);
        if (project.status !== 'draft') {
            throw new Error(`Cannot assign engineer: project status is '${project.status}', expected 'draft'`);
        }

        // 2. Find nearest KYC-verified engineer with guild membership
        const engineerResult = await client.query<{
            user_id: string;
            full_name: string;
            distance_meters: number;
        }>(
            `SELECT u.user_id, u.full_name,
              ST_Distance(u.gps_last_known, p.gps_location) AS distance_meters
       FROM users u, projects p
       WHERE p.project_id = $1
         AND u.role = 'engineer'
         AND u.is_active = TRUE
         AND u.kyc_verification_status = 'verified'
         AND u.guild_membership_id IS NOT NULL
         AND u.gps_last_known IS NOT NULL
       ORDER BY ST_Distance(u.gps_last_known, p.gps_location) ASC
       LIMIT 1`,
            [projectId]
        );

        const engineer = engineerResult.rows[0];
        if (!engineer) {
            throw new Error('No verified engineers available. All engineers must have KYC verification and guild membership.');
        }

        // 3. Assign and transition status
        await client.query(
            `UPDATE projects
       SET assigned_engineer_id = $1, status = 'pending_assessment'
       WHERE project_id = $2`,
            [engineer.user_id, projectId]
        );

        return {
            engineer_id: engineer.user_id,
            engineer_name: engineer.full_name,
        };
    });
}

// ─── Path 1.3: Add BOQ Item ─────────────────────────────────────────────────

/**
 * Engineer adds an itemized BOQ (Bill of Quantities) item to a project.
 * Validates engineer is assigned to the project.
 * Validates preferred supplier is KYC-verified and active.
 * Auto-fetches oracle reference price if available.
 */
export async function addBOQItem(
    projectId: string,
    engineerId: string,
    dto: AddBOQItemDTO
): Promise<ItemizedBOQ> {
    return transaction(async (client) => {
        // 1. Verify engineer assignment
        const projectResult = await client.query<Project>(
            'SELECT * FROM projects WHERE project_id = $1',
            [projectId]
        );
        const project = projectResult.rows[0];
        if (!project) { throw new Error(`Project ${projectId} not found`); }
        if (project.assigned_engineer_id !== engineerId) {
            throw new Error('You are not assigned to this project');
        }
        if (!['pending_assessment', 'assessed'].includes(project.status)) {
            throw new Error(`Cannot add BOQ items: project status is '${project.status}'`);
        }

        // 2. Validate preferred supplier (per strategic study §7.2)
        // Supplier must be KYC-verified, active, and have role='supplier'
        const supplierResult = await client.query<{
            user_id: string;
            full_name: string;
            kyc_verification_status: string;
        }>(
            `SELECT user_id, full_name, kyc_verification_status
             FROM users
             WHERE user_id = $1
               AND role = 'supplier'
               AND is_active = TRUE`,
            [dto.preferred_supplier_id]
        );
        const supplier = supplierResult.rows[0];
        if (!supplier) {
            throw new Error('Preferred supplier not found or is not an active supplier');
        }
        if (supplier.kyc_verification_status !== 'verified') {
            throw new Error(`Supplier "${supplier.full_name}" has not passed KYC verification`);
        }

        // 3. Fetch oracle reference price (best match)
        const oracleResult = await client.query<{
            current_price: number;
            recorded_at: Date;
        }>(
            `SELECT current_price, recorded_at
       FROM pricing_oracle_entries
       WHERE material_category = $1
       ORDER BY recorded_at DESC
       LIMIT 1`,
            [dto.material_category ?? null]
        );
        const oracle = oracleResult.rows[0];

        // 4. Insert BOQ item with pre-assigned supplier
        const boqResult = await client.query<ItemizedBOQ>(
            `INSERT INTO itemized_boq (
        project_id, material_name, material_category, description, unit,
        unit_price, required_quantity, image_url, oracle_reference_price,
        oracle_price_date, preferred_supplier_id, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending_verification', $12)
      RETURNING *`,
            [
                projectId,
                dto.material_name,
                dto.material_category ?? null,
                dto.description ?? null,
                dto.unit,
                dto.unit_price,
                dto.required_quantity,
                dto.image_url ?? null,
                oracle?.current_price ?? null,
                oracle?.recorded_at ?? null,
                dto.preferred_supplier_id,
                engineerId,
            ]
        );

        // 5. Update project status to 'assessed' if still 'pending_assessment'
        if (project.status === 'pending_assessment') {
            await client.query(
                "UPDATE projects SET status = 'assessed' WHERE project_id = $1",
                [projectId]
            );
        }

        const item = boqResult.rows[0];
        if (!item) { throw new Error('Failed to create BOQ item'); }
        return item;
    });
}

// ─── Path 1.4: Publish Project ──────────────────────────────────────────────

/**
 * Engineer publishes the project to the marketplace.
 * Changes status: assessed → published.
 * Requires at least 1 BOQ item to exist.
 */
export async function publishProject(
    projectId: string,
    engineerId: string
): Promise<Project> {
    return transaction(async (client) => {
        // 1. Verify project and engineer
        const projectResult = await client.query<Project>(
            'SELECT * FROM projects WHERE project_id = $1 FOR UPDATE',
            [projectId]
        );
        const project = projectResult.rows[0];
        if (!project) throw new Error(`Project ${projectId} not found`);
        if (project.assigned_engineer_id !== engineerId) {
            throw new Error('You are not assigned to this project');
        }
        if (project.status !== 'assessed') {
            throw new Error(`Cannot publish: project status is '${project.status}', expected 'assessed'`);
        }

        // 2. Verify BOQ items exist
        const boqCount = await client.query<{ count: string }>(
            'SELECT COUNT(*) AS count FROM itemized_boq WHERE project_id = $1',
            [projectId]
        );
        if (parseInt(boqCount.rows[0]?.count ?? '0', 10) === 0) {
            throw new Error('Cannot publish: project has no BOQ items');
        }

        // 3. Publish
        const updated = await client.query<Project>(
            `UPDATE projects
       SET status = 'published', published_at = NOW(), is_public = TRUE
       WHERE project_id = $1
       RETURNING *`,
            [projectId]
        );

        const result = updated.rows[0];
        if (!result) throw new Error('Failed to publish project');
        return result;
    });
}

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Get a single project by ID.
 */
export async function getProjectById(projectId: string): Promise<Project | null> {
    const result = await query<Project>(
        'SELECT * FROM projects WHERE project_id = $1',
        [projectId]
    );
    return result.rows[0] ?? null;
}

// ─── GeoJSON Export (Map Layer) ─────────────────────────────────────────────

interface ProjectCardRow {
    project_id: string;
    title: string;
    status: string;
    damage_type: string;
    funded_percentage: number;
    cover_image_url: string | null;
    homeowner_name: string;
    total_estimated_cost: number;
    total_funded_amount: number;
    address_text: string | null;
    latitude: number | null;
    longitude: number | null;
}

/**
 * Get all public projects as a GeoJSON FeatureCollection.
 * Used by the interactive MapLibre map on the homepage.
 *
 * Queries vw_project_cards (which extracts lat/lng via ST_Y/ST_X from PostGIS GEOGRAPHY).
 * Only includes projects that have valid GPS coordinates.
 */
export async function getProjectsGeoJSON(): Promise<GeoJSON.FeatureCollection> {
    const result = await query<ProjectCardRow>(
        `SELECT project_id, title, status, damage_type,
                funded_percentage, cover_image_url, homeowner_name,
                total_estimated_cost, total_funded_amount, address_text,
                latitude, longitude
         FROM vw_project_cards
         WHERE latitude IS NOT NULL AND longitude IS NOT NULL
         ORDER BY published_at DESC NULLS LAST`
    );

    const features: GeoJSON.Feature[] = result.rows.map((row) => ({
        type: 'Feature' as const,
        geometry: {
            type: 'Point' as const,
            coordinates: [Number(row.longitude ?? 0), Number(row.latitude ?? 0)],
        },
        properties: {
            project_id: row.project_id,
            title: row.title,
            status: row.status,
            damage_type: row.damage_type,
            funded_percentage: Number(row.funded_percentage),
            cover_image_url: row.cover_image_url,
            homeowner_name: row.homeowner_name,
            total_estimated_cost: row.total_estimated_cost,
            total_funded_amount: row.total_funded_amount,
            address_text: row.address_text,
        },
    }));

    return {
        type: 'FeatureCollection',
        features,
    };
}

/**
 * Get all projects for a homeowner.
 */
export async function getHomeownerProjects(homeownerId: string): Promise<Project[]> {
    const result = await query<Project>(
        'SELECT * FROM projects WHERE homeowner_id = $1 ORDER BY created_at DESC',
        [homeownerId]
    );
    return result.rows;
}
