// ============================================================================
// Nammerha — Role Metadata (Pure Data Module)
// UNIFIED CITIZEN: Extracted from role-switcher.ts (2026-05-10).
// Contains only role definitions and utility functions — zero DOM/API coupling.
// Single source of truth for role labels, icons, colors across all pages.
// ============================================================================
import { t } from '../utils/i18n';

// ─── Design Token Bridge ────────────────────────────────────────────────────
// PLT-AUD-DT001 FIX: Reads live CSS custom properties at runtime.
// Hex fallbacks match tailwind.config.js exactly.
const TOKEN_CACHE = new Map<string, string>();

function cssVar(name: string, fallback: string): string {
    const cached = TOKEN_CACHE.get(name);
    if (cached) { return cached; }
    if (typeof document === 'undefined') { return fallback; }
    const value = getComputedStyle(document.documentElement)
        .getPropertyValue(name).trim();
    const resolved = value || fallback;
    TOKEN_CACHE.set(name, resolved);
    return resolved;
}

// ─── Role Metadata ──────────────────────────────────────────────────────────
interface RoleMeta {
    icon: string;          // Phosphor icon name
    labelKey: string;      // Translation engine key
    labelFallback: string; // Translation engine fallback
    colorToken: string;    // CSS custom property name (e.g. '--trust-blue')
    colorFallback: string; // Hex fallback matching tailwind.config.js
    verificationLabel: string;
}

const ROLE_META: Record<string, RoleMeta> = {
    homeowner: {
        icon: 'ph-house',
        labelKey: 'role_homeowner',
        labelFallback: 'Homeowner',
        colorToken: '--trust-blue',
        colorFallback: '#1558D6',
        verificationLabel: 'Property Proof',
    },
    engineer: {
        icon: 'ph-hard-hat',
        labelKey: 'role_engineer',
        labelFallback: 'Engineer',
        colorToken: '--smoky-jade',
        colorFallback: '#0A6E55',  // FORENSIC-C6.1 FIX: Was #109173. GEMINI.md specifies #0A6E55.
        verificationLabel: 'License Verified',
    },
    supplier: {
        icon: 'ph-truck',
        labelKey: 'role_supplier',
        labelFallback: 'Supplier',
        colorToken: '--warm-earth',
        colorFallback: '#D59F80',
        verificationLabel: 'Business KYB',
    },
    contractor: {
        icon: 'ph-buildings',
        labelKey: 'role_contractor',
        labelFallback: 'Contractor',
        colorToken: '--trust-blue',
        colorFallback: '#1558D6',
        verificationLabel: 'Licensed',
    },
    tradesperson: {
        icon: 'ph-wrench',
        labelKey: 'role_tradesperson',
        labelFallback: 'Tradesperson',
        colorToken: '--smoky-jade',
        colorFallback: '#0A6E55',  // FORENSIC-C6.1 FIX: Was #109173. GEMINI.md specifies #0A6E55.
        verificationLabel: 'Certified',
    },
    admin: {
        icon: 'ph-shield-check',
        labelKey: 'role_admin',
        labelFallback: 'Admin',
        colorToken: '--red-500',           // Intentional: Admin uses alert color, not brand color
        colorFallback: '#ef4444',
        verificationLabel: 'System Admin',
    },
    auditor: {
        icon: 'ph-detective',
        labelKey: 'role_auditor',
        labelFallback: 'Auditor',
        colorToken: '--violet-500',         // Intentional: Auditor uses distinct color, not brand color
        colorFallback: '#8b5cf6',
        verificationLabel: 'Auditor',
    }
};

/**
 * Get the display label for a role based on current locale.
 */
function getRoleLabel(role: string): string {
    const meta = ROLE_META[role];
    if (!meta) { return role; }
    return t(meta.labelKey, meta.labelFallback);
}

/**
 * Get Phosphor icon class for a role.
 */
function getRoleIcon(role: string): string {
    return ROLE_META[role]?.icon ?? 'ph-user-circle';
}

/**
 * Get accent color for a role (reads CSS custom property with hex fallback).
 */
function getRoleColor(role: string): string {
    const meta = ROLE_META[role];
    if (!meta) { return cssVar('--slate-500', '#64748b'); }
    return cssVar(meta.colorToken, meta.colorFallback);
}

export { ROLE_META, getRoleLabel, getRoleIcon, getRoleColor };
export type { RoleMeta };
