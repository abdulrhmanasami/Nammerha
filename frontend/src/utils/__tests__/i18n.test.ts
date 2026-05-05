// @vitest-environment jsdom
// ============================================================================
// Nammerha — i18n Utility Tests (GAP-T1)
// ============================================================================
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { t, isRTL } from '../i18n';

describe('i18n Utility', () => {
    // Save original state
    let originalLang: string;
    let originalDir: string;

    beforeEach(() => {
        originalLang = document.documentElement.lang;
        originalDir = document.documentElement.dir;
        // Reset
        delete (window as unknown as Record<string, unknown>).NammerhaI18n;
        document.documentElement.lang = '';
        document.documentElement.dir = '';
    });

    afterEach(() => {
        document.documentElement.lang = originalLang;
        document.documentElement.dir = originalDir;
    });

    describe('t() — Translation Lookup', () => {
        it('should return fallback when i18n engine is not loaded', () => {
            expect(t('error_network', 'Network error')).toBe('Network error');
        });

        it('should return fallback when NammerhaI18n exists but t is not a function', () => {
            (window as unknown as Record<string, unknown>).NammerhaI18n = {} as never;
            expect(t('error_network', 'Network error')).toBe('Network error');
        });

        it('should call i18n engine when available', () => {
            (window as unknown as Record<string, unknown>).NammerhaI18n = {
                t: (key: string) => key === 'greeting' ? 'مرحبا' : undefined,
                switchLanguage: () => {},
                getCurrentLang: () => 'ar',
                getSupportedLangs: () => [],
            };
            expect(t('greeting', 'Hello')).toBe('مرحبا');
        });

        it('should use fallback when key is not found in dictionary', () => {
            (window as unknown as Record<string, unknown>).NammerhaI18n = {
                t: () => undefined,
                switchLanguage: () => {},
                getCurrentLang: () => 'ar',
                getSupportedLangs: () => [],
            };
            expect(t('nonexistent_key', 'Fallback Text')).toBe('Fallback Text');
        });

        it('should use fallback when i18n engine returns null', () => {
            (window as unknown as Record<string, unknown>).NammerhaI18n = {
                t: () => null,
                switchLanguage: () => {},
                getCurrentLang: () => 'ar',
                getSupportedLangs: () => [],
            };
            expect(t('key', 'Fallback')).toBe('Fallback');
        });
    });

    describe('isRTL() — Direction Detection', () => {
        it('should return false for LTR (default)', () => {
            expect(isRTL()).toBe(false);
        });

        it('should return true when dir="rtl"', () => {
            document.documentElement.dir = 'rtl';
            expect(isRTL()).toBe(true);
        });

        it('should return true when lang="ar"', () => {
            document.documentElement.lang = 'ar';
            expect(isRTL()).toBe(true);
        });

        it('should return false for non-RTL language', () => {
            document.documentElement.lang = 'en';
            expect(isRTL()).toBe(false);
        });

        it('should return false for Turkish', () => {
            document.documentElement.lang = 'tr';
            expect(isRTL()).toBe(false);
        });
    });
});
