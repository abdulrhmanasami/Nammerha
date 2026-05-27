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
let _lockTouchInterceptor: ((e: TouchEvent) => void) | null = null;

export function showProcessingLock(message: string = 'جاري المعالجة...'): () => void {
  // Prevent multiple locks
  if (document.getElementById('nm-ui-lock')) {return () => {};}

  // 1. Ghost Keyboard Submissions (0-Day Fix)
  // Instantly blur active element so holding 'Enter' doesn't queue multiple submit events
  // PLATINUM FIX: SVG Focus Trap Bypass. Use duck typing to catch SVGElements.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (document.activeElement && typeof (document.activeElement as any).blur === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document.activeElement as any).blur();
  }

  const lock = document.createElement('div');
  lock.id = 'nm-ui-lock';
  // PLATINUM FIX: Accessibility Roles (alertdialog) & Keyboard Focus Trap
  lock.setAttribute('role', 'alertdialog');
  lock.setAttribute('aria-modal', 'true');
  lock.setAttribute('aria-busy', 'true');
  lock.tabIndex = 0; // Make focusable for screen readers
  // Platinum UX: Glassmorphism background, high z-index, centered content
  lock.className =
    'fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-900/40 backdrop-blur-md transition-opacity duration-300 opacity-0 outline-none';

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

    // PLATINUM FIX: WCAG 2.1 AAA Focus Trap Paradox (Focus Trap Escape Paradox Fix)
    // Instead of blocking Tab or resetting focus to the root, we implement a proper
    // circular focus trap that keeps navigation confined to the modal's actionable elements.
    if (e.key === 'Tab') {
      const focusableElements = lock.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const focusable = Array.from(focusableElements);
      
      // If nothing is focusable inside, just hold focus on the lock itself
      if (focusable.length === 0) {
        e.preventDefault();
        lock.focus();
        return;
      }
      
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      
      // PLATINUM FIX: Absolute Boundary Trap
      // querySelectorAll does not include the root 'lock' element itself.
      // If focus is currently on the root 'lock' container, route it deterministically.
      if (document.activeElement === lock) {
        e.preventDefault();
        if (e.shiftKey) {
          last?.focus();
        } else {
          first?.focus();
        }
        return;
      }
      
      // If focus somehow leaked outside the focusable list entirely, snap it back
      if (!focusable.includes(document.activeElement as HTMLElement)) {
        e.preventDefault();
        lock.focus();
        return;
      }

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
      return;
    }

    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener('keydown', _lockKeydownInterceptor, { capture: true });

  // PLATINUM FIX: iOS Safari Vertical Scroll Lock Escape Hatch
  // 'overflow: hidden' on body does NOT stop scrolling on iOS Safari natively.
  _lockTouchInterceptor = (e: TouchEvent) => {
    e.preventDefault(); // Physically freezes the viewport on mobile
  };
  // Must use passive: false to allow preventDefault
  window.addEventListener('touchmove', _lockTouchInterceptor, { passive: false });

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
    if (_lockTouchInterceptor) {
      window.removeEventListener('touchmove', _lockTouchInterceptor);
      _lockTouchInterceptor = null;
    }
  };

  const removeLock = () => {
    if (isRemoved) {return;}
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
    if (isRemoved) {return;}
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
    // PLATINUM FIX: Force focus onto the modal so screen readers announce it instantly
    lock.focus();
  });

  return removeLock;
}
