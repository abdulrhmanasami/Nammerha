// @vitest-environment jsdom
// ============================================================================
// Nammerha — Password Strength Utility Tests (GAP-T1)
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock i18n — returns English equivalents for test assertion readability
vi.mock('../i18n', () => ({
    t: (key: string, fallback: string) => {
        const dictionary: Record<string, string> = {
            pw_strength_very_weak: 'Too short',
            pw_strength_weak: 'Weak',
            pw_strength_fair: 'Fair',
            pw_strength_good: 'Good',
            pw_strength_strong: 'Strong',
            pw_strength_too_short: 'Too short',
            pw_requirements: '8+ chars, 1 uppercase, 1 number, 1 special',
        };
        return dictionary[key] ?? fallback;
    },
}));

import { updatePasswordStrength } from '../password-strength';

// ─── Test Helpers ───────────────────────────────────────────────────────────

function createMockBars(count = 4): HTMLCollection {
    const container = document.createElement('div');
    for (let i = 0; i < count; i++) {
        const bar = document.createElement('div');
        bar.className = 'h-2 flex-1 rounded-full bg-slate-200';
        container.appendChild(bar);
    }
    return container.children;
}

function createMockLabel(): HTMLElement {
    return document.createElement('span');
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Password Strength', () => {
    let bars: HTMLCollection;
    let label: HTMLElement;

    beforeEach(() => {
        bars = createMockBars();
        label = createMockLabel();
    });

    describe('Scoring Logic', () => {
        it('should return 0 for empty password', () => {
            expect(updatePasswordStrength('', bars, label)).toBe(0);
        });

        it('should score 1 for short lowercase-only password', () => {
            expect(updatePasswordStrength('abc', bars, label)).toBe(1);
        });

        it('should score 1 for short uppercase-only password', () => {
            expect(updatePasswordStrength('ABC', bars, label)).toBe(1);
        });

        it('should score 1 for short digit-only password', () => {
            expect(updatePasswordStrength('123', bars, label)).toBe(1);
        });

        it('should score 1 for short special-only password', () => {
            expect(updatePasswordStrength('!!!', bars, label)).toBe(1);
        });

        it('should score 2 for short password with uppercase and lowercase', () => {
            expect(updatePasswordStrength('Abc', bars, label)).toBe(2);
        });

        it('should score 3 for short password with uppercase, lowercase, and digit', () => {
            expect(updatePasswordStrength('Abc1', bars, label)).toBe(3);
        });

        it('should score 4 for short password with uppercase, lowercase, digit, and special', () => {
            expect(updatePasswordStrength('Abc1!', bars, label)).toBe(4);
        });

        it('should score 5 (max) for 8+ chars with uppercase, lowercase, digit, and special', () => {
            expect(updatePasswordStrength('Abcdef1!', bars, label)).toBe(5);
        });

        it('should handle Arabic characters in password', () => {
            // Arabic characters are not matched by ASCII uppercase, lowercase or digits.
            // They match the special characters class [^A-Za-z0-9] and length >= 8.
            const score = updatePasswordStrength('كلمة_مرور_طويلة', bars, label);
            // 8+ chars = +1, special = +1 -> 2
            expect(score).toBe(2);
        });
    });

    describe('Label Updates', () => {
        it('should show "Too short" for score 1 with non-empty password', () => {
            updatePasswordStrength('abc', bars, label);
            expect(label.textContent).toBe('Too short');
        });

        it('should show "Weak" for score 2', () => {
            updatePasswordStrength('abcdefgh', bars, label);
            expect(label.textContent).toBe('Weak');
        });

        it('should show "Fair" for score 3', () => {
            updatePasswordStrength('Abcdefgh', bars, label);
            expect(label.textContent).toBe('Fair');
        });

        it('should show "Good" for score 4', () => {
            updatePasswordStrength('Abcdefg1', bars, label);
            expect(label.textContent).toBe('Good');
        });

        it('should show "Strong" for score 5', () => {
            updatePasswordStrength('Abcdef1!', bars, label);
            expect(label.textContent).toBe('Strong');
        });

        it('should show requirements text for empty password', () => {
            updatePasswordStrength('', bars, label);
            expect(label.textContent).toBe('8+ chars, 1 uppercase, 1 number, 1 special');
        });

        it('should set data-i18n attribute for localization', () => {
            updatePasswordStrength('Abcdef1!', bars, label);
            expect(label.getAttribute('data-i18n')).toBe('pw_strength_strong');
        });
    });

    describe('Bar Styling', () => {
        it('should color 1 bar red for score 2', () => {
            updatePasswordStrength('abcdefgh', bars, label);
            expect((bars[0] as HTMLElement).className).toContain('bg-red-400');
            expect((bars[1] as HTMLElement).className).toContain('bg-slate-200');
        });

        it('should color 4 bars green for score 5', () => {
            updatePasswordStrength('Abcdef1!', bars, label);
            for (let i = 0; i < 4; i++) {
                expect((bars[i] as HTMLElement).className).toContain('bg-emerald-400');
            }
        });
    });

    describe('Edge Cases', () => {
        it('should work with null bars', () => {
            const score = updatePasswordStrength('Abcdef1!', undefined, label);
            expect(score).toBe(5);
        });

        it('should work with null label', () => {
            const score = updatePasswordStrength('Abcdef1!', bars, null);
            expect(score).toBe(5);
        });

        it('should work with both null', () => {
            const score = updatePasswordStrength('Abcdef1!', undefined, null);
            expect(score).toBe(5);
        });
    });
});
