// ============================================================================
// Nammerha Frontend — Compare Slider Module
// Before/After satellite imagery comparison using MapLibre GL Compare
// ============================================================================
import maplibregl from 'maplibre-gl';

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
    isActive: boolean;
    isDragging: boolean;
}

const state: CompareState = {
    container: null,
    leftMap: null,
    rightMap: null,
    slider: null,
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
 */
export function initCompareSlider(config: CompareConfig): void {
    // Cleanup any existing instance
    destroyCompareSlider();

    // Create container structure
    const container = document.createElement('div');
    container.id = COMPARE_CONTAINER_ID;
    container.style.cssText = `
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        border-radius: 12px;
    `;

    // Left map container (before)
    const leftDiv = document.createElement('div');
    leftDiv.id = COMPARE_LEFT_ID;
    leftDiv.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
    `;

    // Right map container (after)
    const rightDiv = document.createElement('div');
    rightDiv.id = COMPARE_RIGHT_ID;
    rightDiv.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 50%;
        height: 100%;
        overflow: hidden;
    `;

    // Slider handle
    const slider = document.createElement('div');
    slider.style.cssText = `
        position: absolute;
        top: 0;
        left: 50%;
        width: 4px;
        height: 100%;
        background: white;
        cursor: ew-resize;
        z-index: 10;
        transform: translateX(-50%);
        box-shadow: 0 0 8px rgba(0, 0, 0, 0.3);
    `;

    // Slider knob
    const knob = document.createElement('div');
    knob.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 36px;
        height: 36px;
        background: white;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        color: #334155;
        pointer-events: none;
    `;
    knob.innerHTML = '⟺';
    slider.appendChild(knob);

    container.appendChild(leftDiv);
    container.appendChild(rightDiv);
    container.appendChild(slider);

    // Labels
    if (config.beforeLabel || config.afterLabel) {
        const labelStyle = `
            position: absolute;
            top: 16px;
            padding: 4px 12px;
            background: rgba(0, 0, 0, 0.6);
            color: white;
            font-size: 13px;
            font-weight: 500;
            border-radius: 4px;
            z-index: 5;
            pointer-events: none;
        `;

        if (config.beforeLabel) {
            const beforeLabel = document.createElement('div');
            beforeLabel.style.cssText = labelStyle + 'left: 16px;';
            beforeLabel.textContent = config.beforeLabel;
            container.appendChild(beforeLabel);
        }

        if (config.afterLabel) {
            const afterLabel = document.createElement('div');
            afterLabel.style.cssText = labelStyle + 'right: 16px;';
            afterLabel.textContent = config.afterLabel;
            container.appendChild(afterLabel);
        }
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

    // Slider drag logic
    const onPointerDown = (_e: PointerEvent): void => {
        state.isDragging = true;
        document.body.style.cursor = 'ew-resize';
    };

    const onPointerMove = (e: PointerEvent): void => {
        if (!state.isDragging) {
            return;
        }
        const rect = container.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const pct = (x / rect.width) * 100;

        slider.style.left = `${pct}%`;
        rightDiv.style.width = `${pct}%`;
    };

    const onPointerUp = (): void => {
        state.isDragging = false;
        document.body.style.cursor = '';
    };

    slider.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);

    // Store state
    state.container = container;
    state.leftMap = leftMap;
    state.rightMap = rightMapInner;
    state.slider = slider;
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
    state.isActive = false;
    state.isDragging = false;
}

/**
 * Check if the compare slider is currently active.
 */
export function isCompareActive(): boolean {
    return state.isActive;
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
