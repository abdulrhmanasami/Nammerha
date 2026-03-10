// ============================================================================
// Nammerha Frontend — Basemap Configuration
// Self-hosted Sovereign tile server (tileserver-gl) via Caddy reverse proxy
// ============================================================================

/**
 * Available map styles from the self-hosted tileserver-gl.
 * These are served via Caddy at /tiles/* on the same server.
 */
export type MapStyle = 'basic' | 'dark' | 'basic-preview';

/**
 * Returns the MapLibre style URL for the Sovereign tile server.
 *
 * Priority:
 * 1. VITE_TILE_STYLE_URL env var (full override for development/staging)
 * 2. Self-hosted tileserver-gl via Caddy (production default)
 * 3. MapLibre demo tiles (ultimate fallback — low-quality raster only)
 */
export function getBasemapStyleUrl(style: MapStyle = 'basic'): string {
    // Allow full override via env var (dev/staging)
    const customUrl = getEnvVar('VITE_TILE_STYLE_URL');
    if (customUrl) {
        return customUrl;
    }

    // Self-hosted Sovereign tile server
    const tileBaseUrl = getEnvVar('VITE_TILE_SERVER_URL') ?? SOVEREIGN_TILE_BASE_URL;
    return `${tileBaseUrl}/styles/${style}/style.json`;
}

/**
 * Returns the dark variant style URL for night-mode or satellite comparison views.
 */
export function getDarkStyleUrl(): string {
    return getBasemapStyleUrl('dark');
}

// ─── Sovereign Tile Server ──────────────────────────────────────────────────

/**
 * Base URL for the self-hosted tileserver-gl.
 * Served via Caddy reverse proxy on the production server.
 * Internal Docker: 10.99.0.1:8088 → External: /tiles/*
 */
const SOVEREIGN_TILE_BASE_URL = '/tiles';

// ─── Syria Geographic Constants ─────────────────────────────────────────────
/** Damascus, Syria — default map center */
export const SYRIA_CENTER: [number, number] = [36.2765, 33.5138];

/** Default zoom level to show all of Syria */
export const DEFAULT_ZOOM = 7;

/** Bounding box for Syria [sw_lng, sw_lat, ne_lng, ne_lat] */
export const SYRIA_BOUNDS: [number, number, number, number] = [
    35.4, 32.3, // Southwest (near Golan)
    42.5, 37.4, // Northeast (near Turkey/Iraq border)
];

// ─── Helpers ────────────────────────────────────────────────────────────────
function getEnvVar(key: string): string | undefined {
    // Vite injects env vars via import.meta.env
    try {
        const meta = import.meta as unknown as { env?: Record<string, string> };
        return meta.env?.[key];
    } catch {
        return undefined;
    }
}
