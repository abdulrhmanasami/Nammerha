// ============================================================================
// Nammerha Frontend — XSS escapeHtml() Unit Tests
// TEST-GAP FIX: First frontend test file. Covers the critical XSS protection
// utility used by every innerHTML template on the platform.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../xss';

describe('escapeHtml()', () => {
    // ─── Core Character Escaping ────────────────────────────────────────────
    it('escapes ampersand', () => {
        expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('escapes less-than', () => {
        expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('escapes greater-than', () => {
        expect(escapeHtml('a > b')).toBe('a &gt; b');
    });

    it('escapes double quotes', () => {
        expect(escapeHtml('data-attr="xss"')).toBe('data-attr=&quot;xss&quot;');
    });

    it('escapes single quotes', () => {
        expect(escapeHtml("onclick='alert(1)'")).toBe("onclick=&#39;alert(1)&#39;");
    });

    it('escapes all dangerous characters in one string', () => {
        expect(escapeHtml('<img src="x" onerror=\'alert(&1)\'>')).toBe(
            '&lt;img src=&quot;x&quot; onerror=&#39;alert(&amp;1)&#39;&gt;'
        );
    });

    // ─── Edge Cases ─────────────────────────────────────────────────────────
    it('returns empty string for null', () => {
        expect(escapeHtml(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
        expect(escapeHtml(undefined)).toBe('');
    });

    it('converts numbers to string', () => {
        expect(escapeHtml(42)).toBe('42');
    });

    it('converts zero to string', () => {
        expect(escapeHtml(0)).toBe('0');
    });

    it('passes through safe strings unchanged', () => {
        expect(escapeHtml('Hello World')).toBe('Hello World');
    });

    it('handles empty string', () => {
        expect(escapeHtml('')).toBe('');
    });

    // ─── Arabic Content (Nammerha-specific) ─────────────────────────────────
    it('passes through Arabic text unchanged', () => {
        expect(escapeHtml('مشروع إعادة الإعمار')).toBe('مشروع إعادة الإعمار');
    });

    it('escapes injected markup mixed with Arabic', () => {
        expect(escapeHtml('مشروع <script>xss</script>')).toBe(
            'مشروع &lt;script&gt;xss&lt;/script&gt;'
        );
    });

    // ─── Adversarial Payloads ───────────────────────────────────────────────
    it('neutralizes a classic XSS vector', () => {
        const payload = '"><svg onload=alert(document.domain)>';
        const escaped = escapeHtml(payload);
        expect(escaped).not.toContain('<');
        expect(escaped).not.toContain('>');
        expect(escaped).not.toContain('"');
    });

    it('handles deeply nested escape sequences', () => {
        expect(escapeHtml('&amp;lt;')).toBe('&amp;amp;lt;');
    });
});
