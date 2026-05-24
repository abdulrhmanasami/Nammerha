// ============================================================================
// Nammerha Frontend — Tour Replay FAB (Help Button)
// CRIT-UX-003 FIX: Adds a floating "Replay Tour" button to portal pages.
// Previous: Once a user completed (or skipped) the onboarding tour, there was
// NO way to restart it. If they skipped accidentally, they lost the guidance.
// Now: Small help icon in the bottom corner lets users replay the tour on demand.
// Standard: Nielsen #10 (Help & Documentation), Discoverable Help Pattern.
// ============================================================================

import { t } from '../utils/i18n';
import { startTour, resetTour } from './tour-engine';
import { haptic } from '../utils/haptic';
import { escapeHtml as esc } from '../utils/xss';

/**
 * Mount the Tour Replay FAB on the current page.
 * Detects the portal context from the URL and wires the replay action.
 *
 * @param tourId - Explicit tour ID to replay, or auto-detected from URL
 */
export function mountTourReplayFAB(tourId?: string): void {
  // Auto-detect from URL if not specified
  const resolved = tourId ?? detectTourId();
  if (!resolved) return;

  // Prevent duplicates
  if (document.getElementById('nm-tour-replay-fab')) return;

  const fab = document.createElement('button');
  fab.id = 'nm-tour-replay-fab';
  fab.type = 'button';
  fab.className = 'nm-tour-fab';
  fab.setAttribute('aria-label', t('tour_replay', 'إعادة الجولة التعريفية'));
  fab.setAttribute('title', t('tour_replay', 'إعادة الجولة التعريفية'));
  fab.innerHTML = `<i class="ph ph-question" aria-hidden="true"></i>`;

  fab.addEventListener('click', () => {
    haptic.light();
    resetTour(resolved);
    startTour(resolved, true); // force=true to bypass completion check
  });

  document.body.appendChild(fab);

  // Tooltip on first mount (show briefly, then hide)
  const tooltip = document.createElement('span');
  tooltip.className = 'nm-tour-fab-tooltip';
  tooltip.textContent = esc(t('tour_replay_hint', 'اضغط لإعادة الجولة'));
  fab.appendChild(tooltip);

  // Auto-hide tooltip after 3 seconds
  setTimeout(() => {
    tooltip.classList.add('nm-tour-fab-tooltip--hidden');
    tooltip.addEventListener('animationend', () => tooltip.remove(), { once: true });
  }, 3000);
}

/**
 * Detect tour ID from current URL path.
 */
function detectTourId(): string | null {
  const path = window.location.pathname;

  if (path.includes('homeowner-portal') || path.includes('homeowner-report')) {
    return 'homeowner';
  }
  if (path.includes('contractor-portal') || path.includes('contractor-dashboard')) {
    return 'contractor';
  }
  if (
    path.includes('engineer-portal') ||
    path.includes('engineer-camera') ||
    path.includes('engineer-boq')
  ) {
    return 'engineer';
  }
  if (path.includes('supplier-dashboard')) {
    return 'supplier';
  }
  if (path.includes('tradesperson-portal')) {
    return 'tradesperson';
  }
  if (path.includes('project-details')) {
    return 'project';
  }
  if (path === '/' || path.endsWith('/index.html') || path.endsWith('/index')) {
    return 'homepage';
  }
  return null;
}
