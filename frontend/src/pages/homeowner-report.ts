import '../styles/main.css';
import { projects } from '../api';
import { escapeHtml as esc } from '../utils/xss';
import { t } from '../utils/i18n';
// FRC-NEW-06: Loading state feedback for submit button
import { setLoadingState } from '../utils/loading-state';

// ═══════════════════════════════════════════════════════════════════════════
// WIZARD STATE
// ═══════════════════════════════════════════════════════════════════════════
interface WizardState {
    currentStep: number;
    damageType: string | null;
    governorate: string;
    neighborhood: string;
    gpsCoords: string | null;
    description: string;
    photoCount: number;
    projectId: string | null; // P1-002: Real OCDS project ID from API
}

const state: WizardState = {
    currentStep: 1,
    damageType: null,
    governorate: '',
    neighborhood: '',
    gpsCoords: null,
    description: '',
    photoCount: 0,
    projectId: null,
};

const TOTAL_STEPS = 3;

// ═══════════════════════════════════════════════════════════════════════════
// GAP-NEW-06 FIX: Wizard State Persistence via sessionStorage.
// Syrian homeowners on 3G may spend 5+ minutes on GPS lock and photo upload.
// A browser crash or accidental refresh MUST NOT destroy their work.
// State is saved on every step transition, restored on page load,
// and cleared only on successful submission (step 4).
// Standard: Nielsen #5 (Error Prevention), Progressive Web App (Offline Resilience).
// ═══════════════════════════════════════════════════════════════════════════
const WIZARD_STORAGE_KEY = 'nmr_wizard_state';

function saveWizardState(): void {
    try {
        const serializable = {
            currentStep: state.currentStep,
            damageType: state.damageType,
            governorate: state.governorate,
            neighborhood: state.neighborhood,
            gpsCoords: state.gpsCoords,
            description: state.description,
            // Note: photos and projectId are NOT persisted (binary data / server-side)
        };
        sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(serializable));
    } catch {
        // sessionStorage may be full or disabled — fail silently
    }
}

function restoreWizardState(): boolean {
    try {
        const stored = sessionStorage.getItem(WIZARD_STORAGE_KEY);
        if (!stored) { return false; }

        const parsed = JSON.parse(stored) as Partial<WizardState>;

        // Only restore if there's meaningful data
        if (!parsed.damageType && !parsed.governorate) { return false; }

        if (parsed.damageType) { state.damageType = parsed.damageType; }
        if (parsed.governorate) { state.governorate = parsed.governorate; }
        if (parsed.neighborhood) { state.neighborhood = parsed.neighborhood; }
        if (parsed.gpsCoords) { state.gpsCoords = parsed.gpsCoords; }
        if (parsed.description) { state.description = parsed.description; }
        if (parsed.currentStep && parsed.currentStep >= 1 && parsed.currentStep <= TOTAL_STEPS) {
            state.currentStep = parsed.currentStep;
        }

        return true;
    } catch {
        return false;
    }
}

function clearWizardState(): void {
    try {
        sessionStorage.removeItem(WIZARD_STORAGE_KEY);
    } catch {
        // fail silently
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// DOM REFERENCES
// ═══════════════════════════════════════════════════════════════════════════
const stepLabel = document.getElementById('step-label');
const progressFill = document.getElementById('progress-fill');
const nextBtn = document.getElementById('next-btn') as HTMLButtonElement | null;
const nextBtnText = document.getElementById('next-btn-text');
const backBtn = document.getElementById('back-btn');
const wizardFooter = document.getElementById('wizard-footer');

// Step panels
const steps = [
    document.getElementById('step-1'),
    document.getElementById('step-2'),
    document.getElementById('step-3'),
    document.getElementById('step-4'),
];

// ═══════════════════════════════════════════════════════════════════════════
// WIZARD NAVIGATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════
function showStep(step: number): void {
    state.currentStep = step;

    // Hide all steps, show current
    steps.forEach((el, i) => {
        if (el) {
            el.classList.toggle('hidden', i !== step - 1);
        }
    });

    // Update progress bar
    if (step <= TOTAL_STEPS) {
        const pct = (step / TOTAL_STEPS) * 100;
        if (progressFill) { progressFill.style.width = `${pct}%`; }
        if (stepLabel) { stepLabel.textContent = `${t('hr_step', 'Step')} ${step} ${t('hr_of', 'of')} ${TOTAL_STEPS}`; }
    }

    // Update button text and state
    if (step === 1) {
        updateNextButton();
    } else if (step === 2) {
        updateNextButton();
    } else if (step === 3) {
        if (nextBtnText) { nextBtnText.textContent = t('hr_submit_request', 'Submit Request'); }
        if (nextBtn) {
            nextBtn.disabled = false;
            const icon = nextBtn.querySelector('.ph-arrow-right');
            if (icon) {
                icon.classList.remove('ph-arrow-right');
                icon.classList.add('ph-paper-plane-tilt');
            }
        }
    } else if (step === 4) {
        // Confirmation step — hide footer
        if (wizardFooter) { wizardFooter.classList.add('hidden'); }
        if (stepLabel) { stepLabel.textContent = t('hr_done', 'Done!'); }
        if (progressFill) { progressFill.style.width = '100%'; }
        populateSummary();
        // GAP-NEW-06: Clear persisted state on successful submission
        clearWizardState();
    }

    // GAP-NEW-06: Persist state on every step transition
    if (step < 4) { saveWizardState(); }
}

function updateNextButton(): void {
    if (!nextBtn || !nextBtnText) { return; }

    if (state.currentStep === 1) {
        nextBtn.disabled = !state.damageType;
        nextBtnText.textContent = state.damageType ? t('hr_next_step', 'Next Step') : t('hr_select_damage', 'Select damage type');
    } else if (state.currentStep === 2) {
        const gov = (document.getElementById('governorate') as HTMLSelectElement)?.value;
        const hood = (document.getElementById('neighborhood') as HTMLInputElement)?.value.trim();
        nextBtn.disabled = !gov || !hood;
        nextBtnText.textContent = (gov && hood) ? t('hr_next_step', 'Next Step') : t('hr_enter_location', 'Enter location details');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION BUTTONS
// ═══════════════════════════════════════════════════════════════════════════
if (nextBtn) {
    nextBtn.addEventListener('click', async () => {
        if (state.currentStep === 1 && state.damageType) {
            showStep(2);
        } else if (state.currentStep === 2) {
            const gov = (document.getElementById('governorate') as HTMLSelectElement)?.value;
            const hood = (document.getElementById('neighborhood') as HTMLInputElement)?.value.trim();
            if (gov && hood) {
                state.governorate = gov;
                state.neighborhood = hood;
                showStep(3);
            }
        } else if (state.currentStep === 3) {
            state.description = (document.getElementById('damage-description') as HTMLTextAreaElement)?.value.trim() || '';

            // FRC-NEW-06 FIX: Visual loading state with spinner during API submission.
            // Previous: manually set disabled + text — no spinner, no visual feedback.
            // Now: animated spinner + "Submitting..." text, success/error flash on result.
            const restoreBtn = setLoadingState(nextBtn, t('hr_submitting', 'Submitting...'));

            try {
                // Parse GPS coords if available
                let gps_lat = 0;
                let gps_lng = 0;
                if (state.gpsCoords) {
                    const parts = state.gpsCoords.split(',');
                    gps_lat = parseFloat(parts[0]?.replace(/[^\d.-]/g, '') ?? '0');
                    gps_lng = parseFloat(parts[1]?.replace(/[^\d.-]/g, '') ?? '0');
                }

                const response = await projects.create({
                    title: `${state.damageType} damage — ${state.neighborhood}, ${state.governorate}`,
                    damage_type: (state.damageType as 'structural' | 'plumbing' | 'electrical' | 'mixed') ?? 'mixed',
                    description: state.description || undefined,
                    gps_lat,
                    gps_lng,
                    address_text: `${state.neighborhood}, ${state.governorate}`,
                });

                if (response.success && response.data) {
                    const project = response.data as { project_id: string };
                    state.projectId = project.project_id;
                }

                restoreBtn('success');
                // Small delay for visual feedback before transitioning
                setTimeout(() => showStep(4), 650);
            } catch (err) {
                restoreBtn('error');
                const message = err instanceof Error ? err.message : t('hr_submission_failed', 'Submission failed');
                // HIGH-002 FIX: Replace alert() with inline error banner
                const errDiv = document.createElement('div');
                errDiv.className = 'rounded-xl p-3 text-sm font-medium flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 mx-4 mt-2 animate-fade-in-up';
                errDiv.innerHTML = `<i class="ph ph-warning-circle" aria-hidden="true"></i> ${esc(message)}`;
                steps[2]?.prepend(errDiv);
                setTimeout(() => errDiv.remove(), 5000);
            }
        }
    });
}

if (backBtn) {
    backBtn.addEventListener('click', () => {
        if (state.currentStep === 1) {
            window.location.href = 'index.html';
        } else if (state.currentStep <= TOTAL_STEPS) {
            showStep(state.currentStep - 1);
        } else if (state.currentStep === 4) {
            // From confirmation, go back to home
            window.location.href = 'index.html';
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1 — DAMAGE TYPE CARD SELECTION
// ═══════════════════════════════════════════════════════════════════════════
const damageCards = document.querySelectorAll<HTMLButtonElement>('.damage-card');

damageCards.forEach((card) => {
    card.addEventListener('click', () => {
        // Deselect all
        damageCards.forEach((c) => {
            c.classList.remove('glass-card-active');
            const icon = c.querySelector('.damage-check i');
            if (icon) {
                icon.className = 'ph ph-circle';
            }
            const iconBox = c.querySelector('.size-14');
            if (iconBox) {
                iconBox.classList.remove('bg-trust-blue/10', 'text-trust-blue');
                iconBox.classList.add('bg-slate-100', 'text-slate-600');
            }
        });

        // Select clicked card
        card.classList.add('glass-card-active');
        const checkIcon = card.querySelector('.damage-check i');
        if (checkIcon) {
            checkIcon.className = 'ph ph-check-circle';
        }
        const cardIconBox = card.querySelector('.size-14');
        if (cardIconBox) {
            cardIconBox.classList.remove('bg-slate-100', 'text-slate-600');
            cardIconBox.classList.add('bg-trust-blue/10', 'text-trust-blue');
        }

        state.damageType = card.dataset.type || null;
        updateNextButton();

        // Haptic feedback
        if ('vibrate' in navigator) { navigator.vibrate(30); }
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2 — LOCATION: Governorate + Neighborhood + GPS
// ═══════════════════════════════════════════════════════════════════════════
const governorateSelect = document.getElementById('governorate');
const neighborhoodInput = document.getElementById('neighborhood');

if (governorateSelect) { governorateSelect.addEventListener('change', updateNextButton); }
if (neighborhoodInput) { neighborhoodInput.addEventListener('input', updateNextButton); }

// GPS auto-detect
const detectLocationBtn = document.getElementById('detect-location-btn');
const gpsResult = document.getElementById('gps-result');
const gpsDisplay = document.getElementById('gps-display');

if (detectLocationBtn) {
    detectLocationBtn.addEventListener('click', () => {
        if (!('geolocation' in navigator)) {
            // HIGH-002 FIX: Replace alert() with inline feedback
            const btnLabel = detectLocationBtn.querySelector('span');
            if (btnLabel) { btnLabel.textContent = t('hr_geo_not_supported', 'Geolocation not supported'); }
            (detectLocationBtn as HTMLButtonElement).disabled = true;
            detectLocationBtn.classList.add('opacity-60');
            return;
        }

        const btnIcon = detectLocationBtn.querySelector('.ph-crosshair');
        if (btnIcon) {
            btnIcon.classList.remove('ph-crosshair');
            btnIcon.classList.add('ph-spinner');
        }
        const btnLabel = detectLocationBtn.querySelector('span');
        if (btnLabel) { btnLabel.textContent = t('hr_detecting', 'Detecting...'); }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude.toFixed(5);
                const lon = pos.coords.longitude.toFixed(5);
                state.gpsCoords = `${lat}° N, ${lon}° E`;

                if (gpsDisplay) { gpsDisplay.textContent = state.gpsCoords; }
                if (gpsResult) { gpsResult.classList.remove('hidden'); }
                if (btnIcon) {
                    btnIcon.classList.remove('ph-spinner');
                    btnIcon.classList.add('ph-check-circle');
                }
                if (btnLabel) { btnLabel.textContent = t('hr_location_detected', 'Location detected'); }
                (detectLocationBtn as HTMLButtonElement).disabled = true;
                detectLocationBtn.classList.add('opacity-60');
            },
            () => {
                if (btnIcon) {
                    btnIcon.classList.remove('ph-spinner');
                    btnIcon.classList.add('ph-crosshair');
                }
                if (btnLabel) { btnLabel.textContent = t('hr_location_fallback', 'Could not detect — enter manually'); }
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3 — VOICE INPUT (Description)
// ═══════════════════════════════════════════════════════════════════════════
const voiceDescribeBtn = document.getElementById('voice-describe-btn');
const voiceOverlay = document.getElementById('voice-overlay');
const voiceStopBtn = document.getElementById('voice-stop-btn');
const voiceTimerEl = document.getElementById('voice-timer');
const descriptionTextarea = document.getElementById('damage-description') as HTMLTextAreaElement | null;

let voiceInterval: ReturnType<typeof setInterval> | null = null;
let voiceStart = 0;

function startVoice(): void {
    voiceStart = Date.now();
    if (voiceOverlay) { voiceOverlay.classList.remove('hidden'); }

    voiceInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - voiceStart) / 1000);
        const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const s = String(elapsed % 60).padStart(2, '0');
        if (voiceTimerEl) { voiceTimerEl.textContent = `${m}:${s}`; }
    }, 200);

    if ('vibrate' in navigator) { navigator.vibrate([40, 80, 40]); }
}

function stopVoice(): void {
    if (voiceInterval) { clearInterval(voiceInterval); }
    if (voiceOverlay) { voiceOverlay.classList.add('hidden'); }
    if (voiceTimerEl) { voiceTimerEl.textContent = '00:00'; }

    const dur = Math.floor((Date.now() - voiceStart) / 1000);
    if (dur > 1 && descriptionTextarea) {
        descriptionTextarea.value += (descriptionTextarea.value ? '\n' : '') + `[Voice note — ${dur}s recorded]`;
    }
}

if (voiceDescribeBtn) { voiceDescribeBtn.addEventListener('click', startVoice); }
if (voiceStopBtn) { voiceStopBtn.addEventListener('click', stopVoice); }

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3 — PHOTO UPLOAD + GAP-08 FIX: CLIENT-SIDE IMAGE COMPRESSION
// ═══════════════════════════════════════════════════════════════════════════
const photoUploadZone = document.getElementById('photo-upload-zone');
const photoInput = document.getElementById('photo-input') as HTMLInputElement | null;
const photoThumbnails = document.getElementById('photo-thumbnails');

/**
 * GAP-08 FIX: Compress image via Canvas before upload.
 * Max dimension: 1200px, JPEG quality: 0.75, target < 300KB.
 * Critical for Syrian 3G field operations where 5MB+ photos exhaust bandwidth.
 */
function compressImage(file: File, maxDimension = 1200, quality = 0.75): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            // Scale down if exceeds max dimension
            if (width > maxDimension || height > maxDimension) {
                const ratio = Math.min(maxDimension / width, maxDimension / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('Canvas not supported')); return; }

            ctx.drawImage(img, 0, 0, width, height);
            // Output as JPEG for maximum compression on photos
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(dataUrl);
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = URL.createObjectURL(file);
    });
}

if (photoUploadZone && photoInput) {
    photoUploadZone.addEventListener('click', () => photoInput.click());

    photoInput.addEventListener('change', async () => {
        const files = photoInput.files;
        if (!files || !photoThumbnails) { return; }

        const maxPhotos = 5;
        const count = Math.min(files.length, maxPhotos - state.photoCount);

        for (let i = 0; i < count; i++) {
            const file = files[i];
            if (!file) { continue; }

            try {
                // GAP-08: Compress before display — saves bandwidth on upload
                const compressedUrl = await compressImage(file);

                const thumb = document.createElement('div');
                thumb.className = 'size-16 rounded-lg overflow-hidden bg-slate-200 border border-slate-200 shrink-0 relative';
                thumb.innerHTML = `
          <img src="${esc(compressedUrl)}" class="w-full h-full object-cover" alt="Damage photo" />
          <div class="absolute top-0.5 right-0.5 size-4 rounded-full bg-smoky-jade flex items-center justify-center">
            <i class="ph ph-check text-white ph-xs" aria-hidden="true"></i>
          </div>
        `;
                photoThumbnails.appendChild(thumb);
                state.photoCount++;
            } catch {
                // Fallback: use raw FileReader if compression fails
                const reader = new FileReader();
                reader.onload = (e) => {
                    const thumb = document.createElement('div');
                    thumb.className = 'size-16 rounded-lg overflow-hidden bg-slate-200 border border-slate-200 shrink-0 relative';
                    thumb.innerHTML = `
            <img src="${esc(e.target?.result as string)}" class="w-full h-full object-cover" alt="Damage photo" />
            <div class="absolute top-0.5 right-0.5 size-4 rounded-full bg-smoky-jade flex items-center justify-center">
              <i class="ph ph-check text-white ph-xs" aria-hidden="true"></i>
            </div>
          `;
                    photoThumbnails.appendChild(thumb);
                    state.photoCount++;
                };
                reader.readAsDataURL(file);
            }
        }

        if (state.photoCount >= maxPhotos) {
            photoUploadZone.classList.add('opacity-50', 'pointer-events-none');
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4 — POPULATE CONFIRMATION SUMMARY
// ═══════════════════════════════════════════════════════════════════════════
function populateSummary(): void {
    const typeMap: Record<string, string> = {
        structural: 'Structural Damage',
        plumbing: 'Plumbing',
        electrical: 'Electrical',
        general: 'General Repair',
    };

    const summaryType = document.getElementById('summary-type');
    const summaryLocation = document.getElementById('summary-location');
    const summaryPhotos = document.getElementById('summary-photos');
    const summaryId = document.getElementById('summary-id');

    if (summaryType) { summaryType.textContent = typeMap[state.damageType || ''] || '—'; }
    if (summaryLocation) { summaryLocation.textContent = state.neighborhood || state.governorate || '—'; }
    if (summaryPhotos) { summaryPhotos.textContent = state.photoCount > 0 ? `${state.photoCount} uploaded` : 'None'; }
    if (summaryId) {
        // P1-002 FIX: Use real project ID from API response
        summaryId.textContent = state.projectId ?? 'Pending...';
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════
// GAP-NEW-06 FIX: Restore wizard state from sessionStorage on page load
const hasRestoredState = restoreWizardState();

if (hasRestoredState && state.currentStep > 1) {
    // Restore UI selections BEFORE showStep
    // Step 1: Re-select the damage card
    if (state.damageType) {
        const card = document.querySelector<HTMLButtonElement>(`.damage-card[data-type="${state.damageType}"]`);
        if (card) {
            card.classList.add('glass-card-active');
            const checkIcon = card.querySelector('.damage-check i');
            if (checkIcon) { checkIcon.className = 'ph ph-check-circle'; }
            const iconBox = card.querySelector('.size-14');
            if (iconBox) {
                iconBox.classList.remove('bg-slate-100', 'text-slate-600');
                iconBox.classList.add('bg-trust-blue/10', 'text-trust-blue');
            }
        }
    }
    // Step 2: Restore form values
    if (state.governorate) {
        const govSelect = document.getElementById('governorate') as HTMLSelectElement | null;
        if (govSelect) { govSelect.value = state.governorate; }
    }
    if (state.neighborhood) {
        const hoodInput = document.getElementById('neighborhood') as HTMLInputElement | null;
        if (hoodInput) { hoodInput.value = state.neighborhood; }
    }
    if (state.gpsCoords) {
        const gpsDisplay = document.getElementById('gps-display');
        const gpsResult = document.getElementById('gps-result');
        if (gpsDisplay) { gpsDisplay.textContent = state.gpsCoords; }
        if (gpsResult) { gpsResult.classList.remove('hidden'); }
    }
    // Step 3: Restore description
    if (state.description) {
        const descArea = document.getElementById('damage-description') as HTMLTextAreaElement | null;
        if (descArea) { descArea.value = state.description; }
    }

    showStep(state.currentStep);
} else {
    showStep(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// GAP-008 FIX: Unsaved Changes Guard
// Prevents data loss when navigating away from wizard with entered data.
// Critical for Syrian homeowners on slow connections who may have waited
// minutes for GPS lock and photo upload.
// Standard: Nielsen #5 — Error Prevention.
// ═══════════════════════════════════════════════════════════════════════════
function hasUnsavedData(): boolean {
    // No guard needed on confirmation step (step 4) — data already submitted
    if (state.currentStep >= 4) { return false; }
    // Check if user has entered meaningful data
    return Boolean(state.damageType) ||
           Boolean(state.governorate) ||
           Boolean(state.neighborhood) ||
           Boolean(state.description) ||
           state.photoCount > 0 ||
           Boolean(state.gpsCoords);
}

window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
    if (hasUnsavedData()) {
        e.preventDefault();
        // Modern browsers show standard text; this string is for legacy compat:
        e.returnValue = '';
    }
});
