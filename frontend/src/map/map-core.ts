// ============================================================================
// Nammerha Frontend — MapLibre Core Initialization
// Central map factory with RTL lazy-load for Arabic label rendering
// ============================================================================
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getBasemapStyleUrl, SYRIA_CENTER, DEFAULT_ZOOM } from './basemap-config';

// ─── RTL Plugin Singleton Guard ─────────────────────────────────────────────
let rtlPluginLoaded = false;

function loadRTLPlugin(): void {
    if (rtlPluginLoaded) return;
    rtlPluginLoaded = true;

    try {
        maplibregl.setRTLTextPlugin(
            'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js',
            true,
        );
    } catch (error) {
        console.warn('[Nammerha Map] RTL text plugin:', error);
    }
}

// ─── Map Options ────────────────────────────────────────────────────────────
export interface NammerhaMapOptions {
    container: string;
    center?: [number, number];
    zoom?: number;
    interactive?: boolean;
    attribution?: boolean;
}

// ─── Protocol Fixer ─────────────────────────────────────────────────────────

/**
 * Fix ALL protocol references in the tileserver-gl style JSON.
 *
 * Problem chain:
 *   1. tileserver-gl runs behind Caddy (HTTP internally)
 *   2. Generates http:// URLs in style.json for sources, glyphs, sprites
 *   3. Sources point to v3.json TileJSON (also has http:// tile URLs)
 *   4. Browser on HTTPS blocks mixed-content or silently fails
 *
 * Solution:
 *   - Fetch style.json
 *   - Fetch the TileJSON (v3.json) referenced by sources
 *   - Inline tile URLs directly into the style, bypassing TileJSON indirection
 *   - Fix ALL http:// URLs to match page protocol
 */
async function fetchAndFixStyle(styleUrl: string): Promise<maplibregl.StyleSpecification> {
    const pageProtocol = window.location.protocol; // 'https:' or 'http:'
    const currentHost = window.location.hostname;
    const origin = `${pageProtocol}//${currentHost}`;

    // Helper: fix any http://currentHost URL to use page protocol
    const fixUrl = (url: string): string => {
        if (!url) return url;
        return url.replace(
            new RegExp(`http://${currentHost.replace(/\./g, '\\.')}`, 'g'),
            origin,
        );
    };

    // 1. Fetch the style JSON
    const styleResp = await fetch(styleUrl);
    if (!styleResp.ok) {
        throw new Error(`Style fetch failed: ${styleResp.status}`);
    }
    const style: maplibregl.StyleSpecification = await styleResp.json();

    // 2. Fix glyphs URL
    if (style.glyphs) {
        style.glyphs = fixUrl(style.glyphs as string);
    }

    // 3. Fix sprite URL
    if (style.sprite) {
        if (typeof style.sprite === 'string') {
            style.sprite = fixUrl(style.sprite);
        }
    }

    // 4. Fix sources — the CRITICAL fix
    //    Replace TileJSON URL references with inline tile template URLs
    const sources = style.sources ?? {};
    for (const [sourceName, srcDef] of Object.entries(sources)) {
        const source = srcDef as Record<string, unknown>;

        // If source uses a TileJSON URL reference, fetch it and inline
        if (source.url && typeof source.url === 'string') {
            const tileJsonUrl = fixUrl(source.url);
            try {
                const tjResp = await fetch(tileJsonUrl);
                if (tjResp.ok) {
                    const tileJson = await tjResp.json() as Record<string, unknown>;

                    // Extract and fix tile template URLs
                    const tiles = tileJson.tiles as string[] | undefined;
                    if (tiles && tiles.length > 0) {
                        source.tiles = tiles.map(fixUrl);
                    }

                    // Copy metadata from TileJSON
                    if (tileJson.minzoom !== undefined) source.minzoom = tileJson.minzoom;
                    if (tileJson.maxzoom !== undefined) source.maxzoom = tileJson.maxzoom;
                    if (tileJson.bounds) source.bounds = tileJson.bounds;
                    if (tileJson.attribution) source.attribution = tileJson.attribution;

                    // Remove the url property — we've inlined everything
                    delete source.url;

                    console.info(`[Nammerha Map] Source '${sourceName}' inlined:`, source.tiles);
                }
            } catch (err) {
                console.warn(`[Nammerha Map] TileJSON fetch failed for ${sourceName}, keeping URL ref:`, err);
                source.url = tileJsonUrl;
            }
        }

        // Also fix any direct tiles array if present
        if (Array.isArray(source.tiles)) {
            source.tiles = (source.tiles as string[]).map(fixUrl);
        }
    }

    return style;
}

// ─── Map Factory ────────────────────────────────────────────────────────────

export async function initMap(options: NammerhaMapOptions): Promise<maplibregl.Map> {
    loadRTLPlugin();

    const showAttribution = options.attribution !== false;

    // Fetch and comprehensively fix the style
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
        // Comprehensive protocol fix for ALL dynamically generated URLs
        transformRequest: (url: string) => {
            const host = window.location.hostname;
            if (url.startsWith(`http://${host}`)) {
                return { url: url.replace(`http://${host}`, `https://${host}`) };
            }
            return { url };
        },
    });

    if (showAttribution) {
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    }

    return map;
}

export { maplibregl };
