// ============================================================================
// Nammerha Frontend — Homepage Map Integration
// Initializes the interactive reconstruction map on the landing page
// ============================================================================
import type maplibregl from 'maplibre-gl';
import { initMap } from '../map/map-core';
import { loadProjectMarkers, getProjectStats, applyFilter } from '../map/map-markers';
import { addStandardControls, createFilterControl } from '../map/map-controls';
import { t, tParams } from '../map/i18n-bridge';
import { reportWarning } from '../error-reporter';
import { showToast } from '../utils/toast';
import { escapeHtml as esc } from '../utils/xss';
// GAP-002 + GAP-005 + GAP-010 FIX: Infrastructure wiring
import { initPullToRefresh } from '../utils/pull-refresh';
import { autoTriggerTour } from '../components/tour-engine';
import { initBackToTop } from '../components/back-to-top';
initPullToRefresh();
initBackToTop();
autoTriggerTour();

/**
 * Boot the interactive reconstruction map on the homepage.
 * Replaces the static placeholder with a live MapLibre GL JS instance.
 */
async function initHomepageMap(): Promise<void> {
    const container = document.getElementById('main-map');
    if (!container) {
        reportWarning('#main-map container not found — skipping map init', { component: 'homepage_map', action: 'init' });
        return;
    }

    // PLAT-FR-001 FIX: Geolocation Deadlock Prevention
    // If the map fails to fetch tiles or locks, this fallback ensures
    // the UI doesn't hang infinitely on "Detecting active region...".
    const regionEl = document.getElementById('map-active-region');
    const countEl = document.getElementById('map-active-count');
    const loadGuard = setTimeout(() => {
        if (regionEl) {regionEl.textContent = t('map_region_syria', 'Syrian Recovery Grid');}
        if (countEl && countEl.textContent?.includes('…')) {countEl.textContent = t('map_projects_syncing', 'Syncing Data...');}
    }, 4000);

    try {
        // ─── Initialize Map ─────────────────────────────────────────────────
        const map = await initMap({
            container: 'main-map',
            interactive: true,
            attribution: false,
        });

        // ─── Add Controls ───────────────────────────────────────────────────
        addStandardControls(map);

        // ─── Load Data on Map Ready ─────────────────────────────────────────
        map.on('load', async () => {
            clearTimeout(loadGuard);
            try {
                await loadProjectMarkers(map);
                updateStatsOverlay(map);

                // ─── Filter Control ─────────────────────────────────────────────
                const filterEl = createFilterControl((filter) => {
                    applyFilter(map, filter);
                });
                const filterMountPoint = document.getElementById('map-filter-container');
                if (filterMountPoint) {
                    filterMountPoint.appendChild(filterEl);
                }
            } catch (err) {
                reportWarning('Map data load failed', { component: 'homepage_map', action: 'load_markers', error: String(err) });
                // W13-004 FIX: Show user-facing feedback on marker load failure.
                showToast(t('map_data_error', 'Failed to load project markers.'));
            }
        });

        // ─── Update stats when map moves ────────────────────────────────────
        map.on('moveend', () => {
            updateStatsOverlay(map);
        });
    } catch (err) {
        reportWarning('Map initialization failed', { component: 'homepage_map', action: 'init_map', error: String(err) });
        // W13-004 FIX: Show error in map container when map fails to initialize.
        if (container) {
            container.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-slate-400 p-8 dark:text-slate-500">
                <i class="ph ph-map-trifold text-3xl" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-medium">${esc(t('map_init_error', 'Map could not be loaded'))}</p>
            </div>`;
        }
    }
}

/**
 * Update the "Active Region" and "Active Projects" overlay with live data.
 */
function updateStatsOverlay(map: maplibregl.Map): void {
    const stats = getProjectStats(map);

    const regionEl = document.getElementById('map-active-region');
    const countEl = document.getElementById('map-active-count');

    if (regionEl) {
        const center = map.getCenter();
        regionEl.textContent = getRegionName(center.lat, center.lng, map.getZoom());
    }

    if (countEl) {
        const total = stats.total + stats.inProgress + stats.completed;
        countEl.textContent = tParams('map_active_projects_count', `${total} Active Projects`, { count: total });
    }
}

/**
 * i18n-aware region name resolver based on lat/lng coordinates.
 * Provides localized names for major Syrian governorates.
 */
function getRegionName(lat: number, lng: number, zoom: number): string {
    if (zoom < 8) {
        return t('map_region_syria', 'Syria');
    }

    // Major city approximations with their i18n keys
    const cities: { i18nKey: string; fallback: string; lat: number; lng: number }[] = [
        { i18nKey: 'map_region_damascus', fallback: 'Damascus', lat: 33.51, lng: 36.28 },
        { i18nKey: 'map_region_aleppo', fallback: 'Aleppo', lat: 36.20, lng: 37.15 },
        { i18nKey: 'map_region_homs', fallback: 'Homs', lat: 34.73, lng: 36.72 },
        { i18nKey: 'map_region_hama', fallback: 'Hama', lat: 35.13, lng: 36.75 },
        { i18nKey: 'map_region_lattakia', fallback: 'Lattakia', lat: 35.52, lng: 35.79 },
        { i18nKey: 'map_region_deir_ez_zor', fallback: 'Deir ez-Zor', lat: 35.33, lng: 40.14 },
        { i18nKey: 'map_region_raqqa', fallback: 'Raqqa', lat: 35.95, lng: 39.01 },
        { i18nKey: 'map_region_daraa', fallback: 'Daraa', lat: 32.63, lng: 36.10 },
        { i18nKey: 'map_region_idlib', fallback: 'Idlib', lat: 35.93, lng: 36.63 },
        { i18nKey: 'map_region_hasakah', fallback: 'Al-Hasakah', lat: 36.50, lng: 40.74 },
    ];

    let nearest = cities[0]!;
    let minDist = Infinity;

    cities.forEach((city) => {
        const dist = Math.hypot(lat - city.lat, lng - city.lng);
        if (dist < minDist) {
            minDist = dist;
            nearest = city;
        }
    });

    return t(nearest.i18nKey, nearest.fallback);
}

// ─── Initialize when DOM is ready ───────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHomepageMap);
} else {
    initHomepageMap();
}
