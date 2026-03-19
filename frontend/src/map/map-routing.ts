// ============================================================================
// Nammerha Frontend — Route Visualization Module
// Draws Valhalla routes (Polyline6) on MapLibre GL JS
// ============================================================================
import maplibregl from 'maplibre-gl';

// ─── Constants ──────────────────────────────────────────────────────────────

const ROUTE_SOURCE_ID = 'georavity-route';
const ROUTE_LAYER_GLOW_ID = 'georavity-route-glow';
const ROUTE_LAYER_LINE_ID = 'georavity-route-line';
const ROUTE_MARKER_START_CLASS = 'georavity-start';
const ROUTE_MARKER_END_CLASS = 'georavity-end';

// ─── Polyline6 Decoder ──────────────────────────────────────────────────────

/**
 * Decode an encoded polyline string into an array of [lng, lat] coordinates.
 * Supports both Polyline5 (1e5) and Polyline6 (1e6) precision.
 *
 * Valhalla uses Polyline6 (precision = 6).
 */
function decodePolyline(encoded: string, precision: number = 6): [number, number][] {
    const factor = Math.pow(10, precision);
    const coordinates: [number, number][] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
        let shift = 0;
        let result = 0;
        let byte: number;

        // Decode latitude
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
        lat += dlat;

        // Decode longitude
        shift = 0;
        result = 0;
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
        lng += dlng;

        coordinates.push([lng / factor, lat / factor]); // GeoJSON: [lng, lat]
    }

    return coordinates;
}

// ─── State ──────────────────────────────────────────────────────────────────

let startMarker: maplibregl.Marker | null = null;
let endMarker: maplibregl.Marker | null = null;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Draw a route on the map from a Valhalla-encoded polyline.
 * Creates a glowing blue polyline with start/end markers.
 *
 * @param map - The MapLibre map instance
 * @param encodedPolyline - Polyline6 encoded string from Georavity
 * @param options - Optional styling configuration
 */
export function drawRoute(
    map: maplibregl.Map,
    encodedPolyline: string,
    options?: {
        color?: string;
        width?: number;
        fitBounds?: boolean;
    },
): void {
    // Remove any existing route first
    clearRoute(map);

    const coordinates = decodePolyline(encodedPolyline, 6);
    if (coordinates.length < 2) {
        return;
    }

    const color = options?.color ?? '#3B82F6';   // trust-blue
    const width = options?.width ?? 4;

    // Add GeoJSON source
    map.addSource(ROUTE_SOURCE_ID, {
        type: 'geojson',
        data: {
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'LineString',
                coordinates,
            },
        },
    });

    // Glow layer (wider, semi-transparent for depth)
    map.addLayer({
        id: ROUTE_LAYER_GLOW_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: {
            'line-join': 'round',
            'line-cap': 'round',
        },
        paint: {
            'line-color': color,
            'line-width': width * 3,
            'line-opacity': 0.15,
            'line-blur': 3,
        },
    });

    // Main route line
    map.addLayer({
        id: ROUTE_LAYER_LINE_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: {
            'line-join': 'round',
            'line-cap': 'round',
        },
        paint: {
            'line-color': color,
            'line-width': width,
            'line-opacity': 0.85,
        },
    });

    // Start marker (green dot)
    const startEl = createMarkerElement(ROUTE_MARKER_START_CLASS, '#22C55E');
    startMarker = new maplibregl.Marker({ element: startEl })
        .setLngLat(coordinates[0] as [number, number])
        .addTo(map);

    // End marker (red dot)
    const endIdx = coordinates.length - 1;
    const endEl = createMarkerElement(ROUTE_MARKER_END_CLASS, '#EF4444');
    endMarker = new maplibregl.Marker({ element: endEl })
        .setLngLat(coordinates[endIdx] as [number, number])
        .addTo(map);

    // Fit map to route bounds
    if (options?.fitBounds !== false) {
        const bounds = new maplibregl.LngLatBounds();
        coordinates.forEach(coord => bounds.extend(coord as [number, number]));
        map.fitBounds(bounds, { padding: 60, duration: 800 });
    }
}

/**
 * Remove the current route from the map (clears layers, source, and markers).
 */
export function clearRoute(map: maplibregl.Map): void {
    // Remove layers
    if (map.getLayer(ROUTE_LAYER_LINE_ID)) {
        map.removeLayer(ROUTE_LAYER_LINE_ID);
    }
    if (map.getLayer(ROUTE_LAYER_GLOW_ID)) {
        map.removeLayer(ROUTE_LAYER_GLOW_ID);
    }

    // Remove source
    if (map.getSource(ROUTE_SOURCE_ID)) {
        map.removeSource(ROUTE_SOURCE_ID);
    }

    // Remove markers
    if (startMarker) { startMarker.remove(); startMarker = null; }
    if (endMarker) { endMarker.remove(); endMarker = null; }
}

/**
 * Check if a route is currently displayed on the map.
 */
export function hasRoute(map: maplibregl.Map): boolean {
    return !!map.getSource(ROUTE_SOURCE_ID);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMarkerElement(className: string, color: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = `${className} nm-route-marker`;
    // TICKET-02 FIX: CSS class replaces style.cssText — P1-SST-001.
    // Dynamic color via CSS custom property instead of inline background.
    el.style.setProperty('--marker-color', color);
    return el;
}
