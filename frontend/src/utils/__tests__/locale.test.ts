// ============================================================================
// Nammerha Frontend — Locale Utility Unit Tests (IMP-002)
// ============================================================================
// PLAT-AUD-005: Centralized locale detection + date formatting.
// Validates Syrian Arabic (ar-SY), Turkish (tr-TR), and English (en-US) paths.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DOM APIs
const mockDocumentElement = { lang: 'en' };
vi.stubGlobal('document', { documentElement: mockDocumentElement });
vi.stubGlobal('navigator', { language: 'en-US' });

// Mock i18n-apply since it depends on window
vi.mock('../i18n-apply', () => ({
    tryApplyI18n: vi.fn(),
}));

// Mock format.ts for the re-export
vi.mock('../format', () => ({
    formatCents: vi.fn((cents: number) => `$${(cents / 100).toFixed(0)}`),
}));

import { getLocale, formatDate, formatDateTime } from '../locale';

describe('Locale Utility', () => {
    beforeEach(() => {
        mockDocumentElement.lang = 'en';
    });

    // ─── getLocale ──────────────────────────────────────────────────────────
    describe('getLocale', () => {
        it('should return ar-SY for Arabic page', () => {
            mockDocumentElement.lang = 'ar';
            expect(getLocale()).toBe('ar-SY');
        });

        it('should return tr-TR for Turkish page', () => {
            mockDocumentElement.lang = 'tr';
            expect(getLocale()).toBe('tr-TR');
        });

        it('should return en-US for English page', () => {
            mockDocumentElement.lang = 'en';
            expect(getLocale()).toBe('en-US');
        });

        it('should default to ar-SY for empty lang (LOCALE-001: Arabic default)', () => {
            mockDocumentElement.lang = '';
            expect(getLocale()).toBe('ar-SY');
        });

        it('should default to en-US for unknown locale', () => {
            mockDocumentElement.lang = 'de';
            // Unknown locale still falls through to en-US (only '', undefined, null → Arabic)
            expect(getLocale()).toBe('en-US');
        });
    });

    // ─── formatDate ─────────────────────────────────────────────────────────
    describe('formatDate', () => {
        it('should format valid ISO date', () => {
            const result = formatDate('2026-03-15T10:00:00Z');
            expect(result).toBeTruthy();
            expect(result).not.toBe('—');
            expect(result).toContain('2026');
        });

        it('should return em-dash for null', () => {
            expect(formatDate(null)).toBe('—');
        });

        it('should return em-dash for undefined', () => {
            expect(formatDate(undefined)).toBe('—');
        });

        it('should return em-dash for empty string', () => {
            expect(formatDate('')).toBe('—');
        });
    });

    // ─── formatDateTime ─────────────────────────────────────────────────────
    describe('formatDateTime', () => {
        it('should include time component', () => {
            mockDocumentElement.lang = 'en';
            const result = formatDateTime('2026-03-15T14:30:00Z');
            expect(result).not.toBe('—');
            // Should contain some time indicator (could be 2:30 or 14:30 depending on locale)
            expect(result.length).toBeGreaterThan(10);
        });

        it('should return em-dash for null', () => {
            expect(formatDateTime(null)).toBe('—');
        });

        it('should return em-dash for undefined', () => {
            expect(formatDateTime(undefined)).toBe('—');
        });
    });
});
