import '../styles/main.css';
import { initPullToRefresh } from '../utils/pull-refresh';
initPullToRefresh();
import { reportWarning } from '../error-reporter';
import { t } from '../utils/i18n';
import { initBreadcrumb } from '../utils/breadcrumb';
// P2-AUD-FETCH-003 FIX: Use centralized API client instead of raw fetch().
// Gains: 30s AbortController timeout, automatic CSRF token, centralized error reporting.
import { engineer, storage } from '../api';
// CRIT-001 FIX: Use canonical toast system (haptic, ARIA, exit animation, z-index token).
// Previous: local showToast() created raw divs with hardcoded z-50 and no accessibility.
import { showToast } from '../utils/toast';
// W5-003 FIX: Auth guard — was missing on this engineer page.
import { requireAuth } from '../utils/auth-guard';
import { escapeHtml as esc } from '../utils/xss';
// IMP-007: Client-side SHA-256 image integrity hashing
import { computeImageHash } from '../utils/image-hash';

/* ═══════════════════════════════════════════════════════════════════════════
   Engineer Camera — Site Verification & Spatial Proof Engine
   Captures GPS-stamped photos for construction progress verification.
   Wires to: /api/engineer/camera/spatial-proof, /api/storage/presign
   ═══════════════════════════════════════════════════════════════════════════ */

// CRIT-003 FIX: Force dark mode for camera UI.
// Previous: classList.add('dark') — silent no-op. Platform uses data-theme attribute.
document.documentElement.setAttribute('data-theme', 'dark');

// P2-AUD-FETCH-003 FIX: Removed duplicated getCsrfToken() function and API_BASE constant.
// CSRF is now handled automatically by the centralized api.ts request() function.

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
const timestampEl =
  document.getElementById('live-timestamp') ?? document.getElementById('capture-timestamp');
const gpsCoordsEl =
  document.getElementById('gps-coords') ?? document.getElementById('gps-coordinates');
const gpsAccuracyEl = document.getElementById('gps-accuracy');
const captureBtn = document.getElementById('capture-btn') as HTMLButtonElement | null;
const cameraReady = document.getElementById('camera-ready');
const cameraCaptured = document.getElementById('camera-captured');
const photoCountEl = document.getElementById('photo-count');
const viewfinder = document.getElementById('viewfinder');
const syncBtn = document.getElementById('sync-btn');

// ─── Bootstrap ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // W5-003 FIX: Guard all protected content behind auth check.
  if (!requireAuth()) {
    return;
  }
  projectId = new URLSearchParams(window.location.search).get('project');
  initBreadcrumb(); // GAP-007: Breadcrumb navigation
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
    if (!timestampEl) {
      return;
    }
    const now = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    timestampEl.textContent = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  };
  update();
  // W9-001 FIX: Store interval ID and clear on page unload to prevent
  // ghost intervals from accumulating during SPA-like navigation.
  const intervalId = setInterval(update, 1000);
  window.addEventListener('beforeunload', () => clearInterval(intervalId));
}

// ─── GPS Acquisition ────────────────────────────────────────────────────────
function initGPS(): void {
  if (!('geolocation' in navigator)) {
    if (gpsCoordsEl) {
      gpsCoordsEl.textContent = t('cam_gps_unavailable', 'GPS غير متاح');
    }
    return;
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      gpsLat = pos.coords.latitude;
      gpsLng = pos.coords.longitude;
      gpsAccuracy = pos.coords.accuracy;
      if (gpsCoordsEl) {
        gpsCoordsEl.textContent = `${pos.coords.latitude.toFixed(4)}° N, ${pos.coords.longitude.toFixed(4)}° E`;
      }
      if (gpsAccuracyEl) {
        gpsAccuracyEl.textContent = `${t('cam_accuracy', 'الدقة')}: ±${pos.coords.accuracy.toFixed(1)}m`;
      }
    },
    () => {
      if (gpsCoordsEl) {
        gpsCoordsEl.textContent = t('cam_gps_denied', 'تم رفض إذن GPS');
      }
      if (gpsAccuracyEl) {
        gpsAccuracyEl.textContent = t('cam_gps_fallback', 'GPS: وضع بديل');
      }
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
  );
}

// ─── Camera API — Live Viewfinder ───────────────────────────────────────────
async function initCamera(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return;
  }

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
      // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
      if (cameraReady) {
        cameraReady.classList.add('nm-hidden');
      }
      viewfinder.insertBefore(video, viewfinder.firstChild);
    }
  } catch (err) {
    reportWarning('[EngineerCamera] Camera initialization failed, keeping placeholder', {
      component: 'engineer_camera',
      action: 'init_camera',
      error: err instanceof Error ? err.message : String(err),
    });
    // W13-003 FIX: Show user-facing error when camera fails to initialize.
    showToast(t('cam_init_failed', 'فشل تهيئة الكاميرا'));
  }
}

// ─── Photo Capture — Real Frame Capture from Video ──────────────────────────
function setupCapture(): void {
  if (!captureBtn) {
    return;
  }

  captureBtn.addEventListener('click', () => {
    if (captureCount >= MAX_CAPTURES) {
      showToast(t('cam_max_captures', 'الحد الأقصى 8 لقطات لكل جلسة. أرسل إثباتاتك.'));
      return;
    }

    const video = document.getElementById('camera-video') as HTMLVideoElement | null;

    if (video && cameraStream) {
      // Real capture from camera
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }

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
      cameraReady.classList.add('nm-hidden');
      cameraCaptured.classList.remove('nm-hidden');

      captureBtn.classList.add('captured');
      const iconEl = captureBtn.querySelector('.ph-camera');
      if (iconEl) {
        iconEl.classList.remove('ph-camera');
        iconEl.classList.add('ph-check-circle');
      }
      const textEl = captureBtn.querySelector('span');
      if (textEl) {
        textEl.innerHTML = `${esc(t('cam_captured', 'تم الالتقاط'))} #${captureCount} <i class="ph ph-check nm-icon-gap-start" aria-hidden="true"></i>`;
      }

      setTimeout(() => {
        cameraReady.classList.remove('nm-hidden');
        cameraCaptured.classList.add('nm-hidden');
        captureBtn.classList.remove('captured');
        const icon = captureBtn.querySelector('.ph-check-circle');
        if (icon) {
          icon.classList.remove('ph-check-circle');
          icon.classList.add('ph-camera');
        }
        if (textEl) {
          textEl.textContent = t('cam_capture_360', 'تصوير 360 ومزامنة');
        }
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
  if (!syncBtn) {
    return;
  }

  syncBtn.addEventListener('click', async () => {
    if (captureCount === 0) {
      showToast(t('cam_no_captures', 'لا توجد لقطات للمزامنة. التقط صوراً أولاً.'));
      return;
    }

    if (!projectId) {
      showToast(t('cam_no_project', 'لم يتم اختيار مشروع. انتقل من لوحة المتابعة.'));
      return;
    }

    if (gpsLat === null || gpsLng === null) {
      showToast(t('cam_gps_required', 'إحداثيات GPS مطلوبة. يرجى تفعيل خدمات الموقع.'));
      return;
    }

    // Update UI to syncing state
    const icon = syncBtn.querySelector('.ph-cloud-arrow-up');
    if (icon) {
      icon.classList.remove('ph-cloud-arrow-up');
      icon.classList.add('ph-spinner', 'animate-spin');
    }
    const label = syncBtn.querySelector('span');
    if (label) {
      label.textContent = t('cam_uploading', 'جاري الرفع...');
    }

    try {
      let uploaded = 0;

      // P2-AUD-FETCH-003 FIX: CSRF token is now handled automatically
      // by the centralized api.ts request() function.

      for (const dataUrl of capturedDataUrls) {
        const blob = dataURLtoBlob(dataUrl);
        const filename = `proof_${projectId}_${Date.now()}_${uploaded}.jpg`;

        // IMP-007: Compute SHA-256 hash BEFORE upload (chain of custody)
        // Hash is computed from the raw JPEG bytes, not the URL.
        let clientHash: string | undefined;
        try {
          clientHash = await computeImageHash(blob);
        } catch {
          // Non-critical: hash may fail on insecure context (HTTP).
          // Backend will still compute its own hash from the stored image.
        }

        // 1. Get presigned URL — via centralized api.ts wrapper
        const presignData = await storage.presign({
          filename,
          content_type: 'image/jpeg',
          purpose: 'spatial_proof',
        });

        // 2. Upload to storage (raw fetch is correct here —
        //    presigned URL is self-authenticating and external to our API)
        await fetch(presignData.data!.upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: blob,
        });

        // 3. Submit spatial proof — via centralized api.ts wrapper
        // P1-AUD-GPS-002 FIX: Uses correct field name 'gps_accuracy_meters'
        // (was 'gps_accuracy' — silently dropped by backend).
        // IMP-007: client_hash enables dual verification.
        await engineer.submitSpatialProof({
          project_id: projectId!,
          item_id: projectId!,
          image_url: presignData.data!.public_url,
          gps_lat: gpsLat!,
          gps_lng: gpsLng!,
          gps_accuracy_meters: gpsAccuracy ?? undefined,
          client_hash: clientHash,
        });

        uploaded++;
      }

      // Success state
      if (icon) {
        icon.classList.remove('ph-spinner', 'animate-spin');
        icon.classList.add('ph-check-circle');
        // P3-CAM-002 FIX: CSS class replaces inline style.color.
        (icon as HTMLElement).classList.add('nm-upload-success');
      }
      if (label) {
        label.innerHTML = `${uploaded} ${esc(t('cam_proofs_synced', 'إثبات(ات) تمت مزامنتها'))} <i class="ph ph-check nm-icon-gap-start" aria-hidden="true"></i>`;
        // P3-CAM-002 FIX: CSS class replaces inline style.color.
        label.classList.add('nm-upload-success');
      }

      showToast(`${uploaded} ${t('cam_proofs_submitted', 'إثبات(ات) مكانية أُرسلت للتحقق')}`);

      // Reset state
      capturedDataUrls.length = 0;
      captureCount = 0;
      if (photoCountEl) {
        photoCountEl.textContent = '0 / 8';
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('cam_sync_failed', 'فشلت المزامنة');
      showToast(message);

      if (icon) {
        icon.classList.remove('ph-spinner', 'animate-spin');
        icon.classList.add('ph-cloud-arrow-up');
      }
      if (label) {
        label.textContent = t('cam_sync_to_server', 'مزامنة مع الخادم');
      }
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
    if (isRecording) {
      return;
    }
    isRecording = true;
    recordingStart = Date.now();

    if (voiceOverlay) {
      voiceOverlay.classList.remove('nm-hidden');
    }
    if (voicePulseEl) {
      voicePulseEl.classList.add('voice-recording');
    }

    recordingInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStart) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const secs = String(elapsed % 60).padStart(2, '0');
      if (voiceTimerEl) {
        voiceTimerEl.textContent = `${mins}:${secs}`;
      }
    }, 200);

    if ('vibrate' in navigator) {
      navigator.vibrate([50, 100, 50]);
    }
  });

  voiceStopBtn?.addEventListener('click', () => {
    if (!isRecording) {
      return;
    }
    isRecording = false;

    if (recordingInterval) {
      clearInterval(recordingInterval);
      recordingInterval = null;
    }
    if (voiceOverlay) {
      voiceOverlay.classList.add('nm-hidden');
    }
    if (voicePulseEl) {
      voicePulseEl.classList.remove('voice-recording');
    }
    if (voiceTimerEl) {
      voiceTimerEl.textContent = '00:00';
    }

    const duration = Math.floor((Date.now() - recordingStart) / 1000);
    if (duration > 1) {
      showToast(`${t('cam_snag_saved', 'تم حفظ ملاحظة الخلل')} (${duration}s)`);
    }
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

// CRIT-001 FIX: Removed duplicate local showToast().
// Canonical import from utils/toast.ts provides: haptic feedback, ARIA live region,
// exit animation, max visible limit, i18n resolution, design-token z-index.
