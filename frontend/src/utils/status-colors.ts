// ============================================================================
// Nammerha Frontend — Shared Status Color & Label Utilities
// PLT-FE-003 FIX: Single source of truth for status/trade/urgency badge colors.
// PLT-UX-AUD P1-STATUS-002 FIX: Added statusLabel() for i18n-aware status text.
// Previously duplicated across 6+ portal pages — consolidated here.
// ============================================================================

import { t } from './i18n';

/**
 * Get badge CSS classes for a project/escrow/approval status.
 * Covers all status values across homeowner, user, contractor, tradesperson portals.
 */
export function statusColor(s: string): string {
  // Platinum UX: Colorblind Accessibility (Shapes + Colors)
  // Success states get rounded-full (pill). Error/Alert states get rounded-none or rounded-sm (sharp).
  const c: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-500 rounded-md',
    open: 'bg-blue-100 text-blue-700 rounded-md',
    pending: 'bg-amber-100 text-amber-700 rounded-md',
    pending_assessment: 'bg-amber-100 text-amber-700 rounded-md',
    assessed: 'bg-indigo-100 text-indigo-700 rounded-full',
    published: 'bg-purple-100 text-purple-700 rounded-full',
    matched: 'bg-cyan-100 text-cyan-700 rounded-full',
    in_progress: 'bg-teal-100 text-teal-700 rounded-full',
    completed: 'bg-green-100 text-green-700 rounded-full',
    cancelled: 'bg-red-100 text-red-600 rounded-none border border-red-300',
    approved: 'bg-green-100 text-green-700 rounded-full',
    accepted: 'bg-blue-100 text-blue-700 rounded-full',
    rejected: 'bg-red-100 text-red-600 rounded-none border border-red-300',
    declined: 'bg-red-100 text-red-600 rounded-none border border-red-300',
    expired: 'bg-slate-100 text-slate-500 rounded-none border border-slate-300',
    withdrawn: 'bg-slate-100 text-slate-500 rounded-md',
  };
  return c[s] ?? 'bg-slate-100 text-slate-600 rounded-md';
}

/**
 * PLT-UX-AUD P1-STATUS-002 FIX: Get human-readable, i18n-aware label for a status.
 * Single source of truth — used by homeowner, contractor, tradesperson portals.
 * Arabic users see translated status names instead of raw English underscored strings.
 */
export function statusLabel(s: string): string {
  const labels: Record<string, string> = {
    draft: t('status_draft', 'مسودة'),
    open: t('status_open', 'مفتوح'),
    pending: t('status_pending', 'معلّق'),
    pending_assessment: t('status_pending_assessment', 'بانتظار التقييم'),
    assessed: t('status_assessed', 'تم التقييم'),
    published: t('status_published', 'منشور'),
    matched: t('status_matched', 'تمت المطابقة'),
    in_progress: t('status_in_progress', 'قيد التنفيذ'),
    completed: t('status_completed', 'مكتمل'),
    cancelled: t('status_cancelled', 'ملغي'),
    approved: t('status_approved', 'مُعتمد'),
    accepted: t('status_accepted', 'مقبول'),
    rejected: t('status_rejected', 'مرفوض'),
    declined: t('status_declined', 'مرفوض'),
    expired: t('status_expired', 'منتهي الصلاحية'),
    withdrawn: t('status_withdrawn', 'مسحوب'),
  };
  // Fallback: humanize the raw string (replace underscores with spaces, capitalize)
  return labels[s] ?? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Get badge CSS classes for an escrow status (locked/released/refunded).
 * Platinum UX: Enforces geometric differentiation for financial states.
 */
export function escrowColor(s: string): string {
  return s === 'released'
    ? 'bg-green-100 text-green-700 rounded-full'
    : s === 'locked'
      ? 'bg-emerald-100 text-emerald-700 rounded-md'
      : s === 'refunded'
        ? 'bg-amber-100 text-amber-700 rounded-none border border-amber-300'
        : 'bg-slate-100 text-slate-600 rounded-md';
}

/**
 * Platinum UX: Get solid icon for escrow status.
 */
export function escrowIcon(s: string): string {
  return s === 'released'
    ? 'ph-shield-check-fill'
    : s === 'locked'
      ? 'ph-lock-key-fill'
      : s === 'refunded'
        ? 'ph-arrow-u-up-left-bold'
        : 'ph-question';
}

/**
 * Get badge CSS classes for a trade/skill type.
 * Used across homeowner service requests and tradesperson portals.
 */
export function tradeColor(trade: string): string {
  const c: Record<string, string> = {
    tiling: 'bg-blue-100 text-blue-700',
    painting: 'bg-purple-100 text-purple-700',
    plumbing: 'bg-cyan-100 text-cyan-700',
    electrical: 'bg-yellow-100 text-yellow-700',
    carpentry: 'bg-orange-100 text-orange-700',
    welding: 'bg-red-100 text-red-700',
    masonry: 'bg-stone-200 text-stone-700',
    plastering: 'bg-slate-100 text-slate-600',
    hvac: 'bg-sky-100 text-sky-700',
    general: 'bg-teal-100 text-teal-700',
  };
  return c[trade] ?? 'bg-slate-100 text-slate-600';
}

/**
 * Get badge CSS classes for urgency level.
 */
export function urgencyColor(u: string): string {
  return u === 'emergency'
    ? 'bg-red-100 text-red-700'
    : u === 'urgent'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-slate-100 text-slate-600';
}

/**
 * Get badge CSS classes for a contractor bid status.
 */
export function bidColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    accepted: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-600',
    withdrawn: 'bg-slate-100 text-slate-500',
    expired: 'bg-slate-100 text-slate-400',
  };
  return colors[status] ?? 'bg-slate-100 text-slate-600';
}

/**
 * Get badge CSS classes for a construction phase status.
 */
export function phaseColor(phase: string): string {
  const colors: Record<string, string> = {
    planning: 'bg-trust-blue/10 text-trust-blue',
    pending_execution: 'bg-amber-100 text-amber-700',
    assessment: 'bg-indigo-100 text-indigo-700',
    in_progress: 'bg-blue-100 text-blue-700',
    construction: 'bg-amber-100 text-amber-700',
    // GAP-07 FIX: Extended milestone statuses
    under_review: 'bg-purple-100 text-purple-700',
    completed: 'bg-green-100 text-green-700',
    verified: 'bg-emerald-100 text-emerald-700',
    delivered: 'bg-emerald-100 text-emerald-700',
    published: 'bg-purple-100 text-purple-700',
  };
  return colors[phase] ?? 'bg-slate-100 text-slate-600';
}

/**
 * GAP-07 FIX: Get Phosphor icon class for a construction phase status.
 * Pairs with phaseColor() for fully visual milestone badges.
 */
export function phaseIcon(phase: string): string {
  const icons: Record<string, string> = {
    planning: 'ph-note-pencil',
    pending_execution: 'ph-hourglass-medium',
    assessment: 'ph-magnifying-glass',
    in_progress: 'ph-spinner-gap',
    construction: 'ph-hard-hat',
    under_review: 'ph-eye',
    completed: 'ph-check-circle',
    verified: 'ph-seal-check',
    delivered: 'ph-package',
    published: 'ph-megaphone-simple',
  };
  return icons[phase] ?? 'ph-circle';
}

/**
 * Get badge CSS classes for availability status.
 */
export function availabilityColor(s: string): string {
  return s === 'available'
    ? 'bg-green-100 text-green-700'
    : s === 'busy'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-slate-100 text-slate-500';
}

/**
 * Get badge CSS classes for supplier PO status.
 */
export function supplierStatusColor(status: string): string {
  const map: Record<string, string> = {
    generated: 'bg-warning-yellow/10 text-warning-yellow',
    sent_to_supplier: 'bg-trust-blue/10 text-trust-blue',
    acknowledged: 'bg-sky-100 text-sky-700',
    shipped: 'bg-purple-100 text-purple-700',
    delivered: 'bg-smoky-jade/10 text-smoky-jade',
    cancelled: 'bg-red-100 text-red-700',
  };
  return map[status] ?? 'bg-slate-100 text-slate-600';
}
