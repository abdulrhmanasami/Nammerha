// ============================================================================
// Nammerha Frontend — Basemap Configuration
// Abstracts basemap source: MapTiler Cloud (Phase 1) or PMTiles (Phase 2)
// ============================================================================

/**
 * Returns the MapLibre style URL based on environment configuration.
 *
 * Phase 1: MapTiler Cloud (managed, fast to integrate)
 * Phase 2: PMTiles on S3 (self-hosted, zero cost)
 */
export function getBasemapStyleUrl(): string {
    // Check for custom PMTiles style first (Phase 2 migration)
    const pmtilesStyle = getEnvVar('VITE_PMTILES_STYLE_URL');
    if (pmtilesStyle) {
        return pmtilesStyle;
    }

    // Default: MapTiler Cloud
    const apiKey = getEnvVar('VITE_MAPTILER_API_KEY');
    if (!apiKey) {
        console.warn(
            '[Nammerha Map] No VITE_MAPTILER_API_KEY found. Using OpenStreetMap demo tiles.',
        );
        return FALLBACK_STYLE_URL;
    }

    return `https://api.maptiler.com/maps/streets-v2/style.json?key=${apiKey}`;
}

/**
 * Fallback: Free OpenStreetMap raster tiles (no vector, no RTL, but always works)
 */
const FALLBACK_STYLE_URL = 'https://demotiles.maplibre.org/style.json';

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
