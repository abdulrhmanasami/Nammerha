// ============================================================================
// Nammerha Frontend — Isochrone Visualization Module
// Renders Valhalla isochrone polygons as fill layers on MapLibre
// ============================================================================
import maplibregl from 'maplibre-gl';

// ─── Constants ──────────────────────────────────────────────────────────────

const ISOCHRONE_SOURCE_ID = 'georavity-isochrone';
const ISOCHRONE_LAYER_FILL_ID = 'georavity-isochrone-fill';
const ISOCHRONE_LAYER_OUTLINE_ID = 'georavity-isochrone-outline';

// Color palette: closer = green, farther = red
const CONTOUR_COLORS: Record<number, string> = {
    15: '#22C55E',   // green — 15 min
    30: '#F59E0B',   // amber — 30 min
    45: '#EF4444',   // red — 45 min
    60: '#9333EA',   // purple — 60 min
};

const DEFAULT_COLOR = '#64748B'; // slate-500

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Draw isochrone polygons on the map from a GeoJSON FeatureCollection.
 * Each feature should have a `contour` property indicating the time in minutes.
 *
 * @param map - The MapLibre map instance
 * @param geojson - GeoJSON FeatureCollection from Georavity isochrone endpoint
 * @param options - Optional styling configuration
 */
export function drawIsochrone(
    map: maplibregl.Map,
    geojson: GeoJSON.FeatureCollection,
    options?: {
        opacity?: number;
        fitBounds?: boolean;
    },
): void {
    // Remove any existing isochrone first
    clearIsochrone(map);

    const opacity = options?.opacity ?? 0.2;

    // Valhalla returns features in descending contour order
    // (largest polygon first). We reverse for proper layering.
    const sortedFeatures = [...geojson.features].sort((a, b) => {
        const aTime = (a.properties?.['contour'] as number) ?? 0;
        const bTime = (b.properties?.['contour'] as number) ?? 0;
        return bTime - aTime; // Largest first (drawn underneath)
    });

    const sortedCollection: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: sortedFeatures,
    };

    // Add GeoJSON source
    map.addSource(ISOCHRONE_SOURCE_ID, {
        type: 'geojson',
        data: sortedCollection,
    });

    // Fill layer with contour-based coloring
    map.addLayer({
        id: ISOCHRONE_LAYER_FILL_ID,
        type: 'fill',
        source: ISOCHRONE_SOURCE_ID,
        paint: {
            'fill-color': buildColorExpression(),
            'fill-opacity': opacity,
        },
    });

    // Outline layer
    map.addLayer({
        id: ISOCHRONE_LAYER_OUTLINE_ID,
        type: 'line',
        source: ISOCHRONE_SOURCE_ID,
        paint: {
            'line-color': buildColorExpression(),
            'line-width': 1.5,
            'line-opacity': 0.6,
        },
    });

    // Fit to bounds
    if (options?.fitBounds !== false) {
        const bounds = new maplibregl.LngLatBounds();
        sortedFeatures.forEach(feature => {
            if (feature.geometry.type === 'Polygon') {
                feature.geometry.coordinates[0]?.forEach(coord => {
                    bounds.extend(coord as [number, number]);
                });
            } else if (feature.geometry.type === 'MultiPolygon') {
                feature.geometry.coordinates.forEach(polygon => {
                    polygon[0]?.forEach(coord => {
                        bounds.extend(coord as [number, number]);
                    });
                });
            }
        });

        if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { padding: 40, duration: 800 });
        }
    }
}

/**
 * Remove isochrone polygons from the map.
 */
export function clearIsochrone(map: maplibregl.Map): void {
    if (map.getLayer(ISOCHRONE_LAYER_OUTLINE_ID)) {
        map.removeLayer(ISOCHRONE_LAYER_OUTLINE_ID);
    }
    if (map.getLayer(ISOCHRONE_LAYER_FILL_ID)) {
        map.removeLayer(ISOCHRONE_LAYER_FILL_ID);
    }
    if (map.getSource(ISOCHRONE_SOURCE_ID)) {
        map.removeSource(ISOCHRONE_SOURCE_ID);
    }
}

/**
 * Check if isochrone polygons are currently displayed.
 */
export function hasIsochrone(map: maplibregl.Map): boolean {
    return !!map.getSource(ISOCHRONE_SOURCE_ID);
}

/**
 * Toggle isochrone visibility without removing from map.
 */
export function toggleIsochrone(map: maplibregl.Map, visible: boolean): void {
    const visibility = visible ? 'visible' : 'none';

    if (map.getLayer(ISOCHRONE_LAYER_FILL_ID)) {
        map.setLayoutProperty(ISOCHRONE_LAYER_FILL_ID, 'visibility', visibility);
    }
    if (map.getLayer(ISOCHRONE_LAYER_OUTLINE_ID)) {
        map.setLayoutProperty(ISOCHRONE_LAYER_OUTLINE_ID, 'visibility', visibility);
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a MapLibre data-driven color expression based on contour time.
 * Maps contour minutes → color using a step expression.
 */
function buildColorExpression(): maplibregl.ExpressionSpecification {
    return [
        'match',
        ['get', 'contour'],
        15, CONTOUR_COLORS[15] ?? DEFAULT_COLOR,
        30, CONTOUR_COLORS[30] ?? DEFAULT_COLOR,
        45, CONTOUR_COLORS[45] ?? DEFAULT_COLOR,
        60, CONTOUR_COLORS[60] ?? DEFAULT_COLOR,
        DEFAULT_COLOR,
    ];
}
