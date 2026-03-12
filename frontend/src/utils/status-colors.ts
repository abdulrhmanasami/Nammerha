// ============================================================================
// Nammerha Frontend — Shared Status Color Utilities
// PLT-FE-003 FIX: Single source of truth for status/trade/urgency badge colors.
// Previously duplicated across 6+ portal pages — consolidated here.
// ============================================================================

/**
 * Get badge CSS classes for a project/escrow/approval status.
 * Covers all status values across homeowner, donor, contractor, tradesperson portals.
 */
export function statusColor(s: string): string {
    const c: Record<string, string> = {
        draft: 'bg-slate-100 text-slate-500',
        open: 'bg-blue-100 text-blue-700',
        pending: 'bg-amber-100 text-amber-700',
        pending_assessment: 'bg-amber-100 text-amber-700',
        assessed: 'bg-indigo-100 text-indigo-700',
        published: 'bg-purple-100 text-purple-700',
        matched: 'bg-cyan-100 text-cyan-700',
        in_progress: 'bg-teal-100 text-teal-700',
        completed: 'bg-green-100 text-green-700',
        cancelled: 'bg-red-100 text-red-600',
        approved: 'bg-green-100 text-green-700',
        accepted: 'bg-blue-100 text-blue-700',
        rejected: 'bg-red-100 text-red-600',
        declined: 'bg-red-100 text-red-600',
        expired: 'bg-slate-100 text-slate-500',
        withdrawn: 'bg-slate-100 text-slate-500',
    };
    return c[s] ?? 'bg-slate-100 text-slate-600';
}

/**
 * Get badge CSS classes for an escrow status (locked/released/refunded).
 */
export function escrowColor(s: string): string {
    return s === 'released' ? 'bg-green-100 text-green-700'
        : s === 'locked' ? 'bg-emerald-100 text-emerald-700'
            : s === 'refunded' ? 'bg-amber-100 text-amber-700'
                : 'bg-slate-100 text-slate-600';
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
    return u === 'emergency' ? 'bg-red-100 text-red-700'
        : u === 'urgent' ? 'bg-amber-100 text-amber-700'
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
        pending_execution: 'bg-amber-100 text-amber-700',
        in_progress: 'bg-blue-100 text-blue-700',
        completed: 'bg-green-100 text-green-700',
        delivered: 'bg-emerald-100 text-emerald-700',
    };
    return colors[phase] ?? 'bg-slate-100 text-slate-600';
}

/**
 * Get badge CSS classes for availability status.
 */
export function availabilityColor(s: string): string {
    return s === 'available' ? 'bg-green-100 text-green-700'
        : s === 'busy' ? 'bg-amber-100 text-amber-700'
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
