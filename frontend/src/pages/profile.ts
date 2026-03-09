import '../styles/main.css';

// ============================================================================
// Nammerha — Profile Page Engine
// P0-004 FIX: User profile, settings, and logout
// ============================================================================

// ─── Read Token & Extract User Info ─────────────────────────────────────────
function parseJWT(token: string): Record<string, unknown> | null {
    try {
        const payload = token.split('.')[1];
        if (!payload) { return null; }
        return JSON.parse(atob(payload));
    } catch (err) {
        console.warn('[Profile] JWT parse failed:', err);
        return null;
    }
}

function loadUserInfo(): void {
    const token = localStorage.getItem('nammerha_token');
    const nameEl = document.getElementById('user-name');
    const emailEl = document.getElementById('user-email');
    const roleEl = document.getElementById('user-role');

    if (!token) {
        if (nameEl) { nameEl.textContent = 'Guest'; }
        if (emailEl) { emailEl.textContent = 'Sign in to view your profile'; }
        return;
    }

    const payload = parseJWT(token);
    if (payload) {
        if (nameEl) { nameEl.textContent = (payload.full_name as string) ?? (payload.name as string) ?? 'User'; }
        if (emailEl) { emailEl.textContent = (payload.email as string) ?? '—'; }
        if (roleEl) { roleEl.textContent = ((payload.role as string) ?? 'user').toUpperCase(); }
    }
}

// ─── Language Toggle ────────────────────────────────────────────────────────
const langToggle = document.getElementById('lang-toggle');
const currentLangEl = document.getElementById('current-lang');

const langCycle = ['en', 'ar', 'tr'] as const;
const langLabels: Record<string, string> = {
    en: 'English',
    ar: 'العربية',
    tr: 'Türkçe',
};

langToggle?.addEventListener('click', () => {
    const currentLang = document.documentElement.lang || 'en';
    const idx = langCycle.indexOf(currentLang as typeof langCycle[number]);
    const nextIdx = (idx + 1) % langCycle.length;
    const next: string = langCycle[nextIdx] ?? 'en';

    // Update HTML lang attribute
    document.documentElement.lang = next;
    document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';

    // Store preference
    localStorage.setItem('nammerha_lang', next);

    // Update display
    if (currentLangEl) { currentLangEl.textContent = langLabels[next] ?? next; }

    // Trigger i18n engine refresh
    window.dispatchEvent(new CustomEvent('i18n:lang-changed', { detail: { lang: next } }));
});

// ─── Initialize Language Display ────────────────────────────────────────────
function initLangDisplay(): void {
    const lang = document.documentElement.lang || 'en';
    if (currentLangEl) { currentLangEl.textContent = langLabels[lang] ?? lang; }
}

// ─── Logout ─────────────────────────────────────────────────────────────────
function logout(): void {
    localStorage.removeItem('nammerha_token');
    localStorage.removeItem('nammerha_dev_user_id');
    window.location.href = '/auth.html';
}

document.getElementById('logout-btn')?.addEventListener('click', logout);
document.getElementById('logout-action')?.addEventListener('click', logout);

// ─── Initialize ─────────────────────────────────────────────────────────────
function init(): void {
    loadUserInfo();
    initLangDisplay();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
