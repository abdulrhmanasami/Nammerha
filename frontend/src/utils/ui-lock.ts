/**
 * ui-lock.ts — Glassmorphism UI Freeze for Escrow/FinTech Operations
 *
 * Prevents double-submit anxiety by instantly freezing the screen with a
 * glassmorphism overlay and a spinner.
 */
import { escapeHtml } from './xss';

// Global interceptors to guarantee cleanup and prevent ghost inputs
let _lockKeydownInterceptor: ((e: KeyboardEvent) => void) | null = null;
let _lockPopstateInterceptor: (() => void) | null = null;

export function showProcessingLock(message: string = 'جاري المعالجة...'): () => void {
  // Prevent multiple locks
  if (document.getElementById('nm-ui-lock')) return () => {};

  // 1. Ghost Keyboard Submissions (0-Day Fix)
  // Instantly blur active element so holding 'Enter' doesn't queue multiple submit events
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  const lock = document.createElement('div');
  lock.id = 'nm-ui-lock';
  // Platinum UX: Glassmorphism background, high z-index, centered content
  lock.className =
    'fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-900/40 backdrop-blur-md transition-opacity duration-300 opacity-0';

  lock.innerHTML = `
    <div class="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-5 border border-white/20 dark:border-slate-700/50 transform scale-95 transition-transform duration-300" id="nm-ui-lock-modal">
      <div class="relative flex items-center justify-center">
        <div class="absolute inset-0 bg-trust-blue/20 rounded-full blur-xl animate-pulse"></div>
        <div class="animate-spin size-14 border-4 border-trust-blue/30 border-t-trust-blue rounded-full relative z-10"></div>
        <i class="ph ph-lock-key absolute text-trust-blue text-xl z-20" aria-hidden="true"></i>
      </div>
      <p class="text-slate-800 dark:text-slate-200 font-bold text-lg tracking-wide">${escapeHtml(message)}</p>
      <p class="text-slate-500 dark:text-slate-400 text-xs font-medium max-w-[200px] text-center">يرجى الانتظار وعدم تحديث الصفحة لحين اكتمال المعالجة الآمنة</p>
    </div>
  `;

  document.body.appendChild(lock);

  // Lock scrolling
  const originalOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  // Completely intercept all normal keyboard events in the capture phase,
  // BUT preserve native browser escape routes (Refresh, DevTools, Close Tab).
  _lockKeydownInterceptor = (e: KeyboardEvent) => {
    // PLATINUM FIX: Escape Route Preservation
    if (
      e.metaKey || 
      e.ctrlKey || 
      e.altKey || 
      e.key.startsWith('F') // Allows F5, F12, etc.
    ) {
      return; // Let the browser handle system-level intents
    }
    
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener('keydown', _lockKeydownInterceptor, { capture: true });

  let isRemoved = false;

  const cleanupInterceptors = () => {
    if (_lockKeydownInterceptor) {
      window.removeEventListener('keydown', _lockKeydownInterceptor, { capture: true });
      _lockKeydownInterceptor = null;
    }
    if (_lockPopstateInterceptor) {
      window.removeEventListener('popstate', _lockPopstateInterceptor);
      _lockPopstateInterceptor = null;
    }
  };

  const removeLock = () => {
    if (isRemoved) return;
    isRemoved = true;
    cleanupInterceptors();

    lock.classList.add('opacity-0');
    document.getElementById('nm-ui-lock-modal')?.classList.add('scale-95');
    setTimeout(() => {
      lock.remove();
      document.body.style.overflow = originalOverflow;
    }, 300);
  };

  // 2. Scroll Lock Memory Leak / Bfcache Zombie Scroll Fix
  // If the user hits the browser 'Back' button while locked, the popstate event fires.
  // We instantly destroy the lock and restore scrolling, preventing a permanently locked Bfcache page.
  _lockPopstateInterceptor = () => {
    if (isRemoved) return;
    isRemoved = true;
    cleanupInterceptors();
    lock.remove(); // Remove immediately without animation to prevent breaking transitions on the new page
    document.body.style.overflow = originalOverflow;
  };
  window.addEventListener('popstate', _lockPopstateInterceptor);

  // Trigger animations in next frame
  requestAnimationFrame(() => {
    lock.classList.remove('opacity-0');
    document.getElementById('nm-ui-lock-modal')?.classList.remove('scale-95');
  });

  return removeLock;
}
