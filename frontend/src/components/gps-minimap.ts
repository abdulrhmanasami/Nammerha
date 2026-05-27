// ============================================================================
// Nammerha Frontend — GPS Mini-Map Preview Component
// CRIT-UX-010 FIX: Visual GPS preview for engineer camera page.
// Previous: GPS coordinates displayed as plain text (e.g., "34.0000° N, 36.0000° E").
// Engineers had no visual reference of WHERE they were standing on a map.
// On Syrian 3G, they couldn't verify if GPS was accurate before capturing.
// Now: Live mini-map using OpenStreetMap tiles shows current position with a
// pulsing marker. Accuracy circle visualizes GPS precision. Zero API keys.
// Standard: Nielsen #1 (System Status), FinTech GPS Verification, Offline-First.
// ============================================================================

import { t } from '../utils/i18n';
import { escapeHtml as esc } from '../utils/xss';

// ─── OpenStreetMap Tile URL (Zero API Keys — AGENTS.md mandates OSM) ────────
const OSM_TILE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_ZOOM = 17; // Street-level zoom for construction sites

/**
 * GPS Mini-Map state
 */
interface MiniMapState {
  container: HTMLElement;
  imgEl: HTMLImageElement;
  markerEl: HTMLElement;
  accuracyEl: HTMLElement;
  coordsEl: HTMLElement;
  lastLat: number | null;
  lastLng: number | null;
  lastAccuracy: number | null;
}

let mapState: MiniMapState | null = null;

/**
 * Convert lat/lng to tile coordinates for a given zoom level.
 * Standard Slippy Map tilenames algorithm (OSM wiki).
 */
function latLngToTile(
  lat: number,
  lng: number,
  zoom: number,
): { x: number; y: number; fracX: number; fracY: number } {
  const n = Math.pow(2, zoom);
  const xFloat = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yFloat = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return {
    x: Math.floor(xFloat),
    y: Math.floor(yFloat),
    fracX: xFloat - Math.floor(xFloat),
    fracY: yFloat - Math.floor(yFloat),
  };
}

/**
 * Create the mini-map container and inject it into the specified mount point.
 */
export function createGPSMiniMap(mountPointId: string): void {
  const mount = document.getElementById(mountPointId);
  if (!mount) {return;}

  // Prevent duplicates
  if (document.getElementById('nm-gps-minimap')) {return;}

  const container = document.createElement('div');
  container.id = 'nm-gps-minimap';
  container.className = 'nm-minimap';
  container.setAttribute('role', 'img');
  container.setAttribute('aria-label', t('cam_gps_map', 'معاينة الموقع على الخريطة'));

  container.innerHTML = `
    <div class="nm-minimap-tile">
      <img id="nm-minimap-img" class="nm-minimap-img" alt="" loading="eager" />
      <div id="nm-minimap-accuracy" class="nm-minimap-accuracy"></div>
      <div id="nm-minimap-marker" class="nm-minimap-marker">
        <div class="nm-minimap-marker-pulse"></div>
        <div class="nm-minimap-marker-dot"></div>
      </div>
    </div>
    <div class="nm-minimap-footer">
      <div class="nm-minimap-coords" id="nm-minimap-coords">
        <i class="ph ph-map-pin text-xs" aria-hidden="true"></i>
        <span>${esc(t('cam_waiting_gps', 'في انتظار GPS...'))}</span>
      </div>
      <div class="nm-minimap-badge" id="nm-minimap-badge">
        <i class="ph ph-crosshair text-xs" aria-hidden="true"></i>
        <span>—</span>
      </div>
    </div>
  `;

  mount.appendChild(container);

  mapState = {
    container,
    imgEl: container.querySelector('#nm-minimap-img') as HTMLImageElement,
    markerEl: container.querySelector('#nm-minimap-marker') as HTMLElement,
    accuracyEl: container.querySelector('#nm-minimap-accuracy') as HTMLElement,
    coordsEl: container.querySelector('#nm-minimap-coords') as HTMLElement,
    lastLat: null,
    lastLng: null,
    lastAccuracy: null,
  };
}

/**
 * Update the mini-map with new GPS coordinates.
 * Call this whenever GPS position changes (from watchPosition callback).
 */
export function updateGPSMiniMap(lat: number, lng: number, accuracy: number): void {
  if (!mapState) {return;}

  // Avoid redundant redraws for tiny position changes (< ~1 meter)
  if (
    mapState.lastLat !== null &&
    mapState.lastLng !== null &&
    Math.abs(lat - mapState.lastLat) < 0.00001 &&
    Math.abs(lng - mapState.lastLng) < 0.00001
  ) {
    // Just update accuracy if it changed
    if (mapState.lastAccuracy !== accuracy) {
      updateAccuracyDisplay(accuracy);
      mapState.lastAccuracy = accuracy;
    }
    return;
  }

  mapState.lastLat = lat;
  mapState.lastLng = lng;
  mapState.lastAccuracy = accuracy;

  // Update tile image
  const tile = latLngToTile(lat, lng, DEFAULT_ZOOM);
  const tileUrl = OSM_TILE.replace('{z}', String(DEFAULT_ZOOM))
    .replace('{x}', String(tile.x))
    .replace('{y}', String(tile.y));

  mapState.imgEl.src = tileUrl;
  mapState.imgEl.alt = `GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;

  // Position marker at the fractional position within the tile
  mapState.markerEl.style.setProperty('--marker-x', `${tile.fracX * 100}%`);
  mapState.markerEl.style.setProperty('--marker-y', `${tile.fracY * 100}%`);

  // Update coords display
  mapState.coordsEl.innerHTML = `
    <i class="ph ph-map-pin text-xs" aria-hidden="true"></i>
    <span>${esc(`${lat.toFixed(5)}°, ${lng.toFixed(5)}°`)}</span>
  `;

  // Update accuracy
  updateAccuracyDisplay(accuracy);

  // Show the map (it might have been in loading state)
  mapState.container.classList.add('nm-minimap--active');
}

/**
 * Update accuracy circle and badge.
 */
function updateAccuracyDisplay(accuracy: number): void {
  if (!mapState) {return;}

  // Accuracy badge
  const badgeEl = mapState.container.querySelector('#nm-minimap-badge');
  if (badgeEl) {
    const isGood = accuracy <= 15;
    const isFair = accuracy <= 50;
    const qualityClass = isGood ? 'nm-gps-good' : isFair ? 'nm-gps-fair' : 'nm-gps-poor';
    const qualityLabel = isGood
      ? t('cam_gps_excellent', 'ممتاز')
      : isFair
        ? t('cam_gps_fair', 'مقبول')
        : t('cam_gps_poor', 'ضعيف');

    badgeEl.className = `nm-minimap-badge ${qualityClass}`;
    badgeEl.innerHTML = `
      <i class="ph ph-crosshair text-xs" aria-hidden="true"></i>
      <span>±${accuracy.toFixed(0)}m · ${esc(qualityLabel)}</span>
    `;
  }

  // Accuracy circle size — scale based on zoom level
  // At zoom 17, 1 tile ≈ 305 meters. Accuracy circle should be proportional.
  const tileMeters = 305; // approximate meters per tile at zoom 17 in Syria (~34°N)
  const tilePx = 256; // standard OSM tile size
  const accuracyPx = Math.min(Math.max((accuracy / tileMeters) * tilePx, 8), 120);
  mapState.accuracyEl.style.setProperty('--accuracy-size', `${accuracyPx}px`);

  // Position accuracy circle at same location as marker
  if (mapState.lastLat !== null && mapState.lastLng !== null) {
    const tile = latLngToTile(mapState.lastLat, mapState.lastLng, DEFAULT_ZOOM);
    mapState.accuracyEl.style.setProperty('--marker-x', `${tile.fracX * 100}%`);
    mapState.accuracyEl.style.setProperty('--marker-y', `${tile.fracY * 100}%`);
  }
}

/**
 * Show GPS error state on the mini-map.
 */
export function showGPSError(message: string): void {
  if (!mapState) {return;}

  mapState.coordsEl.innerHTML = `
    <i class="ph ph-warning-circle text-xs" aria-hidden="true"></i>
    <span>${esc(message)}</span>
  `;
  mapState.container.classList.add('nm-minimap--error');
}
