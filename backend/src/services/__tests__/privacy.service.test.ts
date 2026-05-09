// ============================================================================
// Nammerha — Privacy Service Unit Tests (IMP-001)
// ============================================================================
// Field-level privacy filter engine with role whitelists.
// CRIT-001: Static field whitelist prevents arbitrary key injection.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../config/database', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    default: { query: (...args: unknown[]) => mockQuery(...args), end: vi.fn() },
}));

vi.mock('../../utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
    getPrivacySettings,
    updatePrivacySettings,
    applyPrivacyFilter,
    getDefaultSettingsForRole,
    getConfigurableFields,
} from '../privacy.service';

describe('Privacy Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockReset();
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    });

    // ─── applyPrivacyFilter (Pure Function — no DB) ─────────────────────────
    describe('applyPrivacyFilter', () => {
        const profile = {
            user_id: 'u1',
            company_name: 'BuildCo',
            trade_category: 'construction',
            commercial_license_url: 'https://secret.com/license.pdf',
            verification_status: 'verified',
            created_at: '2026-01-01',
            updated_at: '2026-03-01',
        };

        const contractorSettings = {
            company_name: 'public' as const,
            trade_category: 'public' as const,
            commercial_license_url: 'private' as const,
            verification_status: 'private' as const,
        };

        it('should return full profile for "self" context (owner)', () => {
            const filtered = applyPrivacyFilter(profile, contractorSettings, 'self');

            expect(filtered).toEqual(profile);
        });

        it('should show only public fields for "public" context', () => {
            const filtered = applyPrivacyFilter(profile, contractorSettings, 'public');

            expect(filtered.user_id).toBe('u1');
            expect(filtered.company_name).toBe('BuildCo');
            expect(filtered.trade_category).toBe('construction');
            expect(filtered.commercial_license_url).toBeUndefined();
            expect(filtered.verification_status).toBeUndefined();
        });

        it('should show public + project_members fields for "project_member"', () => {
            const settings = {
                company_name: 'public' as const,
                commercial_license_number: 'project_members' as const,
                commercial_license_url: 'private' as const,
            };

            const result = applyPrivacyFilter(
                { user_id: 'u1', company_name: 'Co', commercial_license_number: 'CL-123', commercial_license_url: 'url', created_at: '' },
                settings,
                'project_member'
            );

            expect(result.company_name).toBe('Co');
            expect(result.commercial_license_number).toBe('CL-123');
            expect(result.commercial_license_url).toBeUndefined();
        });

        it('should default unconfigured fields to private', () => {
            const filtered = applyPrivacyFilter(
                { user_id: 'u1', secret_field: 'hidden', created_at: '' },
                {}, // empty settings — all fields default to 'private'
                'public'
            );

            expect(filtered.user_id).toBe('u1');
            expect(filtered.secret_field).toBeUndefined();
        });

        it('should show only user_id and timestamps when no settings exist', () => {
            const filtered = applyPrivacyFilter(
                { user_id: 'u1', company_name: 'Co', trade: 'plumber', created_at: 'date', updated_at: 'date' },
                undefined,
                'public'
            );

            expect(filtered.user_id).toBe('u1');
            expect(filtered.created_at).toBe('date');
            expect(filtered.updated_at).toBe('date');
            expect(filtered.company_name).toBeUndefined();
            expect(filtered.trade).toBeUndefined();
        });

        it('should always include structural fields (user_id, timestamps)', () => {
            const filtered = applyPrivacyFilter(
                { user_id: 'u1', created_at: '2026-01-01', updated_at: '2026-03-01', secret: 'x' },
                { secret: 'private' as const },
                'public'
            );

            expect(filtered.user_id).toBe('u1');
            expect(filtered.created_at).toBe('2026-01-01');
            expect(filtered.updated_at).toBe('2026-03-01');
            expect(filtered.secret).toBeUndefined();
        });
    });

    // ─── getDefaultSettingsForRole ───────────────────────────────────────────
    describe('getDefaultSettingsForRole', () => {
        it('should return defaults for known roles', () => {
            const roles = ['contractor', 'engineer', 'supplier', 'tradesperson', 'homeowner', 'donor'];
            for (const role of roles) {
                const settings = getDefaultSettingsForRole(role);
                expect(settings).not.toBeNull();
                if (!settings) { throw new Error('Expected non-null settings'); }
                expect(Object.keys(settings).length).toBeGreaterThan(0);
            }
        });

        it('should return null for unknown role', () => {
            expect(getDefaultSettingsForRole('hacker')).toBeNull();
        });
    });

    // ─── getConfigurableFields ──────────────────────────────────────────────
    describe('getConfigurableFields', () => {
        it('should return whitelisted fields for contractor', () => {
            const fields = getConfigurableFields('contractor');
            expect(fields).toContain('company_name');
            expect(fields).toContain('trade_category');
            expect(fields).toContain('verification_status');
        });

        it('should return empty array for unknown role', () => {
            expect(getConfigurableFields('unknown')).toEqual([]);
        });

        // CRIT-001: Verify no injection vectors
        it('should NOT include dangerous field names', () => {
            const allRoles = ['contractor', 'engineer', 'supplier', 'tradesperson', 'homeowner', 'donor'];
            for (const role of allRoles) {
                const fields = getConfigurableFields(role);
                expect(fields).not.toContain('password_hash');
                expect(fields).not.toContain('__proto__');
                expect(fields).not.toContain('constructor');
                expect(fields).not.toContain('is_active');
            }
        });
    });

    // ─── getPrivacySettings ─────────────────────────────────────────────────
    describe('getPrivacySettings', () => {
        it('should return existing settings from DB', async () => {
            const existingSettings = { contractor: { company_name: 'public' } };
            mockQuery.mockResolvedValueOnce({
                rows: [{ settings: existingSettings }],
            });

            const settings = await getPrivacySettings('u1');

            expect(settings).toEqual(existingSettings);
        });

        it('should create and return defaults when no settings exist', async () => {
            // No existing settings
            mockQuery.mockResolvedValueOnce({ rows: [] });
            // User has 'engineer' role
            mockQuery.mockResolvedValueOnce({
                rows: [{ role_name: 'engineer' }],
            });
            // INSERT defaults
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const settings = await getPrivacySettings('u1');

            expect(settings.engineer).toBeDefined();
            expect(settings.engineer?.specialization).toBe('public');
        });
    });

    // ─── updatePrivacySettings ──────────────────────────────────────────────
    describe('updatePrivacySettings', () => {
        it('should reject unknown roles', async () => {
            // Return existing settings
            mockQuery.mockResolvedValueOnce({
                rows: [{ settings: {} }],
            });
            // UPSERT
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const result = await updatePrivacySettings('u1', {
                hacker_role: { inject_field: 'public' },
            });

            // Unknown role should be silently ignored
            expect(result.hacker_role).toBeUndefined();
        });

        it('should reject fields not in role whitelist', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{ settings: {} }],
            });
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const result = await updatePrivacySettings('u1', {
                contractor: {
                    company_name: 'public',
                    password_hash: 'public',    // NOT in whitelist
                },
            });

            expect(result.contractor?.company_name).toBe('public');
            expect((result.contractor as Record<string, unknown>)?.password_hash).toBeUndefined();
        });

        it('should reject invalid visibility values', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{ settings: {} }],
            });
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const result = await updatePrivacySettings('u1', {
                contractor: {
                    company_name: 'hacked' as never,
                },
            });

            expect(result.contractor?.company_name).toBeUndefined();
        });
    });
});
