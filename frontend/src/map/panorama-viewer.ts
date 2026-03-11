// ============================================================================
// Nammerha Frontend — Panorama Viewer Module
// 360° panoramic image viewer for ground-truth verification
// ============================================================================
import { escapeHtml } from '../utils/xss';
// ─── Types ──────────────────────────────────────────────────────────────────

export interface PanoramaConfig {
    /** Container element to mount the viewer into */
    container: HTMLElement;
    /** URL to the equirectangular panorama image */
    imageUrl: string;
    /** Initial heading in degrees (0-360) */
    heading?: number;
    /** Initial pitch in degrees (-90 to 90) */
    pitch?: number;
    /** Horizontal field of view (default: 100) */
    hfov?: number;
    /** Auto-rotate speed (degrees per second, 0 = disabled) */
    autoRotateSpeed?: number;
    /** Show compass indicator */
    showCompass?: boolean;
    /** Title overlay text */
    title?: string;
    /** GPS coordinates for display (informational only) */
    gpsCoords?: { lat: number; lng: number };
    /** Capture timestamp for display */
    capturedAt?: string;
}

// ─── State ──────────────────────────────────────────────────────────────────

interface PanoramaState {
    container: HTMLElement | null;
    canvas: HTMLCanvasElement | null;
    isActive: boolean;
    isDragging: boolean;
    heading: number;
    pitch: number;
    hfov: number;
    autoRotateSpeed: number;
    lastMouseX: number;
    lastMouseY: number;
    autoRotateTimer: ReturnType<typeof requestAnimationFrame> | null;
    image: HTMLImageElement | null;
}

const state: PanoramaState = {
    container: null,
    canvas: null,
    isActive: false,
    isDragging: false,
    heading: 0,
    pitch: 0,
    hfov: 100,
    autoRotateSpeed: 0,
    lastMouseX: 0,
    lastMouseY: 0,
    autoRotateTimer: null,
    image: null,
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Initialize the 360° panorama viewer.
 * Renders an equirectangular image in a spherical projection
 * with interactive mouse/touch panning.
 */
export function initPanoramaViewer(config: PanoramaConfig): void {
    // Cleanup any existing instance
    destroyPanoramaViewer();

    state.heading = config.heading ?? 0;
    state.pitch = config.pitch ?? 0;
    state.hfov = config.hfov ?? 100;
    state.autoRotateSpeed = config.autoRotateSpeed ?? 0;

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        position: relative;
        width: 100%;
        height: 100%;
        background: #0a0a0a;
        border-radius: 12px;
        overflow: hidden;
        cursor: grab;
    `;

    // Canvas for rendering
    const canvas = document.createElement('canvas');
    canvas.style.cssText = `
        width: 100%;
        height: 100%;
        display: block;
    `;
    wrapper.appendChild(canvas);

    // Info overlay
    const infoOverlay = createInfoOverlay(config);
    if (infoOverlay) {
        wrapper.appendChild(infoOverlay);
    }

    // Controls overlay
    const controls = createControlsOverlay();
    wrapper.appendChild(controls);

    config.container.appendChild(wrapper);

    // Set canvas resolution
    const rect = wrapper.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;

    state.container = wrapper;
    state.canvas = canvas;

    // Load panorama image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        state.image = img;
        state.isActive = true;
        render();

        if (state.autoRotateSpeed > 0) {
            startAutoRotate();
        }
    };
    img.onerror = () => {
        console.error('[Panorama] Failed to load image:', config.imageUrl);
        const errorMsg = document.createElement('div');
        errorMsg.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #ef4444;
            font-size: 14px;
            text-align: center;
        `;
        errorMsg.textContent = 'فشل تحميل صورة البانوراما';
        wrapper.appendChild(errorMsg);
    };
    img.src = config.imageUrl;

    // Mouse/touch interaction
    setupInteraction(wrapper);
}

/**
 * Destroy the panorama viewer and cleanup resources.
 */
export function destroyPanoramaViewer(): void {
    if (state.autoRotateTimer !== null) {
        cancelAnimationFrame(state.autoRotateTimer);
        state.autoRotateTimer = null;
    }
    if (state.container) {
        state.container.remove();
    }
    state.container = null;
    state.canvas = null;
    state.image = null;
    state.isActive = false;
    state.isDragging = false;
}

/**
 * Check if the panorama viewer is currently active.
 */
export function isPanoramaActive(): boolean {
    return state.isActive;
}

/**
 * Programmatically set the view direction.
 */
export function setView(heading: number, pitch: number): void {
    state.heading = heading % 360;
    state.pitch = Math.max(-85, Math.min(85, pitch));
    render();
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function render(): void {
    if (!state.canvas || !state.image) {
        return;
    }

    const ctx = state.canvas.getContext('2d');
    if (!ctx) {
        return;
    }

    const w = state.canvas.width;
    const h = state.canvas.height;
    const imgW = state.image.width;
    const imgH = state.image.height;

    // Equirectangular projection mapping
    // Maps the panorama heading to a horizontal offset in the source image
    const headingRatio = ((state.heading % 360) + 360) % 360 / 360;
    const pitchRatio = (state.pitch + 90) / 180;

    // Calculate source rectangle based on FOV
    const fovRatio = state.hfov / 360;
    const aspectRatio = w / h;
    const srcW = imgW * fovRatio;
    const srcH = srcW / aspectRatio;

    const srcX = (headingRatio * imgW - srcW / 2 + imgW) % imgW;
    const srcY = (1 - pitchRatio) * imgH - srcH / 2;

    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    // Draw the panorama section
    // Handle wrap-around for the equirectangular image
    const clampedSrcY = Math.max(0, Math.min(imgH - srcH, srcY));

    if (srcX + srcW <= imgW) {
        // No wrap-around needed
        ctx.drawImage(
            state.image,
            srcX, clampedSrcY, srcW, srcH,
            0, 0, w, h,
        );
    } else {
        // Wrap-around: draw in two parts
        const rightW = imgW - srcX;
        const leftW = srcW - rightW;
        const splitRatio = rightW / srcW;

        ctx.drawImage(
            state.image,
            srcX, clampedSrcY, rightW, srcH,
            0, 0, w * splitRatio, h,
        );
        ctx.drawImage(
            state.image,
            0, clampedSrcY, leftW, srcH,
            w * splitRatio, 0, w * (1 - splitRatio), h,
        );
    }
}

// ─── Interaction ────────────────────────────────────────────────────────────

function setupInteraction(element: HTMLElement): void {
    element.addEventListener('pointerdown', (e: PointerEvent) => {
        state.isDragging = true;
        state.lastMouseX = e.clientX;
        state.lastMouseY = e.clientY;
        element.style.cursor = 'grabbing';

        if (state.autoRotateTimer !== null) {
            cancelAnimationFrame(state.autoRotateTimer);
            state.autoRotateTimer = null;
        }
    });

    document.addEventListener('pointermove', (e: PointerEvent) => {
        if (!state.isDragging) {
            return;
        }

        const dx = e.clientX - state.lastMouseX;
        const dy = e.clientY - state.lastMouseY;

        state.heading -= dx * 0.3;
        state.pitch += dy * 0.2;
        state.pitch = Math.max(-85, Math.min(85, state.pitch));

        state.lastMouseX = e.clientX;
        state.lastMouseY = e.clientY;

        render();
    });

    document.addEventListener('pointerup', () => {
        if (state.isDragging) {
            state.isDragging = false;
            element.style.cursor = 'grab';
        }
    });

    // Mouse wheel zoom
    element.addEventListener('wheel', (e: WheelEvent) => {
        e.preventDefault();
        state.hfov = Math.max(30, Math.min(120, state.hfov + e.deltaY * 0.05));
        render();
    }, { passive: false });
}

// ─── Auto-Rotate ────────────────────────────────────────────────────────────

function startAutoRotate(): void {
    let lastTime = performance.now();

    function tick(now: number): void {
        if (!state.isActive || state.isDragging) {
            state.autoRotateTimer = requestAnimationFrame(tick);
            return;
        }

        const dt = (now - lastTime) / 1000;
        lastTime = now;

        state.heading += state.autoRotateSpeed * dt;
        render();

        state.autoRotateTimer = requestAnimationFrame(tick);
    }

    state.autoRotateTimer = requestAnimationFrame(tick);
}

// ─── UI Components ──────────────────────────────────────────────────────────

function createInfoOverlay(config: PanoramaConfig): HTMLDivElement | null {
    if (!config.title && !config.gpsCoords && !config.capturedAt) {
        return null;
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: absolute;
        top: 16px;
        left: 16px;
        padding: 8px 14px;
        background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(4px);
        color: white;
        font-size: 12px;
        border-radius: 8px;
        z-index: 5;
        pointer-events: none;
        max-width: 280px;
    `;

    let html = '';

    if (config.title) {
        html += `<div style="font-weight: 600; font-size: 13px; margin-bottom: 4px;">${escapeHtml(config.title)}</div>`;
    }

    if (config.gpsCoords) {
        html += `<div style="opacity: 0.8;">📍 ${config.gpsCoords.lat.toFixed(6)}, ${config.gpsCoords.lng.toFixed(6)}</div>`;
    }

    if (config.capturedAt) {
        html += `<div style="opacity: 0.8;">📅 ${escapeHtml(config.capturedAt)}</div>`;
    }

    overlay.innerHTML = html;
    return overlay;
}

function createControlsOverlay(): HTMLDivElement {
    const controls = document.createElement('div');
    controls.style.cssText = `
        position: absolute;
        bottom: 16px;
        right: 16px;
        display: flex;
        gap: 8px;
        z-index: 5;
    `;

    // Zoom in button
    const zoomIn = createControlButton('+', () => {
        state.hfov = Math.max(30, state.hfov - 10);
        render();
    });

    // Zoom out button
    const zoomOut = createControlButton('−', () => {
        state.hfov = Math.min(120, state.hfov + 10);
        render();
    });

    // Reset button
    const reset = createControlButton('⌂', () => {
        state.heading = 0;
        state.pitch = 0;
        state.hfov = 100;
        render();
    });

    controls.appendChild(zoomIn);
    controls.appendChild(zoomOut);
    controls.appendChild(reset);

    return controls;
}

function createControlButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `
        width: 36px;
        height: 36px;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        font-size: 18px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
    `;
    btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(255, 255, 255, 0.2)';
    });
    btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(0, 0, 0, 0.6)';
    });
    btn.addEventListener('click', onClick);
    return btn;
}

// HGH-001 FIX: Local escapeHtml removed — using centralized import from utils/xss.ts
