// ============================================================================
// Nammerha — Project Service Unit Tests (IMP-001)
// ============================================================================
// Path 1: Homeowner → Engineer (damage report → BOQ → publish)
// Covers: createProject, assignEngineer, addBOQItem, publishProject,
//         getProjectById, getProjectsGeoJSON, getHomeownerProjects
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Database ──────────────────────────────────────────────────────────
const mockQuery = vi.fn();
const mockTransactionFn = vi.fn();

vi.mock('../../config/database', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    transaction: (fn: (client: unknown) => unknown) => mockTransactionFn(fn),
    default: { query: (...args: unknown[]) => mockQuery(...args), end: vi.fn() },
}));

import {
    createProject,
    assignEngineer,
    addBOQItem,
    publishProject,
    getProjectById,
    getProjectsGeoJSON,
    getHomeownerProjects,
} from '../project.service';

function setupTransaction() {
    const clientQuery = vi.fn();
    mockTransactionFn.mockImplementation(async (fn: (client: { query: typeof clientQuery }) => unknown) => {
        return fn({ query: clientQuery });
    });
    return clientQuery;
}

const MOCK_PROJECT = {
    project_id: 'OCDS-SYR-00001',
    homeowner_id: 'hw-1',
    assigned_engineer_id: null,
    assigned_contractor_id: null,
    title: 'Damascus House Repair',
    description: 'Structural damage from conflict',
    damage_type: 'structural',
    damage_severity: 'severe',
    status: 'draft',
    is_public: false,
    created_at: new Date(),
};

// ═════════════════════════════════════════════════════════════════════════════
describe('Project Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockReset();
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        mockTransactionFn.mockReset();
    });

    // ─── Create Project ─────────────────────────────────────────────────────
    describe('createProject', () => {
        it('should create a draft project with PostGIS coordinates', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [MOCK_PROJECT],
            });

            const project = await createProject('hw-1', {
                title: 'Damascus House Repair',
                damage_type: 'structural',
                damage_severity: 'severe',
                description: 'Structural damage from conflict',
                gps_lat: 33.5138,
                gps_lng: 36.2765,
            });

            expect(project.project_id).toBe('OCDS-SYR-00001');
            expect(project.status).toBe('draft');
            // Verify PostGIS MakePoint uses lng,lat order
            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('ST_MakePoint($6, $7)');
        });

        it('should throw when INSERT fails', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await expect(createProject('hw-1', {
                title: 'Test',
                damage_type: 'plumbing',
                gps_lat: 33.0,
                gps_lng: 36.0,
            })).rejects.toThrow('Failed to create project');
        });
    });

    // ─── Assign Engineer ────────────────────────────────────────────────────
    describe('assignEngineer', () => {
        it('should assign nearest KYC-verified engineer', async () => {
            const clientQuery = setupTransaction();

            // Project exists, status = draft
            clientQuery.mockResolvedValueOnce({
                rows: [{ ...MOCK_PROJECT, status: 'draft' }],
            });
            // Nearest engineer found
            clientQuery.mockResolvedValueOnce({
                rows: [{ user_id: 'eng-1', full_name: 'Eng. Ahmad Hassan', distance_meters: 500 }],
            });
            // UPDATE projects
            clientQuery.mockResolvedValueOnce({ rows: [] });

            const result = await assignEngineer('OCDS-SYR-00001');

            expect(result.engineer_id).toBe('eng-1');
            expect(result.engineer_name).toBe('Eng. Ahmad Hassan');
            // Verify status transition: draft → pending_assessment
            expect(clientQuery).toHaveBeenCalledWith(
                expect.stringContaining("status = 'pending_assessment'"),
                ['eng-1', 'OCDS-SYR-00001']
            );
        });

        it('should throw when project not found', async () => {
            const clientQuery = setupTransaction();
            clientQuery.mockResolvedValueOnce({ rows: [] });

            await expect(assignEngineer('nonexistent'))
                .rejects.toThrow('not found');
        });

        it('should throw when project status is not draft', async () => {
            const clientQuery = setupTransaction();
            clientQuery.mockResolvedValueOnce({
                rows: [{ ...MOCK_PROJECT, status: 'published' }],
            });

            await expect(assignEngineer('OCDS-SYR-00001'))
                .rejects.toThrow("status is 'published', expected 'draft'");
        });

        it('should throw when no verified engineer available', async () => {
            const clientQuery = setupTransaction();
            clientQuery.mockResolvedValueOnce({
                rows: [{ ...MOCK_PROJECT, status: 'draft' }],
            });
            clientQuery.mockResolvedValueOnce({ rows: [] }); // no engineers

            await expect(assignEngineer('OCDS-SYR-00001'))
                .rejects.toThrow('No verified engineers available');
        });

        it('should require KYC + guild membership in engineer query', async () => {
            const clientQuery = setupTransaction();
            clientQuery.mockResolvedValueOnce({
                rows: [{ ...MOCK_PROJECT, status: 'draft' }],
            });
            clientQuery.mockResolvedValueOnce({ rows: [] });

            try { await assignEngineer('OCDS-SYR-00001'); } catch { /* expected */ }

            const engineerSql = clientQuery.mock.calls[1]?.[0] as string;
            expect(engineerSql).toContain("kyc_verification_status = 'verified'");
            expect(engineerSql).toContain('guild_membership_id IS NOT NULL');
        });
    });

    // ─── Add BOQ Item ───────────────────────────────────────────────────────
    describe('addBOQItem', () => {
        it('should add BOQ item with oracle price and transition to assessed', async () => {
            const clientQuery = setupTransaction();

            // Project exists, assigned to this engineer, status = pending_assessment
            clientQuery.mockResolvedValueOnce({
                rows: [{ ...MOCK_PROJECT, status: 'pending_assessment', assigned_engineer_id: 'eng-1' }],
            });
            // Supplier is verified
            clientQuery.mockResolvedValueOnce({
                rows: [{ user_id: 'sup-1', full_name: 'BuildCo', kyc_verification_status: 'verified' }],
            });
            // Oracle price match
            clientQuery.mockResolvedValueOnce({
                rows: [{ current_price: 1500, recorded_at: new Date() }],
            });
            // INSERT BOQ item
            clientQuery.mockResolvedValueOnce({
                rows: [{ item_id: 'item-1', material_name: 'Cement', status: 'pending_verification' }],
            });
            // UPDATE project status → assessed
            clientQuery.mockResolvedValueOnce({ rows: [] });

            const item = await addBOQItem('OCDS-SYR-00001', 'eng-1', {
                material_name: 'Cement',
                material_category: 'structural',
                unit: 'bag',
                unit_price: 1500,
                required_quantity: 100,
                preferred_supplier_id: 'sup-1',
            });

            expect(item.item_id).toBe('item-1');
            // Verify status transition
            expect(clientQuery).toHaveBeenCalledWith(
                expect.stringContaining("SET status = 'assessed'"),
                ['OCDS-SYR-00001']
            );
        });

        it('should throw when engineer is not assigned to project', async () => {
            const clientQuery = setupTransaction();
            clientQuery.mockResolvedValueOnce({
                rows: [{ ...MOCK_PROJECT, status: 'pending_assessment', assigned_engineer_id: 'other-eng' }],
            });

            await expect(addBOQItem('OCDS-SYR-00001', 'eng-1', {
                material_name: 'Cement',
                unit: 'bag',
                unit_price: 1500,
                required_quantity: 100,
                preferred_supplier_id: 'sup-1',
            })).rejects.toThrow('not assigned');
        });

        it('should throw when supplier is not KYC-verified', async () => {
            const clientQuery = setupTransaction();
            clientQuery.mockResolvedValueOnce({
                rows: [{ ...MOCK_PROJECT, status: 'pending_assessment', assigned_engineer_id: 'eng-1' }],
            });
            clientQuery.mockResolvedValueOnce({
                rows: [{ user_id: 'sup-2', full_name: 'Unverified Co', kyc_verification_status: 'pending' }],
            });

            await expect(addBOQItem('OCDS-SYR-00001', 'eng-1', {
                material_name: 'Rebar',
                unit: 'ton',
                unit_price: 50000,
                required_quantity: 5,
                preferred_supplier_id: 'sup-2',
            })).rejects.toThrow('KYC verification');
        });

        it('should throw when supplier not found', async () => {
            const clientQuery = setupTransaction();
            clientQuery.mockResolvedValueOnce({
                rows: [{ ...MOCK_PROJECT, status: 'pending_assessment', assigned_engineer_id: 'eng-1' }],
            });
            clientQuery.mockResolvedValueOnce({ rows: [] }); // supplier not found

            await expect(addBOQItem('OCDS-SYR-00001', 'eng-1', {
                material_name: 'Glass',
                unit: 'sqm',
                unit_price: 3000,
                required_quantity: 20,
                preferred_supplier_id: 'nonexistent',
            })).rejects.toThrow('not found or is not an active supplier');
        });

        it('should reject BOQ addition when project is published', async () => {
            const clientQuery = setupTransaction();
            clientQuery.mockResolvedValueOnce({
                rows: [{ ...MOCK_PROJECT, status: 'published', assigned_engineer_id: 'eng-1' }],
            });

            await expect(addBOQItem('OCDS-SYR-00001', 'eng-1', {
                material_name: 'Cement',
                unit: 'bag',
                unit_price: 1500,
                required_quantity: 100,
                preferred_supplier_id: 'sup-1',
            })).rejects.toThrow("status is 'published'");
        });
    });

    // ─── Publish Project ────────────────────────────────────────────────────
    describe('publishProject', () => {
        it('should publish assessed project with BOQ items', async () => {
            const clientQuery = setupTransaction();

            clientQuery.mockResolvedValueOnce({
                rows: [{ ...MOCK_PROJECT, status: 'assessed', assigned_engineer_id: 'eng-1' }],
            });
            clientQuery.mockResolvedValueOnce({
                rows: [{ count: '5' }], // 5 BOQ items
            });
            clientQuery.mockResolvedValueOnce({
                rows: [{ ...MOCK_PROJECT, status: 'published', is_public: true }],
            });

            const project = await publishProject('OCDS-SYR-00001', 'eng-1');

            expect(project.status).toBe('published');
            expect(project.is_public).toBe(true);
        });

        it('should throw when project has no BOQ items', async () => {
            const clientQuery = setupTransaction();

            clientQuery.mockResolvedValueOnce({
                rows: [{ ...MOCK_PROJECT, status: 'assessed', assigned_engineer_id: 'eng-1' }],
            });
            clientQuery.mockResolvedValueOnce({
                rows: [{ count: '0' }], // zero items
            });

            await expect(publishProject('OCDS-SYR-00001', 'eng-1'))
                .rejects.toThrow('no BOQ items');
        });

        it('should throw when status is not assessed', async () => {
            const clientQuery = setupTransaction();
            clientQuery.mockResolvedValueOnce({
                rows: [{ ...MOCK_PROJECT, status: 'draft', assigned_engineer_id: 'eng-1' }],
            });

            await expect(publishProject('OCDS-SYR-00001', 'eng-1'))
                .rejects.toThrow("status is 'draft', expected 'assessed'");
        });

        it('should use FOR UPDATE row lock', async () => {
            const clientQuery = setupTransaction();
            clientQuery.mockResolvedValueOnce({ rows: [] });

            try { await publishProject('x', 'eng-1'); } catch { /* expected */ }

            const sql = clientQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('FOR UPDATE');
        });
    });

    // ─── Query: getProjectById ──────────────────────────────────────────────
    describe('getProjectById', () => {
        it('should return project when found', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [MOCK_PROJECT],
            });

            const project = await getProjectById('OCDS-SYR-00001');

            expect(project?.project_id).toBe('OCDS-SYR-00001');
        });

        it('should return null when not found', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const project = await getProjectById('nonexistent');

            expect(project).toBeNull();
        });
    });

    // ─── GeoJSON Export ─────────────────────────────────────────────────────
    describe('getProjectsGeoJSON', () => {
        it('should return FeatureCollection with Point geometries', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [
                    { project_id: 'p1', title: 'Aleppo School', latitude: 36.2, longitude: 37.15, funded_percentage: 85, status: 'published' },
                    { project_id: 'p2', title: 'Homs Clinic', latitude: 34.73, longitude: 36.72, funded_percentage: 42, status: 'published' },
                ],
            });

            const geojson = await getProjectsGeoJSON();

            expect(geojson.type).toBe('FeatureCollection');
            expect(geojson.features).toHaveLength(2);
            expect(geojson.features[0]?.geometry.type).toBe('Point');
            expect(geojson.features[0]?.geometry.coordinates).toEqual([37.15, 36.2]); // [lng, lat]
        });

        it('should only include projects with valid GPS', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await getProjectsGeoJSON();

            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('latitude IS NOT NULL AND longitude IS NOT NULL');
        });

        it('should return empty FeatureCollection for no projects', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const geojson = await getProjectsGeoJSON();

            expect(geojson.type).toBe('FeatureCollection');
            expect(geojson.features).toHaveLength(0);
        });
    });

    // ─── getHomeownerProjects ───────────────────────────────────────────────
    describe('getHomeownerProjects', () => {
        it('should return projects ordered by created_at DESC', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [MOCK_PROJECT],
            });

            const projects = await getHomeownerProjects('hw-1');

            expect(projects).toHaveLength(1);
            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('ORDER BY created_at DESC');
        });
    });
});
