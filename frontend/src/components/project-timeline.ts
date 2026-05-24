// ============================================================================
// Nammerha Frontend — Project Status Timeline Component
// CRIT-UX-001 FIX: Visual status timeline for homeowner dashboard.
// Previous: Status was a single badge — users couldn't see where their project
// was in the lifecycle or what comes next.
// Now: Horizontal stepper with completed/current/future visual states.
// Standard: Nielsen #1 (Visibility of System Status), Apple HIG (Progress).
// ============================================================================

import { t } from '../utils/i18n';
import { escapeHtml } from '../utils/xss';

/** Timeline step definition — one per project lifecycle phase */
interface TimelineStep {
  key: string;
  icon: string;
  labelKey: string;
  labelFallback: string;
}

/**
 * Ordered lifecycle steps — matches backend status flow.
 * Each step's `key` covers one or more backend status values.
 */
const STEPS: TimelineStep[] = [
  {
    key: 'reported',
    icon: 'ph-megaphone-simple',
    labelKey: 'tl_reported',
    labelFallback: 'الإبلاغ',
  },
  {
    key: 'assessed',
    icon: 'ph-magnifying-glass',
    labelKey: 'tl_assessed',
    labelFallback: 'التقييم',
  },
  {
    key: 'boq_created',
    icon: 'ph-clipboard-text',
    labelKey: 'tl_boq',
    labelFallback: 'جدول الكميات',
  },
  { key: 'bidding', icon: 'ph-gavel', labelKey: 'tl_bidding', labelFallback: 'المناقصة' },
  {
    key: 'contractor_selected',
    icon: 'ph-handshake',
    labelKey: 'tl_awarded',
    labelFallback: 'الترسية',
  },
  { key: 'in_progress', icon: 'ph-hard-hat', labelKey: 'tl_progress', labelFallback: 'التنفيذ' },
  { key: 'verification', icon: 'ph-seal-check', labelKey: 'tl_verify', labelFallback: 'التحقق' },
  { key: 'completed', icon: 'ph-check-circle', labelKey: 'tl_complete', labelFallback: 'مكتمل' },
];

/**
 * Map backend status strings to timeline step index.
 * Multiple backend values can map to the same step position.
 */
const STATUS_MAP: Record<string, number> = {
  // Step 0: Reported
  reported: 0,
  submitted: 0,
  draft: 0,
  // Step 1: Assessed
  assessed: 1,
  under_assessment: 1,
  pending_assessment: 1,
  // Step 2: BOQ Created
  boq_created: 2,
  boq_ready: 2,
  // Step 3: Bidding
  bidding: 3,
  open_for_bids: 3,
  published: 3,
  open: 3,
  // Step 4: Contractor Selected
  contractor_selected: 4,
  awarded: 4,
  matched: 4,
  // Step 5: In Progress
  in_progress: 5,
  construction: 5,
  // Step 6: Verification
  verification: 6,
  pending_verification: 6,
  // Step 7: Completed
  completed: 7,
  complete: 7,
};

/**
 * Render a horizontal project timeline stepper.
 * Returns a sanitized HTML string — safe for innerHTML injection.
 *
 * @param status - The project's current backend status string
 * @returns HTML string for the timeline component
 */
export function renderProjectTimeline(status: string): string {
  const currentIndex = STATUS_MAP[status] ?? -1;

  const stepsHtml = STEPS.map((step, i) => {
    const isCompleted = i < currentIndex;
    const isCurrent = i === currentIndex;
    const stateClass = isCompleted
      ? 'nm-tl-step--done'
      : isCurrent
        ? 'nm-tl-step--active'
        : 'nm-tl-step--future';

    const label = escapeHtml(t(step.labelKey, step.labelFallback));

    // Connector line before each step (except the first)
    const connector =
      i > 0
        ? `<span class="nm-tl-connector ${isCompleted ? 'nm-tl-connector--done' : isCurrent ? 'nm-tl-connector--active' : ''}" aria-hidden="true"></span>`
        : '';

    return `${connector}<div class="nm-tl-step ${stateClass}" ${isCurrent ? 'aria-current="step"' : ''}>
        <span class="nm-tl-dot" aria-hidden="true">
          <i class="ph ${escapeHtml(step.icon)}"></i>
        </span>
        <span class="nm-tl-label">${label}</span>
      </div>`;
  }).join('');

  return `<div class="nm-timeline" role="group" aria-label="${escapeHtml(t('tl_aria_label', 'مراحل المشروع'))}">${stepsHtml}</div>`;
}
