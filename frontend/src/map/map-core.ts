// ============================================================================
// Nammerha Frontend — MapLibre Core Initialization
// Central map factory with RTL lazy-load for Arabic label rendering
// ============================================================================
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getBasemapStyleUrl, SYRIA_CENTER, DEFAULT_ZOOM } from './basemap-config';

// ─── RTL Plugin Singleton Guard ─────────────────────────────────────────────
let rtlPluginLoaded = false;

/**
 * Lazy-load the RTL text plugin for correct Arabic/Hebrew label rendering.
 * This must be called before the map renders Arabic street names.
 * Uses the official @mapbox/mapbox-gl-rtl-text plugin (compatible with MapLibre).
 */
function loadRTLPlugin(): void {
    if (rtlPluginLoaded) {
        return;
    }
    rtlPluginLoaded = true;

    try {
        maplibregl.setRTLTextPlugin(
            'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js',
            true, // lazy: load only when RTL text is encountered
        );
    } catch (error) {
        // Plugin may already be loaded (e.g., HMR re-execution)
        console.warn('[Nammerha Map] RTL text plugin already loaded or failed:', error);
    }
}

// ─── Map Options ────────────────────────────────────────────────────────────
export interface NammerhaMapOptions {
    /** HTML element ID to mount the map */
    container: string;
    /** Override default center [lng, lat] */
    center?: [number, number];
    /** Override default zoom level */
    zoom?: number;
    /** Enable interactive controls (navigation, geolocate) */
    interactive?: boolean;
    /** Enable the attribution control */
    attribution?: boolean;
}

// ─── Style Protocol Fixer ───────────────────────────────────────────────────

/**
 * Fetch the style JSON from the tile server and fix protocol mismatches.
 *
 * Problem: tileserver-gl runs behind Caddy (HTTP internally), so it generates
 * `http://` URLs in style.json (glyphs, sources, sprites). But the browser
 * accesses via `https://` through Cloudflare, causing mixed-content blocks.
 *
 * Solution: Fetch the style JSON, replace http:// with https:// for the
 * current hostname, and return the fixed style object.
 */
async function fetchAndFixStyle(styleUrl: string): Promise<maplibregl.StyleSpecification> {
    const response = await fetch(styleUrl);
    if (!response.ok) {
        throw new Error(`[Nammerha Map] Failed to load style: ${response.status} ${response.statusText}`);
    }

    const styleText = await response.text();
    const currentHost = window.location.hostname;
    const pageProtocol = window.location.protocol; // 'https:' or 'http:'

    // Replace http:// with the page's protocol for same-host URLs only
    const fixedText = styleText.replace(
        new RegExp(`http://${currentHost.replace('.', '\\.')}`, 'g'),
        `${pageProtocol}//${currentHost}`,
    );

    return JSON.parse(fixedText) as maplibregl.StyleSpecification;
}

// ─── Map Factory ────────────────────────────────────────────────────────────

/**
 * Initialize a MapLibre GL JS map instance with Nammerha defaults:
 * - Syria-centered view
 * - RTL text plugin for Arabic labels
 * - Protocol-fixed tile server style
 * - Smooth animations and hardware-accelerated rendering
 *
 * @returns The MapLibre Map instance (ready for layers/controls)
 */
export async function initMap(options: NammerhaMapOptions): Promise<maplibregl.Map> {
    // Load RTL plugin before any map renders
    loadRTLPlugin();

    const showAttribution = options.attribution !== false;

    // Fetch and fix the style protocol for HTTPS compatibility
    let style: string | maplibregl.StyleSpecification;
    try {
        style = await fetchAndFixStyle(getBasemapStyleUrl());
    } catch (error) {
        console.error('[Nammerha Map] Style fetch failed, using URL fallback:', error);
        style = getBasemapStyleUrl();
    }

    const map = new maplibregl.Map({
        container: options.container,
        style,
        center: options.center ?? SYRIA_CENTER,
        zoom: options.zoom ?? DEFAULT_ZOOM,
        attributionControl: false,
        fadeDuration: 200,
        maxZoom: 18,
        minZoom: 4,
    });

    // Add attribution at bottom-left (non-intrusive)
    if (showAttribution) {
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    }

    return map;
}

export { maplibregl };
