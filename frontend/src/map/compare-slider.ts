// ============================================================================
// Nammerha Frontend — Compare Slider Module
// Before/After satellite imagery comparison using MapLibre GL Compare
// P1-CMP-01 FIX: All visual styles moved to CSS (.nm-compare-* classes in main.css).
//   Previous: 6× `style.cssText` blocks — 100+ lines of inline CSS, hardcoded
//   physical properties (left/right), no dark mode, no RTL support.
//   Now: CSS-only. TS handles only DOM structure and dynamic % positioning.
//   Standard: P1-SST-001, CSS Logical Properties (RTL-safe), dark mode tokens.
// ============================================================================
import maplibregl from 'maplibre-gl';
import { escapeHtml } from '../utils/xss';

// ─── Constants ──────────────────────────────────────────────────────────────

const COMPARE_CONTAINER_ID = 'georavity-compare-container';
const COMPARE_LEFT_ID = 'georavity-compare-left';
const COMPARE_RIGHT_ID = 'georavity-compare-right';

// ─── State ──────────────────────────────────────────────────────────────────

interface CompareState {
    container: HTMLDivElement | null;
    leftMap: maplibregl.Map | null;
    rightMap: maplibregl.Map | null;
    slider: HTMLDivElement | null;
    clipDiv: HTMLDivElement | null;
    isActive: boolean;
    isDragging: boolean;
}

const state: CompareState = {
    container: null,
    leftMap: null,
    rightMap: null,
    slider: null,
    clipDiv: null,
    isActive: false,
    isDragging: false,
};

// ─── Public API ─────────────────────────────────────────────────────────────

export interface CompareConfig {
    /** Container element to mount the compare slider into */
    container: HTMLElement;
    /** MapLibre style URL for the base map */
    styleUrl: string;
    /** Center coordinates [lng, lat] */
    center: [number, number];
    /** Zoom level */
    zoom: number;
    /** URL for the "before" satellite image overlay */
    beforeImageUrl: string;
    /** URL for the "after" satellite image overlay */
    afterImageUrl: string;
    /** Bounding box for the image overlay [[west, south], [east, north]] */
    imageBounds: [[number, number], [number, number]];
    /** Before label text */
    beforeLabel?: string;
    /** After label text */
    afterLabel?: string;
}

/**
 * Initialize a before/after comparison slider.
 * Creates two synchronized MapLibre maps with image overlays
 * and a draggable divider between them.
 *
 * P1-CMP-01: All visual styling via CSS classes (.nm-compare-*).
 * TS only manages DOM structure and dynamic percentage positioning.
 */
export function initCompareSlider(config: CompareConfig): void {
    // Cleanup any existing instance
    destroyCompareSlider();

    // Create container structure — P1-CMP-01: CSS classes, no inline styles
    const container = document.createElement('div');
    container.id = COMPARE_CONTAINER_ID;
    container.className = 'nm-compare';

    // Left map container (before) — full-width base layer
    const leftDiv = document.createElement('div');
    leftDiv.id = COMPARE_LEFT_ID;
    leftDiv.className = 'nm-compare__panel';

    // Right map container (after) — clipped overlay
    const rightDiv = document.createElement('div');
    rightDiv.id = COMPARE_RIGHT_ID;
    rightDiv.className = 'nm-compare__clip';

    // Slider handle — draggable divider line
    const slider = document.createElement('div');
    slider.className = 'nm-compare__divider';

    // Slider knob — centered grab indicator
    const knob = document.createElement('div');
    knob.className = 'nm-compare__knob';
    knob.textContent = '⟺';
    slider.appendChild(knob);

    container.appendChild(leftDiv);
    container.appendChild(rightDiv);
    container.appendChild(slider);

    // Labels — P1-CMP-01: RTL-safe via inset-inline-start/end in CSS
    if (config.beforeLabel) {
        const beforeLabel = document.createElement('div');
        beforeLabel.className = 'nm-compare__label nm-compare__label--before';
        beforeLabel.textContent = escapeHtml(config.beforeLabel);
        container.appendChild(beforeLabel);
    }

    if (config.afterLabel) {
        const afterLabel = document.createElement('div');
        afterLabel.className = 'nm-compare__label nm-compare__label--after';
        afterLabel.textContent = escapeHtml(config.afterLabel);
        container.appendChild(afterLabel);
    }

    config.container.appendChild(container);

    // Initialize maps
    const leftMap = new maplibregl.Map({
        container: leftDiv,
        style: config.styleUrl,
        center: config.center,
        zoom: config.zoom,
        interactive: true,
    });

    const rightMapInner = new maplibregl.Map({
        container: rightDiv,
        style: config.styleUrl,
        center: config.center,
        zoom: config.zoom,
        interactive: false,  // Controlled via sync
    });

    // Add image overlays when maps load
    leftMap.on('load', () => {
        addImageOverlay(leftMap, 'before-overlay', config.beforeImageUrl, config.imageBounds);
    });

    rightMapInner.on('load', () => {
        addImageOverlay(rightMapInner, 'after-overlay', config.afterImageUrl, config.imageBounds);
    });

    // Synchronize right map to left map movements
    leftMap.on('move', () => {
        rightMapInner.jumpTo({
            center: leftMap.getCenter(),
            zoom: leftMap.getZoom(),
            bearing: leftMap.getBearing(),
            pitch: leftMap.getPitch(),
        });
    });

    // Slider drag logic — P1-CMP-01: Uses CSS class for cursor lock
    setupSliderInteraction(container, slider, rightDiv);

    // Store state
    state.container = container;
    state.leftMap = leftMap;
    state.rightMap = rightMapInner;
    state.slider = slider;
    state.clipDiv = rightDiv;
    state.isActive = true;
}

/**
 * Destroy the compare slider and cleanup resources.
 */
export function destroyCompareSlider(): void {
    if (state.leftMap) {
        state.leftMap.remove();
        state.leftMap = null;
    }
    if (state.rightMap) {
        state.rightMap.remove();
        state.rightMap = null;
    }
    if (state.container) {
        state.container.remove();
        state.container = null;
    }
    state.slider = null;
    state.clipDiv = null;
    state.isActive = false;
    state.isDragging = false;
    // P1-CMP-01: Ensure cursor class is removed on destroy
    document.body.classList.remove('nm-compare-dragging');
}

/**
 * Check if the compare slider is currently active.
 */
export function isCompareActive(): boolean {
    return state.isActive;
}

// ─── Slider Interaction ─────────────────────────────────────────────────────
// P1-CMP-01: Encapsulated slider drag logic. Uses CSS class toggle for
// cursor lock instead of `document.body.style.cursor`.

function setupSliderInteraction(
    container: HTMLDivElement,
    slider: HTMLDivElement,
    clipDiv: HTMLDivElement,
): void {
    const onPointerDown = (_e: PointerEvent): void => {
        state.isDragging = true;
        // P1-CMP-01 FIX: CSS class instead of document.body.style.cursor
        document.body.classList.add('nm-compare-dragging');
    };

    const onPointerMove = (e: PointerEvent): void => {
        if (!state.isDragging) {
            return;
        }
        const rect = container.getBoundingClientRect();
        const isRtl = document.documentElement.getAttribute('dir') === 'rtl';

        // P1-CMP-01 FIX: RTL-aware position calculation
        let x: number;
        if (isRtl) {
            x = Math.max(0, Math.min(rect.right - e.clientX, rect.width));
        } else {
            x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        }
        const pct = (x / rect.width) * 100;

        // Only dynamic values — position percentage — are set via JS
        slider.style.insetInlineStart = `${pct}%`;
        clipDiv.style.width = `${pct}%`;
    };

    const onPointerUp = (): void => {
        state.isDragging = false;
        // P1-CMP-01 FIX: CSS class instead of document.body.style.cursor
        document.body.classList.remove('nm-compare-dragging');
    };

    slider.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function addImageOverlay(
    map: maplibregl.Map,
    sourceId: string,
    imageUrl: string,
    bounds: [[number, number], [number, number]],
): void {
    const [[west, south], [east, north]] = bounds;

    map.addSource(sourceId, {
        type: 'image',
        url: imageUrl,
        coordinates: [
            [west, north],   // top-left
            [east, north],   // top-right
            [east, south],   // bottom-right
            [west, south],   // bottom-left
        ],
    });

    map.addLayer({
        id: `${sourceId}-layer`,
        type: 'raster',
        source: sourceId,
        paint: {
            'raster-opacity': 0.9,
        },
    });
}
