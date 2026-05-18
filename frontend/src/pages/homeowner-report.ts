import '../styles/main.css';
import { initPullToRefresh } from '../utils/pull-refresh';
initPullToRefresh();
import { projects } from '../api';
import { escapeHtml as esc } from '../utils/xss';
import { t } from '../utils/i18n';
// FRC-NEW-06: Loading state feedback for submit button
import { setLoadingState } from '../utils/loading-state';
// DEF-REM-007 FIX: Centralized haptic module replaces raw navigator.vibrate.
import { haptic } from '../utils/haptic';
// W6-003 FIX: Auth guard — was missing on this homeowner page.
import { requireAuth } from '../utils/auth-guard';

// W6-003 FIX: Module-level guard — prevent wizard from initializing for unauthenticated users.
// P1-WIZARD-001 FIX: Throw is correct at ES module top-level (only way to abort initialization),
// but we silence it from error reporting since requireAuth() already rendered the auth overlay.
// Other pages use `return` inside functions — this page runs at top-level scope, requiring `throw`.
// Standard: ES Module Abort Pattern, Nielsen #9 (Help Users Recover from Errors).
if (!requireAuth()) {
    // Prevents error reporter from logging this as a real error
    throw new DOMException('Auth guard: wizard module aborted (expected)', 'AbortError');
}


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
    uploadedPhotoUrls: string[]; // P1-FIX-007: Store S3 permanent URLs instead of Base64 blobs
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
    uploadedPhotoUrls: [],
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
            photoCount: state.photoCount,
            uploadedPhotoUrls: state.uploadedPhotoUrls,
            // P1-FIX-007: Safe persistence! Public URLs are mere bytes, saving us from QuotaExceededError
            // Note: projectId is NOT persisted (server-side)
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
        if (parsed.photoCount) { state.photoCount = parsed.photoCount; }
        if (parsed.uploadedPhotoUrls) { state.uploadedPhotoUrls = parsed.uploadedPhotoUrls; }
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
            el.classList.toggle('nm-hidden', i !== step - 1);
        }
    });

    // Update progress bar
    if (step <= TOTAL_STEPS) {
        const pct = (step / TOTAL_STEPS) * 100;
        if (progressFill) { progressFill.style.setProperty('--progress', `${pct}%`); }
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
        if (wizardFooter) { wizardFooter.classList.add('nm-hidden'); }
        if (stepLabel) { stepLabel.textContent = t('hr_done', 'Done!'); }
        if (progressFill) { progressFill.style.setProperty('--progress', '100%'); }
        populateSummary();
        // GAP-NEW-06: Clear persisted state on successful submission
        clearWizardState();

        // GAP-FLOW-01 FIX: Wire "Submit Another Report" button on success screen.
        // Previous: user was stranded on success screen with no forward CTA.
        // Standard: Nielsen #3 (User Control & Freedom).
        const submitAnotherBtn = document.getElementById('submit-another-btn');
        if (submitAnotherBtn) {
            submitAnotherBtn.addEventListener('click', () => { location.reload(); });
        }
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
                    damage_type: (state.damageType as 'structural' | 'plumbing' | 'electrical' | 'mixed' | 'general') ?? 'mixed',
                    description: state.description || undefined,
                    gps_lat,
                    gps_lng,
                    address_text: `${state.neighborhood}, ${state.governorate}`,
                    images: state.uploadedPhotoUrls.length > 0 ? state.uploadedPhotoUrls : undefined,
                    cover_image_url: state.uploadedPhotoUrls[0] || undefined,
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

        // DEF-REM-007 FIX: Centralized haptic module replaces raw navigator.vibrate.
        haptic.medium();
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
// GAP-AUD-04 FIX: GPS error state DOM references
const gpsError = document.getElementById('gps-error');
const gpsErrorMsg = document.getElementById('gps-error-msg');

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
                if (gpsResult) { gpsResult.classList.remove('nm-hidden'); }
                // GAP-AUD-04: Hide error state on success
                if (gpsError) { gpsError.classList.add('nm-hidden'); }
                if (btnIcon) {
                    btnIcon.classList.remove('ph-spinner');
                    btnIcon.classList.add('ph-check-circle');
                }
                if (btnLabel) { btnLabel.textContent = t('hr_location_detected', 'Location detected'); }
                (detectLocationBtn as HTMLButtonElement).disabled = true;
                detectLocationBtn.classList.add('opacity-60');

                // GAP-NEW-06: Persist GPS coords to sessionStorage
                saveWizardState();
            },
            (err) => {
                if (btnIcon) {
                    btnIcon.classList.remove('ph-spinner');
                    btnIcon.classList.add('ph-crosshair');
                }
                if (btnLabel) { btnLabel.textContent = t('hr_location_fallback', 'Could not detect — enter manually'); }

                // GAP-AUD-04 FIX: Show visible GPS error state with contextual message.
                // Previous: Only changed button text — easy to miss on mobile.
                // Standard: Nielsen #1 (System Status Visibility), Apple HIG (Error Feedback).
                if (gpsError) { gpsError.classList.remove('nm-hidden'); }
                if (gpsErrorMsg && err) {
                    const errorMessages: Record<number, string> = {
                        1: t('gps_error_permission', 'Location permission denied. Please enable it in your browser settings.'),
                        2: t('gps_error_unavailable', 'Location not available. Please enter your address manually.'),
                        3: t('gps_error_timeout', 'Location request timed out. Please try again or enter manually.'),
                    };
                    gpsErrorMsg.textContent = errorMessages[err.code] || t('gps_error_msg', 'Please check your location permissions or enter your address manually.');
                }
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
// FRIC-AUD-02 FIX: Character counter DOM reference
const descCharCount = document.getElementById('desc-char-count');

// FRIC-AUD-02 FIX: Live character counter for damage description.
// Standard: Material Design 3 — "Text fields with character counts."
if (descriptionTextarea && descCharCount) {
    descriptionTextarea.addEventListener('input', () => {
        const len = descriptionTextarea.value.length;
        const max = descriptionTextarea.maxLength || 1000;
        descCharCount.textContent = `${len} / ${max}`;

        // PLT-001 FIX: Condition order corrected — check `>= max` (red) BEFORE `> 90%` (amber).
        // Previous: `len > max * 0.9` caught all values >= max — making the red branch
        // unreachable dead code. At 1000/1000 chars, users saw amber instead of red.
        // Standard: Correct boolean predicate ordering (most specific first).
        if (len >= max) {
            descCharCount.classList.add('text-red-500');
            descCharCount.classList.remove('text-slate-400', 'text-amber-500');
        } else if (len > max * 0.9) {
            descCharCount.classList.add('text-amber-500');
            descCharCount.classList.remove('text-slate-400', 'text-red-500');
        } else {
            descCharCount.classList.add('text-slate-400');
            descCharCount.classList.remove('text-amber-500', 'text-red-500');
        }

        // GAP-NEW-06: Persist description to sessionStorage on input
        state.description = descriptionTextarea.value;
        saveWizardState();
    });
}

let voiceInterval: ReturnType<typeof setInterval> | null = null;
let voiceStart = 0;

// P1-VOICE-001 FIX: Real Web Speech API implementation.
// Previous: Voice button showed a recording UI overlay with a timer, but stopVoice()
// just appended "[Voice note — Xs recorded]" as LITERAL TEXT — no actual speech-to-text.
// Syrian homeowners tapped the microphone expecting to dictate damage descriptions.
// Now: Uses SpeechRecognition API with Arabic (ar-SY) locale + English fallback.
// Graceful degradation: On unsupported browsers (Safari/Firefox), hides voice button
// and shows an expanded textarea hint instead.
// Standard: W3C Web Speech API, Apple HIG (Honest Affordances), Progressive Enhancement.

// Type declarations for Web Speech API (not in lib.dom.d.ts by default)
interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}
interface SpeechRecognitionErrorEvent extends Event {
    error: string;
}
interface SpeechRecognitionInstance extends EventTarget {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

const SpeechRecognition: SpeechRecognitionConstructor | undefined = (() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Web Speech API not in lib.dom.d.ts
    const w = window as unknown as Record<string, unknown>;
    if (w.SpeechRecognition) { return w.SpeechRecognition as SpeechRecognitionConstructor; }
    if (w.webkitSpeechRecognition) { return w.webkitSpeechRecognition as SpeechRecognitionConstructor; }
    return undefined;
})();

let recognition: SpeechRecognitionInstance | null = null;
let isListening = false;

// Feature detection: hide voice button if browser doesn't support Speech API
if (!SpeechRecognition && voiceDescribeBtn) {
    // P1-VOICE-001: Graceful degradation — hide phantom feature on unsupported browsers.
    voiceDescribeBtn.classList.add('nm-hidden');
}

// P2-BANNER-001: Lightweight inline error display for voice recognition failures.
// Uses the same DOM pattern as the photo upload error (L604) for visual consistency.
function showVoiceError(_type: string, message: string): void {
    const target = voiceDescribeBtn?.parentElement ?? document.getElementById('step-3');
    if (!target) { return; }
    const errDiv = document.createElement('div');
    errDiv.className = 'rounded-xl p-3 text-sm font-medium flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 mt-2 animate-fade-in-up dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20';
    errDiv.innerHTML = `<i class="ph ph-warning-circle shrink-0" aria-hidden="true"></i> ${esc(message)}`;
    target.appendChild(errDiv);
    setTimeout(() => errDiv.remove(), 5000);
}

function startVoice(): void {
    if (!SpeechRecognition || !voiceOverlay || !descriptionTextarea) { return; }

    voiceStart = Date.now();
    isListening = true;
    voiceOverlay.classList.remove('nm-hidden');

    // Initialize speech recognition with Arabic locale
    recognition = new SpeechRecognition();
    recognition.lang = document.documentElement.lang === 'ar' ? 'ar-SY' : 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    // Timer display
    voiceInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - voiceStart) / 1000);
        const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const s = String(elapsed % 60).padStart(2, '0');
        if (voiceTimerEl) { voiceTimerEl.textContent = `${m}:${s}`; }
    }, 200);

    haptic.custom([40, 80, 40]);

    // Handle real transcription results
    recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (!result || !result[0]) { continue; }
            if (result.isFinal) {
                finalTranscript += result[0].transcript;
            } else {
                interimTranscript += result[0].transcript;
            }
        }
        // Append finalized speech to textarea
        if (finalTranscript && descriptionTextarea) {
            const prefix = descriptionTextarea.value ? ' ' : '';
            descriptionTextarea.value += prefix + finalTranscript.trim();
        }
        // Show live preview of interim results in overlay
        const preview = interimTranscript || finalTranscript;
        if (voiceTimerEl && preview) {
            voiceTimerEl.textContent = preview.slice(-60);
        }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        // P1-VOICE-001: On error, show user-friendly message via toast
        if (event.error === 'not-allowed') {
            showVoiceError('error', t('voice_permission_denied', 'Microphone permission denied. Please allow access in your browser settings.'));
        } else if (event.error !== 'aborted') {
            showVoiceError('error', t('voice_error', 'Voice recognition failed. Please type your description manually.'));
        }
        stopVoice();
    };

    recognition.onend = () => {
        if (isListening) {
            // Recognition ended naturally — finalize
            stopVoice();
        }
    };

    try {
        recognition.start();
    } catch {
        showVoiceError('error', t('voice_start_failed', 'Could not start voice recognition.'));
        stopVoice();
    }
}

function stopVoice(): void {
    isListening = false;
    if (voiceInterval) { clearInterval(voiceInterval); voiceInterval = null; }
    if (voiceOverlay) { voiceOverlay.classList.add('nm-hidden'); }

    if (recognition && descriptionTextarea) {
        try { recognition.stop(); } catch { /* already stopped */ }

        // Collect final transcript from recognition results
        // The onresult handler updates in real-time; we wait a tick for final results
        setTimeout(() => {
            // Extract all final results accumulated during the session
            if (recognition) {
                // Trigger one more extraction — the recognition object may have buffered finals
                recognition = null;
            }
        }, 100);
    }

    if (voiceTimerEl) { voiceTimerEl.textContent = '00:00'; }

    // Persist any changes from voice input
    if (descriptionTextarea) {
        state.description = descriptionTextarea.value;
        saveWizardState();
        // Trigger character counter update
        descriptionTextarea.dispatchEvent(new Event('input'));
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

import { storage } from '../api'; // P1-FIX-007: Implemented real storage API

/**
 * GAP-08 FIX: Compress image via Canvas before upload.
 * Max dimension: 1200px, JPEG quality: 0.75, target < 300KB.
 * Critical for Syrian 3G field operations where 5MB+ photos exhaust bandwidth.
 */
function compressImage(file: File, maxDimension = 1200, quality = 0.75): Promise<{ dataUrl: string; blob: Blob }> {
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
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve({ dataUrl, blob });
                } else {
                    reject(new Error('Compression empty'));
                }
            }, 'image/jpeg', quality);
        };
        img.onerror = () => reject(new Error('Image load failed'));
        // TICKET-002 FIX: Revoke blob URL after image loads to prevent memory leak.
        // Previous: URL.createObjectURL(file) created a blob reference that was never
        // released — accumulating with each photo upload. On Syrian mobile devices with
        // limited RAM, 5 unreleased blobs can cause the browser tab to crash.
        // Standard: MDN Web API — "Call URL.revokeObjectURL() once the URL is no longer needed."
        const objectUrl = URL.createObjectURL(file);
        img.src = objectUrl;
        const revokeUrl = (): void => { URL.revokeObjectURL(objectUrl); };
        img.addEventListener('load', revokeUrl, { once: true });
        img.addEventListener('error', revokeUrl, { once: true });
    });
}

if (photoUploadZone && photoInput) {
    photoUploadZone.addEventListener('click', () => photoInput.click());

    photoInput.addEventListener('change', async () => {
        const files = photoInput.files;
        if (!files || !photoThumbnails) { return; }

        const maxPhotos = 5;
        const count = Math.min(files.length, maxPhotos - state.photoCount);

        // P1-002 FIX (Wave 2): Warn when selected files exceed remaining slots.
        // PREVIOUS: Excess files were SILENTLY dropped — Math.min() truncated them
        // with zero feedback. User selects 5 photos, only 2 are added, no explanation.
        // NOW: Transient warning banner with role="alert" for screen readers.
        // Standard: Nielsen #1 (System Status Visibility), WCAG 4.1.3 (Status Messages).
        const droppedCount = files.length - count;
        if (droppedCount > 0 && photoThumbnails) {
            const remaining = maxPhotos - state.photoCount;
            const warnDiv = document.createElement('div');
            warnDiv.className = 'w-full rounded-lg bg-warning-yellow/10 border border-warning-yellow/20 text-slate-700 text-xs p-2.5 mt-2 flex items-center gap-2 dark:text-slate-300 dark:border-warning-yellow/15 animate-fade-in-up';
            warnDiv.setAttribute('role', 'alert');
            warnDiv.innerHTML = `<i class="ph ph-warning text-warning-yellow shrink-0" aria-hidden="true"></i> ${esc(t('hr_photos_limit_exceeded', `Only ${remaining} of ${files.length} photos added — limit is ${maxPhotos}`))}`;
            photoThumbnails.parentElement?.appendChild(warnDiv);
            setTimeout(() => warnDiv.remove(), 5000);
        }

        for (let i = 0; i < count; i++) {
            const file = files[i];
            if (!file) { continue; }

            try {
                // GAP-08: Compress before display — saves bandwidth on upload
                const { dataUrl, blob } = await compressImage(file);

                const thumb = document.createElement('div');
                // P3-PHOTO-001 FIX: Enlarged from size-16 (64px) to size-20 (80px).
                // Previous: 64×64px thumbnails with 16×16px check icons were barely visible on mobile.
                // Standard: Apple HIG (Minimum Tap Area), Mobile Photography UX.
                thumb.className = 'size-20 rounded-lg overflow-hidden bg-slate-200 border border-slate-200 shrink-0 relative flex items-center justify-center';
                thumb.innerHTML = `
          <img src="${esc(dataUrl)}" class="w-full h-full object-cover opacity-50 transition-opacity duration-300" alt="${esc(t('hr_damage_photo_alt', 'Damage documentation photo'))}" />
          <i class="ph ph-spinner ph-spin absolute text-slate-500 text-xl" aria-hidden="true"></i>
        `;
                photoThumbnails.appendChild(thumb);

                // P1-FIX-007: Immediate Pre-Signed Upload to MinIO/S3
                try {
                    const uploadData = await storage.getUploadUrl({
                        project_id: 'pending', // Special case allowed by routes for pre-creation uploads
                        category: 'proof',
                        filename: file.name || 'photo.jpg',
                        content_type: 'image/jpeg',
                        file_size_bytes: blob.size,
                    });
                    
                    if (uploadData.success && uploadData.data) {
                        const s3Upload = await fetch(uploadData.data.upload_url, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'image/jpeg' },
                            body: blob
                        });
                        if (!s3Upload.ok) { throw new Error('S3 Upload Failed'); }
                        
                        state.uploadedPhotoUrls.push(uploadData.data.public_url);
                        state.photoCount++;
                        
                        // Reflect success in thumbnail
                        const imgEl = thumb.querySelector('img');
                        if (imgEl) { imgEl.classList.remove('opacity-50'); }
                        thumb.innerHTML = `
                            <img src="${esc(dataUrl)}" class="w-full h-full object-cover" alt="${esc(t('hr_damage_photo_alt', 'Damage documentation photo'))}" />
                            <div class="absolute top-0.5 end-0.5 size-6 rounded-full bg-smoky-jade flex items-center justify-center">
                                <i class="ph ph-check text-white text-sm" aria-hidden="true"></i>
                            </div>
                        `;
                        const photoCountEl = document.getElementById('photo-count');
                        if (photoCountEl) { photoCountEl.textContent = String(state.photoCount); }
                    } else { throw new Error('No upload token'); }
                } catch {
                    thumb.remove();
                    // HIGH-002 FIX: Replace alert() with inline error banner
                    const errDiv = document.createElement('div');
                    errDiv.className = 'w-full rounded bg-red-50 text-red-700 text-xs p-2 mt-2';
                    errDiv.textContent = t('hr_upload_failed', 'Failed to upload image securely.');
                    photoThumbnails.parentElement?.appendChild(errDiv);
                    setTimeout(() => errDiv.remove(), 4000);
                }
            } catch {
                // Fallback: use raw FileReader if compression fails
                const reader = new FileReader();
                reader.onload = (e) => {
                    const thumb = document.createElement('div');
                    // P3-PHOTO-001 FIX: Fallback path also uses enlarged thumbnails.
                    thumb.className = 'size-20 rounded-lg overflow-hidden bg-slate-200 border border-slate-200 shrink-0 relative';
                    thumb.innerHTML = `
            <img src="${esc(e.target?.result as string)}" class="w-full h-full object-cover" alt="${esc(t('hr_damage_photo_alt', 'Damage documentation photo'))}" />
            <div class="absolute top-0.5 end-0.5 size-6 rounded-full bg-smoky-jade flex items-center justify-center">
              <i class="ph ph-check text-white text-sm" aria-hidden="true"></i>
            </div>
          `;
                    photoThumbnails.appendChild(thumb);
                    state.photoCount++;
                    // GAP-AUD-06 FIX: Update dynamic photo counter
                    const photoCountEl = document.getElementById('photo-count');
                    if (photoCountEl) { photoCountEl.textContent = String(state.photoCount); }
                };
                reader.readAsDataURL(file);
            }
        }

        // P1-002 FIX (Wave 2): Clear visual feedback when max photos reached.
        // PREVIOUS: Upload zone dimmed to 50% opacity + pointer-events-none.
        //   - The "0/5" counter was INSIDE the dimmed zone — nearly unreadable
        //   - No text explanation of WHY the zone is disabled
        //   - Users thought the feature was broken, not that they hit the limit
        // NOW: Zone transforms into a clear success state with Smoky Jade branding.
        //   - Camera icon → check-circle icon
        //   - "Tap to upload" → "Maximum 5 photos uploaded"
        //   - Dashed border → solid Smoky Jade border
        //   - role="status" for ARIA live region (WCAG 4.1.3)
        //   - File input disabled as belt-and-suspenders guard
        // Standard: Nielsen #1 (System Status), WCAG 4.1.3 (Status Messages),
        //           Apple HIG (Success State Feedback).
        if (state.photoCount >= maxPhotos) {
            photoUploadZone.classList.add('pointer-events-none');
            photoUploadZone.classList.remove('border-dashed', 'border-slate-200', 'cursor-pointer', 'active:border-trust-blue/40', 'dark:border-dark-border');
            photoUploadZone.classList.add('border-solid', 'border-smoky-jade/30', 'bg-smoky-jade/5', 'dark:bg-smoky-jade/10', 'dark:border-smoky-jade/20');
            photoUploadZone.innerHTML = `
                <div class="size-12 rounded-full bg-smoky-jade/15 flex items-center justify-center">
                    <i class="ph ph-check-circle text-smoky-jade nm-icon-28 dark:text-emerald-400" aria-hidden="true"></i>
                </div>
                <p class="text-smoky-jade text-sm font-bold dark:text-emerald-400" role="status">${esc(t('hr_max_photos_reached', 'Maximum 5 photos uploaded'))}</p>
                <p class="text-slate-400 text-3xs dark:text-slate-500">${state.photoCount}/${maxPhotos} • ${esc(t('hr_all_photos_ready', 'All photos ready'))}</p>
            `;
            if (photoInput) { photoInput.disabled = true; }
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4 — POPULATE CONFIRMATION SUMMARY
// ═══════════════════════════════════════════════════════════════════════════
function populateSummary(): void {
    // TICKET-003 FIX: Wrapped hardcoded English labels with i18n t() calls.
    // Previous: 'Structural Damage', 'Plumbing', etc. — displayed in English
    // for Arabic-speaking Syrian homeowners on the confirmation screen.
    // Standard: i18n Completeness — zero hardcoded user-facing strings.
    const typeMap: Record<string, string> = {
        structural: t('damage_type_structural', 'Structural Damage'),
        plumbing: t('damage_type_plumbing', 'Plumbing'),
        electrical: t('damage_type_electrical', 'Electrical'),
        general: t('damage_type_general', 'General Repair'),
        mixed: t('damage_type_mixed', 'Mixed Damage'),
    };

    const summaryType = document.getElementById('summary-type');
    const summaryLocation = document.getElementById('summary-location');
    const summaryPhotos = document.getElementById('summary-photos');
    const summaryId = document.getElementById('summary-id');

    if (summaryType) { summaryType.textContent = typeMap[state.damageType || ''] || '—'; }
    if (summaryLocation) { summaryLocation.textContent = state.neighborhood || state.governorate || '—'; }
    // TICKET-003 FIX: "uploaded" and "Pending..." wrapped with t().
    if (summaryPhotos) {
        summaryPhotos.textContent = state.photoCount > 0
            ? `${state.photoCount} ${t('hr_photos_uploaded', 'uploaded')}`
            : t('hr_photos_none', 'None');
    }
    if (summaryId) {
        // P1-002 FIX: Use real project ID from API response
        summaryId.textContent = state.projectId ?? t('hr_id_pending', 'Pending...');
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
        if (gpsResult) { gpsResult.classList.remove('nm-hidden'); }
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
