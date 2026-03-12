import '../styles/main.css';
import { getCurrentUser, clearAuth } from '../auth';

// ============================================================================
// Nammerha — Profile Page Engine
// P0-004 FIX: User profile, settings, and logout
// V1-AUDIT FIX: No longer reads JWT from localStorage — uses auth module
// ============================================================================

// ─── Load User Info ─────────────────────────────────────────────────────────
async function loadUserInfo(): Promise<void> {
    const nameEl = document.getElementById('user-name');
    const emailEl = document.getElementById('user-email');
    const roleEl = document.getElementById('user-role');

    // Try cached profile first (fast render)
    const cached = getCurrentUser();
    if (cached) {
        if (nameEl) { nameEl.textContent = cached.full_name ?? 'User'; }
        if (emailEl) { emailEl.textContent = cached.email ?? '—'; }
        if (roleEl) { roleEl.textContent = cached.role.toUpperCase(); }
    }

    // V1-AUDIT FIX: Fetch fresh from /api/auth/me (httpOnly cookie sent automatically)
    try {
        const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (res.ok) {
            const data = await res.json() as { data?: { user?: { full_name?: string; email?: string; role?: string } } };
            const user = data.data?.user;
            if (user) {
                if (nameEl) { nameEl.textContent = user.full_name ?? 'User'; }
                if (emailEl) { emailEl.textContent = user.email ?? '—'; }
                if (roleEl) { roleEl.textContent = (user.role ?? 'user').toUpperCase(); }
            }
        } else if (!cached) {
            if (nameEl) { nameEl.textContent = 'Guest'; }
            if (emailEl) { emailEl.textContent = 'Sign in to view your profile'; }
        }
    } catch {
        // Network error — fall back to cached data (already rendered above)
        if (!cached) {
            if (nameEl) { nameEl.textContent = 'Guest'; }
            if (emailEl) { emailEl.textContent = 'Sign in to view your profile'; }
        }
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
    // V1-AUDIT FIX: clearAuth() now calls POST /api/auth/logout to clear httpOnly cookie
    clearAuth();
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
