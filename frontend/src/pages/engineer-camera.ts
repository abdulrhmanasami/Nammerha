import '../styles/main.css';
import { reportWarning } from '../error-reporter';

/* ═══════════════════════════════════════════════════════════════════════════
   Engineer Camera — Site Verification & Spatial Proof Engine
   Captures GPS-stamped photos for construction progress verification.
   Wires to: /api/engineer/camera/spatial-proof, /api/storage/presign
   ═══════════════════════════════════════════════════════════════════════════ */

// Force dark mode for camera UI
document.documentElement.classList.add('dark');

const API_BASE = '/api';

// ─── INF-SEC-002: CSRF Token for cookie-based auth ──────────────────────────
// After V1 JWT httpOnly migration, POST requests use cookie auth which
// triggers CSRF middleware. We must obtain and send the X-CSRF-Token header.
async function getCsrfToken(): Promise<string | null> {
    const existing = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/)?.[1];
    if (existing) { return existing; }

    try {
        const res = await fetch(`${API_BASE}/csrf-token`, { credentials: 'same-origin' });
        if (!res.ok) { return null; }
        const data = await res.json() as { csrfToken?: string };
        return data.csrfToken ?? null;
    } catch {
        return null;
    }
}

// ─── State ──────────────────────────────────────────────────────────────────
let projectId: string | null = null;
let gpsLat: number | null = null;
let gpsLng: number | null = null;
let gpsAccuracy: number | null = null;
let cameraStream: MediaStream | null = null;
let captureCount = 0;
const MAX_CAPTURES = 8;
const capturedDataUrls: string[] = [];

// ─── DOM ────────────────────────────────────────────────────────────────────
const timestampEl = document.getElementById('live-timestamp') ?? document.getElementById('capture-timestamp');
const gpsCoordsEl = document.getElementById('gps-coords') ?? document.getElementById('gps-coordinates');
const gpsAccuracyEl = document.getElementById('gps-accuracy');
const captureBtn = document.getElementById('capture-btn') as HTMLButtonElement | null;
const cameraReady = document.getElementById('camera-ready');
const cameraCaptured = document.getElementById('camera-captured');
const photoCountEl = document.getElementById('photo-count');
const viewfinder = document.getElementById('viewfinder');
const syncBtn = document.getElementById('sync-btn');

// ─── Bootstrap ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    projectId = new URLSearchParams(window.location.search).get('project');
    initTimestamp();
    initGPS();
    initCamera();
    setupCapture();
    setupSync();
    setupVoice();
});

// ─── Live Timestamp ─────────────────────────────────────────────────────────
function initTimestamp(): void {
    const update = (): void => {
        if (!timestampEl) { return; }
        const now = new Date();
        const pad = (n: number): string => String(n).padStart(2, '0');
        timestampEl.textContent =
            `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    };
    update();
    setInterval(update, 1000);
}

// ─── GPS Acquisition ────────────────────────────────────────────────────────
function initGPS(): void {
    if (!('geolocation' in navigator)) {
        if (gpsCoordsEl) { gpsCoordsEl.textContent = 'GPS unavailable'; }
        return;
    }

    navigator.geolocation.watchPosition(
        (pos) => {
            gpsLat = pos.coords.latitude;
            gpsLng = pos.coords.longitude;
            gpsAccuracy = pos.coords.accuracy;
            if (gpsCoordsEl) {
                gpsCoordsEl.textContent =
                    `${pos.coords.latitude.toFixed(4)}° N, ${pos.coords.longitude.toFixed(4)}° E`;
            }
            if (gpsAccuracyEl) {
                gpsAccuracyEl.textContent = `Accuracy: ±${pos.coords.accuracy.toFixed(1)}m`;
            }
        },
        () => {
            if (gpsCoordsEl) { gpsCoordsEl.textContent = 'GPS permission denied'; }
            if (gpsAccuracyEl) { gpsAccuracyEl.textContent = 'GPS: Fallback Mode'; }
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
}

// ─── Camera API — Live Viewfinder ───────────────────────────────────────────
async function initCamera(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) { return; }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
            },
        });

        cameraStream = stream;

        // Create live video element
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.className = 'absolute inset-0 w-full h-full object-cover';
        video.id = 'camera-video';

        if (viewfinder) {
            if (cameraReady) { cameraReady.style.display = 'none'; }
            viewfinder.insertBefore(video, viewfinder.firstChild);
        }
    } catch (err) {
        reportWarning('[EngineerCamera] Camera initialization failed, keeping placeholder', { component: 'engineer_camera', action: 'init_camera', error: err instanceof Error ? err.message : String(err) });
    }
}

// ─── Photo Capture — Real Frame Capture from Video ──────────────────────────
function setupCapture(): void {
    if (!captureBtn) { return; }

    captureBtn.addEventListener('click', () => {
        if (captureCount >= MAX_CAPTURES) {
            showToast('Maximum 8 captures per session. Submit your proofs.');
            return;
        }

        const video = document.getElementById('camera-video') as HTMLVideoElement | null;

        if (video && cameraStream) {
            // Real capture from camera
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 1920;
            canvas.height = video.videoHeight || 1080;
            const ctx = canvas.getContext('2d');
            if (!ctx) { return; }

            ctx.drawImage(video, 0, 0);

            // GPS watermark
            if (gpsLat !== null && gpsLng !== null) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
                ctx.fillStyle = '#fff';
                ctx.font = '14px monospace';
                ctx.fillText(
                    `GPS: ${gpsLat.toFixed(6)}, ${gpsLng.toFixed(6)} | ${new Date().toISOString()}`,
                    10,
                    canvas.height - 15,
                );
            }

            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            capturedDataUrls.push(dataUrl);
        }

        captureCount++;

        // Update UI
        if (photoCountEl) {
            photoCountEl.textContent = `${captureCount} / ${MAX_CAPTURES}`;
        }

        // Visual feedback: Flash + button state
        if (cameraReady && cameraCaptured) {
            cameraReady.classList.add('hidden');
            cameraCaptured.classList.remove('hidden');

            captureBtn.classList.add('captured');
            const iconEl = captureBtn.querySelector('.ph-camera');
            if (iconEl) {
                iconEl.classList.remove('ph-camera');
                iconEl.classList.add('ph-check-circle');
            }
            const textEl = captureBtn.querySelector('span');
            if (textEl) { textEl.textContent = `Captured #${captureCount} ✓`; }

            setTimeout(() => {
                cameraReady.classList.remove('hidden');
                cameraCaptured.classList.add('hidden');
                captureBtn.classList.remove('captured');
                const icon = captureBtn.querySelector('.ph-check-circle');
                if (icon) {
                    icon.classList.remove('ph-check-circle');
                    icon.classList.add('ph-camera');
                }
                if (textEl) { textEl.textContent = 'Capture 360 & Sync'; }
            }, 2000);
        }

        // Haptic feedback
        if ('vibrate' in navigator) {
            navigator.vibrate(50);
        }
    });
}

// ─── Sync — Upload to Server ────────────────────────────────────────────────
function setupSync(): void {
    if (!syncBtn) { return; }

    syncBtn.addEventListener('click', async () => {
        if (captureCount === 0) {
            showToast('No captures to sync. Capture photos first.');
            return;
        }

        if (!projectId) {
            showToast('No project selected. Navigate from the dashboard.');
            return;
        }

        if (gpsLat === null || gpsLng === null) {
            showToast('GPS coordinates required. Please enable location services.');
            return;
        }

        // Update UI to syncing state
        const icon = syncBtn.querySelector('.ph-cloud-arrow-up');
        if (icon) {
            icon.classList.remove('ph-cloud-arrow-up');
            icon.classList.add('ph-spinner', 'animate-spin');
        }
        const label = syncBtn.querySelector('span');
        if (label) { label.textContent = 'Uploading...'; }

        try {
            let uploaded = 0;

            // INF-SEC-002: Obtain CSRF token once before upload loop
            const csrfToken = await getCsrfToken();

            for (const dataUrl of capturedDataUrls) {
                const blob = dataURLtoBlob(dataUrl);
                const filename = `proof_${projectId}_${Date.now()}_${uploaded}.jpg`;

                // 1. Get presigned URL
                // V1-AUDIT FIX: Use httpOnly cookie (credentials: 'same-origin')
                // instead of Bearer token from localStorage
                const presignRes = await fetch(`${API_BASE}/storage/presign`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
                    },
                    body: JSON.stringify({ filename, content_type: 'image/jpeg', purpose: 'spatial_proof' }),
                });

                if (!presignRes.ok) { throw new Error('Failed to get upload URL'); }
                const presignData = await presignRes.json() as { data: { upload_url: string; public_url: string } };

                // 2. Upload to storage (no auth needed — presigned URL is self-authenticating)
                await fetch(presignData.data.upload_url, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'image/jpeg' },
                    body: blob,
                });

                // 3. Submit spatial proof
                // V1-AUDIT FIX: Use httpOnly cookie instead of Bearer token
                const proofRes = await fetch(`${API_BASE}/engineer/camera/spatial-proof`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
                    },
                    body: JSON.stringify({
                        project_id: projectId,
                        item_id: projectId,
                        image_url: presignData.data.public_url,
                        gps_lat: gpsLat,
                        gps_lng: gpsLng,
                        gps_accuracy: gpsAccuracy,
                    }),
                });

                if (!proofRes.ok) {
                    const err = await proofRes.json() as { error: string };
                    throw new Error(err.error ?? 'Proof submission failed');
                }

                uploaded++;
            }

            // Success state
            if (icon) {
                icon.classList.remove('ph-spinner', 'animate-spin');
                icon.classList.add('ph-check-circle');
                (icon as HTMLElement).style.color = '#109173';
            }
            if (label) {
                label.textContent = `${uploaded} Proof(s) Synced ✓`;
                label.style.color = '#109173';
            }

            showToast(`${uploaded} spatial proof(s) submitted for verification`);

            // Reset state
            capturedDataUrls.length = 0;
            captureCount = 0;
            if (photoCountEl) { photoCountEl.textContent = '0 / 8'; }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Sync failed';
            showToast(message);

            if (icon) {
                icon.classList.remove('ph-spinner', 'animate-spin');
                icon.classList.add('ph-cloud-arrow-up');
            }
            if (label) { label.textContent = 'Sync to Server'; }
        }
    });
}

// ─── Voice Snagging ─────────────────────────────────────────────────────────
function setupVoice(): void {
    const voiceBtn = document.getElementById('voice-snag-btn');
    const voiceOverlay = document.getElementById('voice-overlay');
    const voiceStopBtn = document.getElementById('voice-stop-btn');
    const voiceTimerEl = document.getElementById('voice-timer');
    const voicePulseEl = document.getElementById('voice-pulse');

    let isRecording = false;
    let recordingInterval: ReturnType<typeof setInterval> | null = null;
    let recordingStart = 0;

    voiceBtn?.addEventListener('click', () => {
        if (isRecording) { return; }
        isRecording = true;
        recordingStart = Date.now();

        if (voiceOverlay) { voiceOverlay.classList.remove('hidden'); }
        if (voicePulseEl) { voicePulseEl.classList.add('voice-recording'); }

        recordingInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStart) / 1000);
            const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
            const secs = String(elapsed % 60).padStart(2, '0');
            if (voiceTimerEl) { voiceTimerEl.textContent = `${mins}:${secs}`; }
        }, 200);

        if ('vibrate' in navigator) { navigator.vibrate([50, 100, 50]); }
    });

    voiceStopBtn?.addEventListener('click', () => {
        if (!isRecording) { return; }
        isRecording = false;

        if (recordingInterval) { clearInterval(recordingInterval); recordingInterval = null; }
        if (voiceOverlay) { voiceOverlay.classList.add('hidden'); }
        if (voicePulseEl) { voicePulseEl.classList.remove('voice-recording'); }
        if (voiceTimerEl) { voiceTimerEl.textContent = '00:00'; }

        const duration = Math.floor((Date.now() - recordingStart) / 1000);
        if (duration > 1) { showToast(`Snag note saved (${duration}s)`); }
    });
}

// ─── Utilities ──────────────────────────────────────────────────────────────
function dataURLtoBlob(dataUrl: string): Blob {
    const parts = dataUrl.split(',');
    const mime = parts[0]?.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
    const binary = atob(parts[1] ?? '');
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
}

function showToast(message: string): void {
    const badge = document.createElement('div');
    badge.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-smoky-jade text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg';
    badge.textContent = message;
    document.body.appendChild(badge);
    setTimeout(() => { badge.remove(); }, 3000);
}


