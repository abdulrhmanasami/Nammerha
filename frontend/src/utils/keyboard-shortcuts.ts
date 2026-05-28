import { escapeHtml as esc } from './xss';
// ============================================================================
// Nammerha — Keyboard Shortcuts (Desktop Power Users)
// P3-UX-002 FIX: Navigation shortcuts for engineers and admins.
// ============================================================================
// Shortcuts:
//   G → D : Go to Dashboard (homepage)
//   G → P : Go to Projects
//   G → W : Go to Wallet
//   G → S : Go to Profile (Settings)
//   ?     : Show shortcut help dialog
//   /     : Focus search input
//   Esc   : Close any open dialog/overlay
//
// Architecture: Uses a 2-key "chord" pattern (G+key) inspired by GitHub.
// Only active on desktop (pointer:fine) — touch devices don't need shortcuts.
// ============================================================================

import { t } from './i18n';
// SYS-004 FIX: Dialog polyfill for older Android WebViews (Syria).
import { polyfillDialog } from './dialog-polyfill';
import { addTrackedTimer } from './tracked-timers';



let gPressed = false;
let gTimer: ReturnType<typeof setTimeout> | null = null;

const ROUTES: Record<string, string> = {
  d: '/',
  p: '/projects.html',
  w: '/wallet.html',
  s: '/profile.html',
  h: '/homeowner-portal.html',
  c: '/contractor-portal.html',
  e: '/engineer-portal.html',
};

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) {
    return false;
  }
  const tag = el.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    (el as HTMLElement).isContentEditable
  );
}

function showShortcutHelp(): void {
  // Remove existing help dialog
  document.getElementById('nm-shortcut-help')?.remove();

  const dialog = document.createElement('dialog');
  dialog.id = 'nm-shortcut-help';
  dialog.className = 'nm-confirm-dialog';

  dialog.innerHTML = `
        <div class="nm-confirm-body">
            <h3>${esc(t('keyboard_shortcuts', 'اختصارات لوحة المفاتيح'))}</h3>
            <div class="mt-3 space-y-2 text-start text-sm">
                <div class="flex justify-between"><span class="text-slate-500">G → D</span><span>${esc(t('go_dashboard', 'لوحة التحكم'))}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">G → P</span><span>${esc(t('go_projects', 'المشاريع'))}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">G → W</span><span>${esc(t('go_wallet', 'المحفظة'))}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">G → S</span><span>${esc(t('go_settings', 'الملف الشخصي'))}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">/</span><span>${esc(t('focus_search', 'البحث'))}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">?</span><span>${esc(t('show_shortcuts', 'عرض هذه المساعدة'))}</span></div>
            </div>
        </div>
        <div class="nm-confirm-actions">
            <button type="button" class="nm-confirm-cancel" id="shortcut-close">${esc(t('common_close', 'إغلاق'))}</button>
        </div>`;

  document.body.appendChild(dialog);

  dialog.querySelector('#shortcut-close')?.addEventListener('click', () => {
    dialog.close();
    dialog.remove();
  });

  dialog.addEventListener('cancel', () => {
    dialog.remove();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      dialog.close();
      dialog.remove();
    }
  });

  // SYS-004: Polyfill for older browsers before calling showModal().
  polyfillDialog(dialog);
  dialog.showModal();
}

/**
 * Initialize keyboard shortcuts.
 * Only activates on desktop (non-touch) devices.
 */
export function initKeyboardShortcuts(): void {
  // Skip on touch devices — keyboard shortcuts are desktop-only
  if (window.matchMedia('(pointer: coarse)').matches) {
    return;
  }

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    // Never intercept when user is typing in an input
    if (isInputFocused()) {
      return;
    }
    // Never intercept with modifiers (Ctrl+G, Alt+G, etc.)
    if (e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }

    const key = e.key.toLowerCase();

    // ? → Show shortcuts help
    if (key === '?' || (e.shiftKey && key === '/')) {
      e.preventDefault();
      showShortcutHelp();
      return;
    }

    // / → Focus search input
    if (key === '/' && !e.shiftKey) {
      const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
      if (searchInput) {
        e.preventDefault();
        searchInput.focus();
      }
      return;
    }

    // G chord start
    if (key === 'g' && !gPressed) {
      gPressed = true;
      if (gTimer) {
        clearTimeout(gTimer);
      }
      // Reset after 1s if no second key
      gTimer = addTrackedTimer(setTimeout(() => {
        gPressed = false;
      }, 1000));
      return;
    }

    // G chord second key
    if (gPressed) {
      gPressed = false;
      if (gTimer) {
        clearTimeout(gTimer);
        gTimer = null;
      }

      const route = ROUTES[key];
      if (route) {
        e.preventDefault();
        window.location.href = route;
      }
    }
  });
}
