import '../styles/main.css';

// Force dark mode
document.documentElement.classList.add('dark');

// ═══════════════════════════════════════════════════════════════════════════
// LIVE TIMESTAMP — Updates every second
// ═══════════════════════════════════════════════════════════════════════════
const timestampEl = document.getElementById('live-timestamp');

function updateTimestamp(): void {
    if (!timestampEl) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    timestampEl.textContent =
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

updateTimestamp();
setInterval(updateTimestamp, 1000);

// ═══════════════════════════════════════════════════════════════════════════
// LIVE GPS — Uses Geolocation API with fallback
// ═══════════════════════════════════════════════════════════════════════════
const gpsCoordsEl = document.getElementById('gps-coords');
const gpsAccuracyEl = document.getElementById('gps-accuracy');

if ('geolocation' in navigator) {
    navigator.geolocation.watchPosition(
        (pos) => {
            if (gpsCoordsEl) {
                gpsCoordsEl.textContent =
                    `${pos.coords.latitude.toFixed(4)}° N, ${pos.coords.longitude.toFixed(4)}° E`;
            }
            if (gpsAccuracyEl) {
                gpsAccuracyEl.textContent = `Accuracy: ±${pos.coords.accuracy.toFixed(1)}m`;
            }
        },
        () => {
            // Fallback: keep static coordinates (Aleppo)
            if (gpsCoordsEl) gpsCoordsEl.textContent = '36.2021° N, 37.1342° E';
            if (gpsAccuracyEl) gpsAccuracyEl.textContent = 'GPS: Simulated Mode';
        },
        { enableHighAccuracy: true, maximumAge: 5000 }
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CAPTURE 360 & SYNC — Main action button
// ═══════════════════════════════════════════════════════════════════════════
const captureBtn = document.getElementById('capture-btn') as HTMLButtonElement | null;
const cameraReady = document.getElementById('camera-ready');
const cameraCaptured = document.getElementById('camera-captured');
const photoCountEl = document.getElementById('photo-count');
let captureCount = 0;
const MAX_CAPTURES = 8;

if (captureBtn) {
    captureBtn.addEventListener('click', () => {
        if (captureCount >= MAX_CAPTURES) {
            alert('Maximum 8 captures per session. Please sync to server.');
            return;
        }

        captureCount++;

        // Update photo count
        if (photoCountEl) {
            photoCountEl.textContent = `${captureCount} / ${MAX_CAPTURES}`;
        }

        // Visual feedback: Flash effect
        if (cameraReady && cameraCaptured) {
            cameraReady.classList.add('hidden');
            cameraCaptured.classList.remove('hidden');

            // Button state
            captureBtn.classList.add('captured');
            const iconEl = captureBtn.querySelector('.ph-camera');
            if (iconEl) {
                iconEl.classList.remove('ph-camera');
                iconEl.classList.add('ph-check-circle');
            }
            const textEl = captureBtn.querySelector('span');
            if (textEl) textEl.textContent = `Captured #${captureCount} ✓`;

            // Reset after 2s
            setTimeout(() => {
                cameraReady.classList.remove('hidden');
                cameraCaptured.classList.add('hidden');
                captureBtn.classList.remove('captured');
                const icon = captureBtn.querySelector('.ph-check-circle');
                if (icon) {
                    icon.classList.remove('ph-check-circle');
                    icon.classList.add('ph-camera');
                }
                if (textEl) textEl.textContent = 'Capture 360 & Sync';
            }, 2000);
        }

        // Haptic feedback (mobile)
        if ('vibrate' in navigator) {
            navigator.vibrate(50);
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// VOICE SNAGGING — Yellow mic button (Web Speech / MediaRecorder)
// ═══════════════════════════════════════════════════════════════════════════
const voiceBtn = document.getElementById('voice-snag-btn');
const voiceOverlay = document.getElementById('voice-overlay');
const voiceStopBtn = document.getElementById('voice-stop-btn');
const voiceTimerEl = document.getElementById('voice-timer');
const voicePulseEl = document.getElementById('voice-pulse');

let isRecording = false;
let recordingInterval: ReturnType<typeof setInterval> | null = null;
let recordingStart = 0;

function startVoiceRecording(): void {
    isRecording = true;
    recordingStart = Date.now();

    // Show overlay
    if (voiceOverlay) voiceOverlay.classList.remove('hidden');
    if (voicePulseEl) voicePulseEl.classList.add('voice-recording');

    // Update timer
    recordingInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStart) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        if (voiceTimerEl) voiceTimerEl.textContent = `${mins}:${secs}`;
    }, 200);

    // Haptic feedback
    if ('vibrate' in navigator) {
        navigator.vibrate([50, 100, 50]);
    }
}

function stopVoiceRecording(): void {
    isRecording = false;

    // Clear timer
    if (recordingInterval) {
        clearInterval(recordingInterval);
        recordingInterval = null;
    }

    // Hide overlay
    if (voiceOverlay) voiceOverlay.classList.add('hidden');
    if (voicePulseEl) voicePulseEl.classList.remove('voice-recording');

    // Reset timer
    if (voiceTimerEl) voiceTimerEl.textContent = '00:00';

    // Calculate duration
    const duration = Math.floor((Date.now() - recordingStart) / 1000);

    // Show confirmation
    if (duration > 1) {
        const badge = document.createElement('div');
        badge.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-smoky-jade text-white px-4 py-2 rounded-full text-sm font-bold';
        badge.textContent = `Snag note saved (${duration}s)`;
        document.body.appendChild(badge);
        setTimeout(() => badge.remove(), 2500);
    }
}

if (voiceBtn) {
    voiceBtn.addEventListener('click', () => {
        if (!isRecording) startVoiceRecording();
    });
}

if (voiceStopBtn) {
    voiceStopBtn.addEventListener('click', () => {
        if (isRecording) stopVoiceRecording();
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNC BUTTON — Simulate cloud sync
// ═══════════════════════════════════════════════════════════════════════════
const syncBtn = document.getElementById('sync-btn');

if (syncBtn) {
    syncBtn.addEventListener('click', () => {
        if (captureCount === 0) {
            alert('No captures to sync. Capture photos first.');
            return;
        }

        const icon = syncBtn.querySelector('.ph-cloud-arrow-up');
        if (icon) {
            icon.classList.remove('ph-cloud-arrow-up');
            icon.classList.add('ph-spinner');
            icon.classList.add('animate-spin');
        }

        const label = syncBtn.querySelector('span');
        if (label) label.textContent = 'Syncing...';

        // Simulate sync
        setTimeout(() => {
            if (icon) {
                icon.classList.remove('ph-spinner', 'animate-spin');
                icon.classList.add('ph-check-circle');
                (icon as HTMLElement).style.color = '#109173';
            }
            if (label) {
                label.textContent = 'Synced ✓';
                label.style.color = '#109173';
            }
        }, 2500);
    });
}
