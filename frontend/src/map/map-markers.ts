// ============================================================================
// Nammerha Frontend — Map Markers Layer
// Project markers with clustering, popups, and color-coded status
// ============================================================================
import maplibregl from 'maplibre-gl';
import type { ProjectFilter } from './map-controls';
import { t } from './i18n-bridge';
import { escapeHtml } from '../utils/xss';
import { reportError } from '../error-reporter';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProjectFeature {
    project_id: string;
    title: string;
    status: string;
    funded_percentage: number;
    damage_type: string;
    cover_image_url: string | null;
    homeowner_name: string;
    total_estimated_cost: number;
    total_funded_amount: number;
    address_text: string | null;
}

// ─── Source & Layer IDs ─────────────────────────────────────────────────────
const SOURCE_ID = 'projects-source';
const CLUSTER_LAYER = 'clusters';
const CLUSTER_COUNT_LAYER = 'cluster-count';
const UNCLUSTERED_LAYER = 'unclustered-project';

// ─── Color Palette (matches Nammerha Design Tokens) ─────────────────────────
const STATUS_COLORS: Record<string, string> = {
    published: '#F5A623',    // warm-earth — needs funding
    in_progress: '#2E7FE8',  // trust-blue — active construction
    completed: '#4CAF50',    // smoky-jade — completed
    default: '#94A3B8',      // slate-400 — fallback
};

// ─── GeoJSON Loading ────────────────────────────────────────────────────────

/**
 * Fetch project data from the backend and load as a clustered GeoJSON source.
 *
 * @param map MapLibre map instance
 * @param apiBase API base URL (defaults to '/api')
 */
export async function loadProjectMarkers(
    map: maplibregl.Map,
    apiBase = '/api',
): Promise<void> {
    try {
        const response = await fetch(`${apiBase}/projects/geojson`, {
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            throw new Error(`Projects GeoJSON fetch failed: ${response.status}`);
        }

        const geojson = await response.json();

        // Add GeoJSON source with clustering enabled
        if (map.getSource(SOURCE_ID)) {
            (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData(geojson);
            return;
        }

        map.addSource(SOURCE_ID, {
            type: 'geojson',
            data: geojson,
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 50,
        });

        // ─── Cluster Circles ────────────────────────────────────────────
        map.addLayer({
            id: CLUSTER_LAYER,
            type: 'circle',
            source: SOURCE_ID,
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': [
                    'step',
                    ['get', 'point_count'],
                    '#2E7FE8',  // trust-blue: 1-9
                    10,
                    '#F5A623',  // warm-earth: 10-49
                    50,
                    '#E74C3C',  // alert: 50+
                ],
                'circle-radius': [
                    'step',
                    ['get', 'point_count'],
                    18,    // radius for 1-9
                    10, 24, // radius for 10-49
                    50, 32, // radius for 50+
                ],
                'circle-stroke-width': 3,
                'circle-stroke-color': 'rgba(255, 255, 255, 0.8)',
            },
        });

        // ─── Cluster Count Labels ───────────────────────────────────────
        map.addLayer({
            id: CLUSTER_COUNT_LAYER,
            type: 'symbol',
            source: SOURCE_ID,
            filter: ['has', 'point_count'],
            layout: {
                'text-field': '{point_count_abbreviated}',
                'text-font': ['Open Sans Bold'],
                'text-size': 13,
            },
            paint: {
                'text-color': '#ffffff',
            },
        });

        // ─── Individual Project Markers ─────────────────────────────────
        map.addLayer({
            id: UNCLUSTERED_LAYER,
            type: 'circle',
            source: SOURCE_ID,
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-color': [
                    'match',
                    ['get', 'status'],
                    'published', STATUS_COLORS['published'] as string,
                    'in_progress', STATUS_COLORS['in_progress'] as string,
                    'completed', STATUS_COLORS['completed'] as string,
                    STATUS_COLORS['default'] as string,
                ],
                'circle-radius': 8,
                'circle-stroke-width': 2.5,
                'circle-stroke-color': '#ffffff',
            },
        });

        // ─── Interactions ───────────────────────────────────────────────
        setupClusterInteractions(map);
        setupMarkerInteractions(map);

    } catch (error) {
        reportError(error instanceof Error ? error : new Error('[Nammerha Map] Failed to load project markers'), { component: 'map_markers', action: 'load_markers' });
    }
}

// ─── Cluster Click → Expand ─────────────────────────────────────────────────

function setupClusterInteractions(map: maplibregl.Map): void {
    map.on('click', CLUSTER_LAYER, async (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER] });
        if (!features.length) {
            return;
        }

        const feature = features[0]!;
        const clusterId = feature.properties?.['cluster_id'] as number;
        const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;

        try {
            const zoom = await source.getClusterExpansionZoom(clusterId);
            const geometry = feature.geometry as GeoJSON.Point;
            map.easeTo({
                center: geometry.coordinates as [number, number],
                zoom,
                duration: 400,
            });
        } catch (err) {
            reportError(err instanceof Error ? err : new Error('[Nammerha Map] Cluster expansion error'), { component: 'map_markers', action: 'cluster_expand' });
        }
    });

    // Cursor change on cluster hover
    map.on('mouseenter', CLUSTER_LAYER, () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', CLUSTER_LAYER, () => {
        map.getCanvas().style.cursor = '';
    });
}

// ─── Marker Click → Popup ───────────────────────────────────────────────────

function setupMarkerInteractions(map: maplibregl.Map): void {
    map.on('click', UNCLUSTERED_LAYER, (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: [UNCLUSTERED_LAYER] });
        if (!features.length) {
            return;
        }

        const firstFeature = features[0]!;
        const props = firstFeature.properties as Record<string, unknown>;
        const geometry = firstFeature.geometry as GeoJSON.Point;
        const coords = geometry.coordinates as [number, number];

        const popup = createProjectPopup(props);
        new maplibregl.Popup({ offset: 15, maxWidth: '280px', closeButton: true })
            .setLngLat(coords)
            .setDOMContent(popup)
            .addTo(map);
    });

    // Cursor change on marker hover
    map.on('mouseenter', UNCLUSTERED_LAYER, () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', UNCLUSTERED_LAYER, () => {
        map.getCanvas().style.cursor = '';
    });
}

// ─── Popup Content Builder ──────────────────────────────────────────────────

function createProjectPopup(props: Record<string, unknown>): HTMLElement {
    const container = document.createElement('div');
    container.className = 'p-1';

    const fundedPct = Number(props['funded_percentage'] ?? 0);
    const statusLabel = getStatusLabel(String(props['status'] ?? ''));
    const statusColor = STATUS_COLORS[String(props['status'] ?? '')] ?? STATUS_COLORS['default'];

    container.innerHTML = `
        <div class="space-y-2">
            <h4 class="font-bold text-sm text-slate-900 leading-tight">
                ${escapeHtml(String(props['title'] ?? 'Untitled Project'))}
            </h4>
            ${props['address_text'] ? `<p class="text-[11px] text-slate-500">${escapeHtml(String(props['address_text']))}</p>` : ''}
            <div class="flex items-center gap-2">
                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full" 
                      style="background: ${statusColor}20; color: ${statusColor}">
                    ${statusLabel}
                </span>
                <span class="text-[10px] text-slate-400">${String(props['damage_type'] ?? '')}</span>
            </div>
            <div class="mt-2">
                <div class="flex justify-between text-[10px] mb-1">
                    <span class="text-slate-500">${t('map_funded', 'Funded')}</span>
                    <span class="font-bold text-slate-700">${fundedPct.toFixed(1)}%</span>
                </div>
                <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all" 
                         style="width: ${Math.min(fundedPct, 100)}%; background: ${statusColor}"></div>
                </div>
            </div>
            <a href="project-details.html?id=${escapeHtml(String(props['project_id'] ?? ''))}" 
               class="block mt-2 text-center text-[11px] font-bold text-trust-blue bg-trust-blue/10 
                      rounded-lg py-1.5 hover:bg-trust-blue/20 transition-colors">
                ${t('map_view_project', 'View Project')} <i class="ph ph-arrow-right" style="vertical-align:-1px"></i>
            </a>
        </div>
    `;

    return container;
}

function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
        published: t('map_status_needs_funding', '🟡 Needs Funding'),
        in_progress: t('map_status_in_progress', '🔵 In Progress'),
        completed: t('map_status_completed', '🟢 Completed'),
    };
    return labels[status] ?? status;
}

// HGH-001 FIX: Local escapeHtml removed — using centralized import from utils/xss.ts

// ─── Filter Support ─────────────────────────────────────────────────────────

/**
 * Apply a project status filter to the map layers.
 * Updates the GeoJSON source filter expression.
 */
export function applyFilter(map: maplibregl.Map, filter: ProjectFilter): void {
    if (!map.getLayer(UNCLUSTERED_LAYER)) {
        return;
    }

    let filterExpr: maplibregl.FilterSpecification;

    switch (filter) {
        case 'needs_funding':
            filterExpr = ['all', ['!', ['has', 'point_count']], ['==', ['get', 'status'], 'published']];
            break;
        case 'in_progress':
            filterExpr = ['all', ['!', ['has', 'point_count']], ['==', ['get', 'status'], 'in_progress']];
            break;
        case 'completed':
            filterExpr = ['all', ['!', ['has', 'point_count']], ['==', ['get', 'status'], 'completed']];
            break;
        default:
            filterExpr = ['!', ['has', 'point_count']];
    }

    map.setFilter(UNCLUSTERED_LAYER, filterExpr);
}

// ─── Stats Extraction ───────────────────────────────────────────────────────

/**
 * Count projects by status from the loaded GeoJSON source.
 * Used to update the "Active Region" overlay on the homepage.
 */
export function getProjectStats(
    map: maplibregl.Map,
): { total: number; inProgress: number; funded: number; completed: number } {
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!source) {
        return { total: 0, inProgress: 0, funded: 0, completed: 0 };
    }

    // Query all rendered features (visible in viewport)
    const features = map.queryRenderedFeatures(undefined, { layers: [UNCLUSTERED_LAYER] });

    let inProgress = 0;
    let funded = 0;
    let completed = 0;

    features.forEach((f) => {
        const status = f.properties?.['status'];
        if (status === 'in_progress') {
            inProgress++;
        } else if (status === 'published') {
            funded++;
        } else if (status === 'completed') {
            completed++;
        }
    });

    return { total: features.length, inProgress, funded, completed };
}
