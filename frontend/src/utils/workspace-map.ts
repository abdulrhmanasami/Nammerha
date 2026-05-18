// ============================================================================
// Nammerha — Workspace Route Map (Single Source of Truth)
// ============================================================================
// Canonical whitelist mapping workspace IDs → portal URLs.
//
// CONSUMERS:
//   - auth.ts:          resolveWorkspaceUrl() for post-login redirect (P1-001)
//   - main.ts:          WORKSPACE_META for "Continue to [X]" banner (UX-F012)
//   - welcome-chooser:  WORKSPACE_OPTIONS for onboarding modal (P0-004)
//
// SECURITY:
//   - Only whitelisted relative paths are returned — no open redirect risk.
//   - localStorage `nm_preferred_workspace` value is used as a KEY lookup,
//     never directly as a URL.
//
// ADDING A NEW WORKSPACE:
//   1. Add entry to WORKSPACE_ROUTES below
//   2. Add display metadata to WORKSPACE_DISPLAY (icon, colorClass)
//   3. Add i18n keys for the workspace label if needed
// ============================================================================

/** Workspace ID → portal URL mapping (whitelist) */
export const WORKSPACE_ROUTES: Readonly<Record<string, string>> = {
    homeowner:   '/homeowner-portal.html',
    contractor:  '/contractor-portal.html',
    engineer:    '/projects.html',
    supplier:    '/supplier-dashboard.html',
    explorer:    '/projects.html',
    tradesperson: '/tradesperson-portal.html',
};

/** Display metadata for the "Continue to [X]" banner and workspace UI */
export interface WorkspaceDisplayMeta {
    href: string;
    icon: string;
    colorClass: string;
}

export const WORKSPACE_DISPLAY: Readonly<Record<string, WorkspaceDisplayMeta>> = {
    homeowner:  { href: WORKSPACE_ROUTES.homeowner!,  icon: 'ph-house',      colorClass: 'text-trust-blue' },
    contractor: { href: WORKSPACE_ROUTES.contractor!, icon: 'ph-briefcase',  colorClass: 'text-warm-earth' },
    supplier:   { href: WORKSPACE_ROUTES.supplier!,   icon: 'ph-storefront', colorClass: 'text-purple-600 dark:text-purple-400' },
};

/** localStorage key for persisted workspace preference */
export const WS_STORAGE_KEY = 'nm_preferred_workspace';

/**
 * Resolve a workspace ID to its portal URL.
 * Returns `null` for unknown/invalid IDs (safe — no open redirect).
 *
 * @param workspaceId - The workspace identifier stored in localStorage
 * @returns Relative portal URL or null if unknown
 */
export function resolveWorkspaceUrl(workspaceId: string | null): string | null {
    if (!workspaceId) { return null; }
    return WORKSPACE_ROUTES[workspaceId] ?? null;
}
