// ============================================================================
// Nammerha Backend — Georavity Service (Valhalla Routing Engine)
// Self-hosted routing engine on 91.98.182.243:8002
// ============================================================================
//
// Capabilities:
//   - Route:             A→B driving/walking/truck route with polyline
//   - Distance Matrix:   One source → N targets (for matchmaking)
//   - Isochrone:         Reachability polygons (15/30/60 min contours)
//   - Health:            Engine status check
//
// Architecture:
//   - Backend-only: Frontend NEVER talks to Georavity directly
//   - Graceful degradation: falls back to Haversine if engine is down
//   - Timeout: 5s per request to prevent blocking
// ============================================================================

// ─── Configuration ──────────────────────────────────────────────────────────

import { logger } from '../utils/logger';

const GEORAVITY_URL = process.env['GEORAVITY_URL'] ?? 'http://localhost:8002';
const REQUEST_TIMEOUT_MS = 5000;

// ─── Types ──────────────────────────────────────────────────────────────────

export type CostingModel = 'auto' | 'truck' | 'pedestrian' | 'bicycle';

export interface RouteResult {
    /** Total distance in kilometers */
    distance_km: number;
    /** Total travel time in seconds */
    duration_seconds: number;
    /** Encoded polyline (Polyline6, precision 1e6) */
    encoded_polyline: string;
}

export interface MatrixEntry {
    /** Distance in kilometers */
    distance_km: number;
    /** Travel time in seconds */
    duration_seconds: number;
    /** Target index (0-based) */
    target_index: number;
}

export interface LatLng {
    lat: number;
    lng: number;
}

// ─── Internal: Valhalla API Types ───────────────────────────────────────────

interface ValhallaLocation {
    lat: number;
    lon: number;
}

interface ValhallaLegSummary {
    length: number;   // km
    time: number;     // seconds
}

interface ValhallaLeg {
    summary: ValhallaLegSummary;
    shape: string;
}

interface ValhallaTrip {
    legs: ValhallaLeg[];
    summary: ValhallaLegSummary;
}

interface ValhallaRouteResponse {
    trip: ValhallaTrip;
}

interface ValhallaMatrixEntry {
    distance: number;   // km
    time: number;       // seconds
}

interface ValhallaMatrixResponse {
    sources_to_targets: ValhallaMatrixEntry[][];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toValhallaLocation(p: LatLng): ValhallaLocation {
    return { lat: p.lat, lon: p.lng };
}

/**
 * Make a POST request to the Georavity engine with timeout.
 * Throws on network errors and non-2xx responses.
 */
async function georavityPost<T>(endpoint: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(`${GEORAVITY_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            throw new Error(
                `Georavity ${endpoint} responded with ${response.status}: ${errorText}`
            );
        }

        return await response.json() as T;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`Georavity ${endpoint} timed out after ${REQUEST_TIMEOUT_MS}ms`);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Calculate a route between two points.
 *
 * @param origin - Starting point
 * @param destination - Ending point
 * @param costing - Vehicle type (default: 'auto')
 * @returns Route with distance, duration, and encoded polyline
 *
 * @example
 * const route = await getRoute(
 *   { lat: 33.5138, lng: 36.2765 },  // Damascus
 *   { lat: 34.7324, lng: 36.7137 },  // Homs
 * );
 * // route.distance_km ≈ 162.5
 * // route.duration_seconds ≈ 7200
 */
export async function getRoute(
    origin: LatLng,
    destination: LatLng,
    costing: CostingModel = 'auto',
): Promise<RouteResult> {
    const response = await georavityPost<ValhallaRouteResponse>('/route', {
        locations: [
            toValhallaLocation(origin),
            toValhallaLocation(destination),
        ],
        costing,
        directions_options: { units: 'km' },
    });

    const trip = response.trip;
    const summary = trip.summary;
    const shape = trip.legs[0]?.shape ?? '';

    return {
        distance_km: Math.round(summary.length * 100) / 100,
        duration_seconds: Math.round(summary.time),
        encoded_polyline: shape,
    };
}

/**
 * Calculate a distance matrix from one source to multiple targets.
 * Critical for matchmaking: ranks engineers/contractors by real road distance.
 *
 * @param source - The project location (single point)
 * @param targets - Array of engineer/contractor locations
 * @param costing - Vehicle type (default: 'auto')
 * @returns Array of distances/durations, one per target, sorted by target_index
 *
 * @example
 * const matrix = await getDistanceMatrix(
 *   { lat: 33.51, lng: 36.27 },                           // Project
 *   [{ lat: 33.52, lng: 36.28 }, { lat: 33.50, lng: 36.30 }],  // Engineers
 * );
 * // matrix[0] = { distance_km: 1.2, duration_seconds: 180, target_index: 0 }
 * // matrix[1] = { distance_km: 3.8, duration_seconds: 420, target_index: 1 }
 */
export async function getDistanceMatrix(
    source: LatLng,
    targets: LatLng[],
    costing: CostingModel = 'auto',
): Promise<MatrixEntry[]> {
    if (targets.length === 0) {
        return [];
    }

    const response = await georavityPost<ValhallaMatrixResponse>('/sources_to_targets', {
        sources: [toValhallaLocation(source)],
        targets: targets.map(toValhallaLocation),
        costing,
    });

    // Valhalla returns a 2D array [sources][targets] — we have 1 source
    const row = response.sources_to_targets[0] ?? [];

    return row.map((entry, index) => ({
        distance_km: Math.round(entry.distance * 100) / 100,
        duration_seconds: Math.round(entry.time),
        target_index: index,
    }));
}

/**
 * Generate isochrone contours (reachability polygons) from a center point.
 *
 * @param center - The center point (e.g., engineer location)
 * @param contours_minutes - Array of time contours in minutes (e.g., [15, 30, 60])
 * @param costing - Vehicle type (default: 'auto')
 * @returns GeoJSON FeatureCollection of isochrone polygons
 */
export async function getIsochrone(
    center: LatLng,
    contours_minutes: number[],
    costing: CostingModel = 'auto',
): Promise<GeoJSON.FeatureCollection> {
    const response = await georavityPost<GeoJSON.FeatureCollection>('/isochrone', {
        locations: [toValhallaLocation(center)],
        costing,
        contours: contours_minutes.map(time => ({ time })),
        polygons: true,
    });

    return response;
}

/**
 * Calculate an optimized multi-stop route.
 * Useful for engineers visiting multiple project sites in one trip.
 *
 * @param locations - Array of stops to optimize
 * @param costing - Vehicle type (default: 'auto')
 * @returns Route with optimal stop order
 */
export async function getOptimizedRoute(
    locations: LatLng[],
    costing: CostingModel = 'auto',
): Promise<RouteResult> {
    if (locations.length < 2) {
        throw new Error('Optimized route requires at least 2 locations');
    }

    const response = await georavityPost<ValhallaRouteResponse>('/optimized_route', {
        locations: locations.map(toValhallaLocation),
        costing,
        directions_options: { units: 'km' },
    });

    const trip = response.trip;
    const summary = trip.summary;
    const shape = trip.legs.map(leg => leg.shape).join('');

    return {
        distance_km: Math.round(summary.length * 100) / 100,
        duration_seconds: Math.round(summary.time),
        encoded_polyline: shape,
    };
}

/**
 * Check if the Georavity engine is healthy and responsive.
 * Used for health monitoring and graceful degradation decisions.
 */
export async function healthCheck(): Promise<{
    healthy: boolean;
    url: string;
    response_ms: number;
}> {
    const start = Date.now();
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(`${GEORAVITY_URL}/status`, {
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        return {
            healthy: response.ok,
            url: GEORAVITY_URL,
            response_ms: Date.now() - start,
        };
    } catch (err) {
        logger.warn('Georavity health check failed — engine unreachable', {
            url: GEORAVITY_URL,
            error: err instanceof Error ? err.message : String(err),
            response_ms: Date.now() - start,
        });
        return {
            healthy: false,
            url: GEORAVITY_URL,
            response_ms: Date.now() - start,
        };
    }
}
