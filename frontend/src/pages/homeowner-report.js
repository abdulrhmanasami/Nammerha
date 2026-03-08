import '../styles/main.css';
const state = {
    currentStep: 1,
    damageType: null,
    governorate: '',
    neighborhood: '',
    gpsCoords: null,
    description: '',
    photoCount: 0,
};
const TOTAL_STEPS = 3;
// ═══════════════════════════════════════════════════════════════════════════
// DOM REFERENCES
// ═══════════════════════════════════════════════════════════════════════════
const stepLabel = document.getElementById('step-label');
const progressFill = document.getElementById('progress-fill');
const nextBtn = document.getElementById('next-btn');
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
function showStep(step) {
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
        if (progressFill)
            progressFill.style.width = `${pct}%`;
        if (stepLabel)
            stepLabel.textContent = `Step ${step} of ${TOTAL_STEPS}`;
    }
    // Update button text and state
    if (step === 1) {
        updateNextButton();
    }
    else if (step === 2) {
        updateNextButton();
    }
    else if (step === 3) {
        if (nextBtnText)
            nextBtnText.textContent = 'Submit Request';
        if (nextBtn) {
            nextBtn.disabled = false;
            const icon = nextBtn.querySelector('.ph-arrow-right');
            if (icon) {
                icon.classList.remove('ph-arrow-right');
                icon.classList.add('ph-paper-plane-tilt');
            }
        }
    }
    else if (step === 4) {
        // Confirmation step — hide footer
        if (wizardFooter)
            wizardFooter.classList.add('hidden');
        if (stepLabel)
            stepLabel.textContent = 'Done!';
        if (progressFill)
            progressFill.style.width = '100%';
        populateSummary();
    }
}
function updateNextButton() {
    if (!nextBtn || !nextBtnText)
        return;
    if (state.currentStep === 1) {
        nextBtn.disabled = !state.damageType;
        nextBtnText.textContent = state.damageType ? 'Next Step' : 'Select damage type';
    }
    else if (state.currentStep === 2) {
        const gov = document.getElementById('governorate')?.value;
        const hood = document.getElementById('neighborhood')?.value.trim();
        nextBtn.disabled = !gov || !hood;
        nextBtnText.textContent = (gov && hood) ? 'Next Step' : 'Enter location details';
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION BUTTONS
// ═══════════════════════════════════════════════════════════════════════════
if (nextBtn) {
    nextBtn.addEventListener('click', () => {
        if (state.currentStep === 1 && state.damageType) {
            showStep(2);
        }
        else if (state.currentStep === 2) {
            const gov = document.getElementById('governorate')?.value;
            const hood = document.getElementById('neighborhood')?.value.trim();
            if (gov && hood) {
                state.governorate = gov;
                state.neighborhood = hood;
                showStep(3);
            }
        }
        else if (state.currentStep === 3) {
            state.description = document.getElementById('damage-description')?.value.trim() || '';
            showStep(4);
        }
    });
}
if (backBtn) {
    backBtn.addEventListener('click', () => {
        if (state.currentStep === 1) {
            window.location.href = 'index.html';
        }
        else if (state.currentStep <= TOTAL_STEPS) {
            showStep(state.currentStep - 1);
        }
        else if (state.currentStep === 4) {
            // From confirmation, go back to home
            window.location.href = 'index.html';
        }
    });
}
// ═══════════════════════════════════════════════════════════════════════════
// STEP 1 — DAMAGE TYPE CARD SELECTION
// ═══════════════════════════════════════════════════════════════════════════
const damageCards = document.querySelectorAll('.damage-card');
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
        if ('vibrate' in navigator)
            navigator.vibrate(30);
    });
});
// ═══════════════════════════════════════════════════════════════════════════
// STEP 2 — LOCATION: Governorate + Neighborhood + GPS
// ═══════════════════════════════════════════════════════════════════════════
const governorateSelect = document.getElementById('governorate');
const neighborhoodInput = document.getElementById('neighborhood');
if (governorateSelect)
    governorateSelect.addEventListener('change', updateNextButton);
if (neighborhoodInput)
    neighborhoodInput.addEventListener('input', updateNextButton);
// GPS auto-detect
const detectLocationBtn = document.getElementById('detect-location-btn');
const gpsResult = document.getElementById('gps-result');
const gpsDisplay = document.getElementById('gps-display');
if (detectLocationBtn) {
    detectLocationBtn.addEventListener('click', () => {
        if (!('geolocation' in navigator)) {
            alert('Geolocation is not supported on this device.');
            return;
        }
        const btnIcon = detectLocationBtn.querySelector('.ph-crosshair');
        if (btnIcon) {
            btnIcon.classList.remove('ph-crosshair');
            btnIcon.classList.add('ph-spinner');
        }
        const btnLabel = detectLocationBtn.querySelector('span');
        if (btnLabel)
            btnLabel.textContent = 'Detecting...';
        navigator.geolocation.getCurrentPosition((pos) => {
            const lat = pos.coords.latitude.toFixed(5);
            const lon = pos.coords.longitude.toFixed(5);
            state.gpsCoords = `${lat}° N, ${lon}° E`;
            if (gpsDisplay)
                gpsDisplay.textContent = state.gpsCoords;
            if (gpsResult)
                gpsResult.classList.remove('hidden');
            if (btnIcon) {
                btnIcon.classList.remove('ph-spinner');
                btnIcon.classList.add('ph-check-circle');
            }
            if (btnLabel)
                btnLabel.textContent = 'Location detected';
            detectLocationBtn.disabled = true;
            detectLocationBtn.classList.add('opacity-60');
        }, () => {
            if (btnIcon) {
                btnIcon.classList.remove('ph-spinner');
                btnIcon.classList.add('ph-crosshair');
            }
            if (btnLabel)
                btnLabel.textContent = 'Could not detect — enter manually';
        }, { enableHighAccuracy: true, timeout: 8000 });
    });
}
// ═══════════════════════════════════════════════════════════════════════════
// STEP 3 — VOICE INPUT (Description)
// ═══════════════════════════════════════════════════════════════════════════
const voiceDescribeBtn = document.getElementById('voice-describe-btn');
const voiceOverlay = document.getElementById('voice-overlay');
const voiceStopBtn = document.getElementById('voice-stop-btn');
const voiceTimerEl = document.getElementById('voice-timer');
const descriptionTextarea = document.getElementById('damage-description');
let voiceInterval = null;
let voiceStart = 0;
function startVoice() {
    voiceStart = Date.now();
    if (voiceOverlay)
        voiceOverlay.classList.remove('hidden');
    voiceInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - voiceStart) / 1000);
        const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const s = String(elapsed % 60).padStart(2, '0');
        if (voiceTimerEl)
            voiceTimerEl.textContent = `${m}:${s}`;
    }, 200);
    if ('vibrate' in navigator)
        navigator.vibrate([40, 80, 40]);
}
function stopVoice() {
    if (voiceInterval)
        clearInterval(voiceInterval);
    if (voiceOverlay)
        voiceOverlay.classList.add('hidden');
    if (voiceTimerEl)
        voiceTimerEl.textContent = '00:00';
    const dur = Math.floor((Date.now() - voiceStart) / 1000);
    if (dur > 1 && descriptionTextarea) {
        descriptionTextarea.value += (descriptionTextarea.value ? '\n' : '') + `[Voice note — ${dur}s recorded]`;
    }
}
if (voiceDescribeBtn)
    voiceDescribeBtn.addEventListener('click', startVoice);
if (voiceStopBtn)
    voiceStopBtn.addEventListener('click', stopVoice);
// ═══════════════════════════════════════════════════════════════════════════
// STEP 3 — PHOTO UPLOAD
// ═══════════════════════════════════════════════════════════════════════════
const photoUploadZone = document.getElementById('photo-upload-zone');
const photoInput = document.getElementById('photo-input');
const photoThumbnails = document.getElementById('photo-thumbnails');
if (photoUploadZone && photoInput) {
    photoUploadZone.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', () => {
        const files = photoInput.files;
        if (!files || !photoThumbnails)
            return;
        const maxPhotos = 5;
        const count = Math.min(files.length, maxPhotos - state.photoCount);
        for (let i = 0; i < count; i++) {
            const file = files[i];
            if (!file)
                continue;
            const reader = new FileReader();
            reader.onload = (e) => {
                const thumb = document.createElement('div');
                thumb.className = 'size-16 rounded-lg overflow-hidden bg-slate-200 border border-slate-200 shrink-0 relative';
                thumb.innerHTML = `
          <img src="${e.target?.result}" class="w-full h-full object-cover" alt="Damage photo" />
          <div class="absolute top-0.5 right-0.5 size-4 rounded-full bg-smoky-jade flex items-center justify-center">
            <i class="ph ph-check text-white ph-xs" aria-hidden="true"></i>
          </div>
        `;
                photoThumbnails.appendChild(thumb);
                state.photoCount++;
            };
            reader.readAsDataURL(file);
        }
        if (state.photoCount >= maxPhotos) {
            photoUploadZone.classList.add('opacity-50', 'pointer-events-none');
        }
    });
}
// ═══════════════════════════════════════════════════════════════════════════
// STEP 4 — POPULATE CONFIRMATION SUMMARY
// ═══════════════════════════════════════════════════════════════════════════
function populateSummary() {
    const typeMap = {
        structural: 'Structural Damage',
        plumbing: 'Plumbing',
        electrical: 'Electrical',
        general: 'General Repair',
    };
    const summaryType = document.getElementById('summary-type');
    const summaryLocation = document.getElementById('summary-location');
    const summaryPhotos = document.getElementById('summary-photos');
    const summaryId = document.getElementById('summary-id');
    if (summaryType)
        summaryType.textContent = typeMap[state.damageType || ''] || '—';
    if (summaryLocation)
        summaryLocation.textContent = state.neighborhood || state.governorate || '—';
    if (summaryPhotos)
        summaryPhotos.textContent = state.photoCount > 0 ? `${state.photoCount} uploaded` : 'None';
    if (summaryId) {
        const id = `NMR-REQ-${Date.now().toString(36).toUpperCase().slice(-6)}`;
        summaryId.textContent = id;
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════
showStep(1);
