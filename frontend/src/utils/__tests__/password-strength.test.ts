// @vitest-environment jsdom
// ============================================================================
// Nammerha — Password Strength Utility Tests (GAP-T1)
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock i18n — returns fallback text
vi.mock('../i18n', () => ({
    t: (_key: string, fallback: string) => fallback,
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

        it('should return 0 for short password without any criteria', () => {
            expect(updatePasswordStrength('abc', bars, label)).toBe(0);
        });

        it('should score +1 for >= 8 characters', () => {
            expect(updatePasswordStrength('abcdefgh', bars, label)).toBe(1);
        });

        it('should score +1 for uppercase letter', () => {
            expect(updatePasswordStrength('Abc', bars, label)).toBe(1);
        });

        it('should score +1 for digit', () => {
            expect(updatePasswordStrength('abc1', bars, label)).toBe(1);
        });

        it('should score +1 for special character', () => {
            expect(updatePasswordStrength('abc!', bars, label)).toBe(1);
        });

        it('should score 2 for 8+ chars with uppercase', () => {
            expect(updatePasswordStrength('Abcdefgh', bars, label)).toBe(2);
        });

        it('should score 3 for 8+ chars with uppercase and digit', () => {
            expect(updatePasswordStrength('Abcdefg1', bars, label)).toBe(3);
        });

        it('should score 4 (max) for 8+ chars with uppercase, digit, and special', () => {
            expect(updatePasswordStrength('Abcdef1!', bars, label)).toBe(4);
        });

        it('should handle Arabic characters in password', () => {
            // Arabic characters are not uppercase or digits, but they are 8+ chars
            const score = updatePasswordStrength('كلمة_مرور_طويلة', bars, label);
            // 8+ chars = +1, special char (_) = +1 = 2
            expect(score).toBe(2);
        });
    });

    describe('Label Updates', () => {
        it('should show "Too short" for score 0 with non-empty password', () => {
            updatePasswordStrength('abc', bars, label);
            expect(label.textContent).toBe('Too short');
        });

        it('should show "Weak" for score 1', () => {
            updatePasswordStrength('abcdefgh', bars, label);
            expect(label.textContent).toBe('Weak');
        });

        it('should show "Fair" for score 2', () => {
            updatePasswordStrength('Abcdefgh', bars, label);
            expect(label.textContent).toBe('Fair');
        });

        it('should show "Good" for score 3', () => {
            updatePasswordStrength('Abcdefg1', bars, label);
            expect(label.textContent).toBe('Good');
        });

        it('should show "Strong" for score 4', () => {
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
        it('should color 1 bar red for score 1', () => {
            updatePasswordStrength('abcdefgh', bars, label);
            expect((bars[0] as HTMLElement).className).toContain('bg-red-400');
            expect((bars[1] as HTMLElement).className).toContain('bg-slate-200');
        });

        it('should color 4 bars green for score 4', () => {
            updatePasswordStrength('Abcdef1!', bars, label);
            for (let i = 0; i < 4; i++) {
                expect((bars[i] as HTMLElement).className).toContain('bg-emerald-400');
            }
        });
    });

    describe('Edge Cases', () => {
        it('should work with null bars', () => {
            const score = updatePasswordStrength('Abcdef1!', undefined, label);
            expect(score).toBe(4);
        });

        it('should work with null label', () => {
            const score = updatePasswordStrength('Abcdef1!', bars, null);
            expect(score).toBe(4);
        });

        it('should work with both null', () => {
            const score = updatePasswordStrength('Abcdef1!', undefined, null);
            expect(score).toBe(4);
        });
    });
});
