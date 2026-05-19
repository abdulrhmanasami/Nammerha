// ============================================================================
// Nammerha Frontend — Map Controls
// Navigation, Geolocation, and Filter Controls for MapLibre
// ============================================================================
import maplibregl from 'maplibre-gl';
import { t } from './i18n-bridge';

/**
 * Add standard navigation and interaction controls to the map.
 * - NavigationControl: zoom buttons + compass
 * - GeolocateControl: locate user position (for engineers/contractors in-field)
 * - ScaleControl: distance reference bar
 */
export function addStandardControls(map: maplibregl.Map): void {
  // Navigation (zoom + compass) — top-right
  map.addControl(
    new maplibregl.NavigationControl({
      showCompass: true,
      showZoom: true,
      visualizePitch: false,
    }),
    'top-right',
  );

  // Geolocation — below navigation
  map.addControl(
    new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
    }),
    'top-right',
  );

  // Scale bar — bottom-right
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 150, unit: 'metric' }), 'bottom-right');
}

// ─── Custom Filter Control ──────────────────────────────────────────────────

export type ProjectFilter = 'all' | 'needs_funding' | 'in_progress' | 'completed';

/**
 * Create a DOM-based filter control for the project layer.
 * Returns the container element (caller mounts it in the map wrapper).
 *
 * @param onFilterChange Callback fired when the user selects a filter
 */
export function createFilterControl(onFilterChange: (filter: ProjectFilter) => void): HTMLElement {
  const container = document.createElement('div');
  container.className = 'map-filter-control glass-card p-2 rounded-xl flex gap-1';

  const filters: { label: string; value: ProjectFilter; i18nKey: string }[] = [
    { label: t('filter_all', 'الكل'), value: 'all', i18nKey: 'filter_all' },
    {
      label: t('filter_needs_funding', 'بحاجة لتمويل'),
      value: 'needs_funding',
      i18nKey: 'filter_needs_funding',
    },
    {
      label: t('filter_in_progress', 'قيد التنفيذ'),
      value: 'in_progress',
      i18nKey: 'filter_in_progress',
    },
    { label: t('filter_completed', 'مكتمل'), value: 'completed', i18nKey: 'filter_completed' },
  ];

  filters.forEach((f, idx) => {
    const btn = document.createElement('button');
    btn.className = `text-3xs font-bold px-2.5 py-1 rounded-lg transition-all ${
      idx === 0 ? 'bg-trust-blue text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
    }`;
    btn.textContent = f.label;
    btn.dataset.filter = f.value;
    btn.dataset.i18n = f.i18nKey;

    btn.addEventListener('click', () => {
      // Update active state
      container.querySelectorAll('button').forEach((b) => {
        b.className =
          'text-3xs font-bold px-2.5 py-1 rounded-lg transition-all text-slate-500 hover:bg-slate-100';
      });
      btn.className =
        'text-3xs font-bold px-2.5 py-1 rounded-lg transition-all bg-trust-blue text-white shadow-sm';

      onFilterChange(f.value);
    });

    container.appendChild(btn);
  });

  return container;
}
