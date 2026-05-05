// ─── Revenue Admin, Subscriptions, Storage, Enterprise ──────────────────────
import { request } from './_client';

// ── Revenue Admin Types ─────────────────────────────────────────────────────
export interface RevenueAdminSummary { total_commission_cents: number; total_tip_cents: number; commission_count: number; tip_count: number; avg_tip_cents: number; avg_tip_percentage: number; }
export interface CommissionTier { tier_id: string; tier_name: string; min_revenue_cents: number; max_revenue_cents: number | null; commission_rate_bps: number; is_active: boolean; }
export interface CommissionEntry { commission_id: string; supplier_id: string; po_id: string; po_amount_cents: number; commission_amount_cents: number; rate_bps: number; created_at: string; }
export interface TipEntry { tip_id: string; donor_id: string; donation_reference: string; tip_amount_cents: number; tip_percentage: number | null; created_at: string; }

export const revenueAdmin = {
    getSummary: () => request<RevenueAdminSummary>('/revenue/admin/summary'),
    getTiers: () => request<CommissionTier[]>('/revenue/admin/config'),
    getCommissions: (limit = 8) => request<{ rows: CommissionEntry[]; total: number }>(`/revenue/admin/commissions?limit=${limit}`),
    getTips: (limit = 8) => request<TipEntry[]>(`/revenue/admin/tips?limit=${limit}`),
};

// ── Subscriptions ───────────────────────────────────────────────────────────
export const subscriptions = {
    subscribe: (planSlug: string) => request<{ subscription_id?: string }>('/subscriptions/subscribe', { method: 'POST', body: JSON.stringify({ plan_slug: planSlug }) }),
};

// ── Storage ─────────────────────────────────────────────────────────────────
export interface PresignResponse { upload_url: string; public_url: string; }

export const storage = {
    presign: (data: { filename: string; content_type: string; purpose?: string }) => request<PresignResponse>('/storage/presign', { method: 'POST', body: JSON.stringify(data) }),
    getUploadUrl: (data: { project_id: string; category: 'proof' | 'boq' | 'capture' | 'floor_plan' | 'document' | 'avatar'; filename: string; content_type: string; file_size_bytes: number }) => request<{ upload_url: string; file_key: string; public_url: string; expires_at: string }>('/storage/upload-url', { method: 'POST', body: JSON.stringify(data) }),
};

// ── Enterprise Admin ────────────────────────────────────────────────────────
export interface EscrowFeeSummary { total_fees_count: number; total_fee_revenue: number; mtd_fee_revenue: number; average_fee_cents: number; average_fee_rate_bps: number; }
export interface FeeConfig { config_id: string; fee_name: string; fee_rate_bps: number; min_fee_cents: number; max_fee_cents: number | null; applies_to: string; is_active: boolean; }
export interface EnterpriseOrg { org_id: string; org_name: string; org_type: string; contact_email: string; tier: string; is_active: boolean; }

export const enterpriseAdmin = {
    getFeeSummary: () => request<EscrowFeeSummary>('/enterprise/admin/fees/summary'),
    getFeeConfigs: () => request<FeeConfig[]>('/enterprise/admin/fees/config'),
    getOrganizations: () => request<EnterpriseOrg[]>('/enterprise/admin/organizations'),
};
