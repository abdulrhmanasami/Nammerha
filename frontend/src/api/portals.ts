// ─── Role Portals: Tradesperson, Supplier, Engineer, Contractor, Homeowner ──
import { request } from './_client';

// ── Tradesperson Types ──────────────────────────────────────────────────────
interface TradespersonStats { active_jobs: number; completed_jobs: number; pending_requests: number; active_assignments: number; total_earnings: number; average_rating: number | null; }
interface TradespersonProfile { trade: string | null; hourly_rate: number | null; daily_rate: number | null; availability: string; years_experience: number | null; completed_jobs_count: number; average_rating: number | null; dynamic_score: number; full_name: string; }
interface ServiceRequest { request_id: string; homeowner_name: string; trade_needed: string; title: string; description: string | null; address_text: string | null; urgency: string; budget_min: number | null; budget_max: number | null; created_at: string; }
interface Assignment { assignment_id: string; contractor_name: string; project_title: string; trade_required: string; scope_description: string; agreed_rate: number; rate_type: string; estimated_days: number | null; status: string; created_at: string; }
interface Earning { source_type: string; source_id: string; title: string; amount: number; rate_type: string | null; completed_at: string | null; }

export const tradesperson = {
    getProfile: () => request<TradespersonProfile>('/tradesperson/profile'),
    getStats: () => request<TradespersonStats>('/tradesperson/stats'),
    getRequests: () => request<ServiceRequest[]>('/tradesperson/requests'),
    acceptRequest: (requestId: string) => request(`/tradesperson/requests/${requestId}/accept`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() } }),
    getAssignments: (status?: string) => { const qs = status ? `?status=${encodeURIComponent(status)}` : ''; return request<Assignment[]>(`/tradesperson/assignments${qs}`); },
    respondToAssignment: (assignmentId: string, accept: boolean) => request(`/tradesperson/assignments/${assignmentId}/respond`, { method: 'POST', body: JSON.stringify({ accept }), headers: { 'Idempotency-Key': crypto.randomUUID() } }),
    getEarnings: () => request<Earning[]>('/tradesperson/earnings'),
    updateAvailability: (status: 'available' | 'busy' | 'offline') => request('/tradesperson/availability', { method: 'PATCH', body: JSON.stringify({ status }) }),
};

// ── Supplier Types ──────────────────────────────────────────────────────────
interface CatalogItem { catalog_id: string; supplier_id: string; material_name: string; material_category: string; description: string | null; unit: string; unit_price_guide: number; lead_time_days: number | null; min_order_qty: number | null; is_active: boolean; created_at: string; }
// J1 AUDIT FIX: Was 'order_id' — backend returns 'po_id'. Added missing fields.
interface PurchaseOrder { po_id: string; po_number: string; project_id: string; project_title: string; material_name: string; material_category: string | null; quantity: number; unit: string; unit_price: number; amount: number; status: string; generated_at: string; created_at: string; }
interface SupplierStats { pending_orders: number; won_contracts: number; in_transit: number; total_revenue: number; catalog_items: number; total_orders: number; }
interface MonthlyAnalyticsPoint { month: string; order_count: number; revenue: number; }

export const supplier = {
    addCatalogItem: (data: { material_name: string; material_category: string; unit: string; unit_price_guide: number; lead_time_days?: number; min_order_qty?: number; description?: string }) => request<CatalogItem>('/supplier/catalog', { method: 'POST', body: JSON.stringify(data), headers: { 'Idempotency-Key': crypto.randomUUID() } }),
    getCatalog: (params?: { limit?: number; offset?: number; search?: string }) => { const qs = new URLSearchParams(); if (params?.limit) { qs.set('limit', String(params.limit)); } if (params?.offset) { qs.set('offset', String(params.offset)); } if (params?.search) { qs.set('search', params.search); } const q = qs.toString(); return request<CatalogItem[]>(`/supplier/catalog${q ? `?${q}` : ''}`); },
    updateCatalogItem: (itemId: string, data: { material_name?: string; material_category?: string; unit?: string; unit_price_guide?: number; lead_time_days?: number; min_order_qty?: number; description?: string }) => request<CatalogItem>(`/supplier/catalog/${itemId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deactivateItem: (itemId: string) => request(`/supplier/catalog/${itemId}`, { method: 'DELETE' }),
    reactivateItem: (itemId: string) => request<CatalogItem>(`/supplier/catalog/${itemId}/reactivate`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() } }),
    getOrders: (status?: string, params?: { limit?: number; offset?: number }) => { const qs = new URLSearchParams(); if (status) { qs.set('status', status); } if (params?.limit) { qs.set('limit', String(params.limit)); } if (params?.offset) { qs.set('offset', String(params.offset)); } const q = qs.toString(); return request<PurchaseOrder[]>(`/supplier/orders${q ? `?${q}` : ''}`); },
    updateOrderStatus: (orderId: string, status: 'acknowledged' | 'shipped' | 'delivered') => request<PurchaseOrder>(`/supplier/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    getStats: () => request<SupplierStats>('/supplier/stats'),
    getAnalytics: () => request<MonthlyAnalyticsPoint[]>('/supplier/analytics'),
};

// ── Engineer Types ──────────────────────────────────────────────────────────
// AUDIT FIX: Updated to match actual backend response (engineer.service.ts)
interface EngineerProject { project_id: string; title: string; region: string; status: string; phase: string; progress: number; boq_count: number; next_proof_due: string | null; created_at: string; }
interface EngineerProfile { user_id: string; full_name: string; specialty: string | null; engineering_license_number: string | null; guild_membership_id: string | null; dynamic_score: number; completed_projects_count: number; active_projects_count: number; total_bids: number; bid_win_rate: number; }
interface EngineerBid { bid_id: string; project_id: string; project_title: string; proposed_cost: number; estimated_days: number; cover_letter: string | null; status: string; engineer_score_snapshot: number | null; submitted_at: string; responded_at: string | null; }
interface EngineerStats { assigned_projects: number; proofs_pending: number; proofs_verified: number; escrow_released: number; active_bids: number; total_bids: number; }
interface EngineerCapture { capture_id: string; project_id: string; project_title: string; capture_type: string; construction_phase: string; title: string | null; file_url: string; is_verified: boolean; captured_at: string; }

export const engineer = {
    getProjects: (status?: string, params?: { limit?: number; offset?: number }) => { const qs = new URLSearchParams(); if (status) { qs.set('status', status); } if (params?.limit) { qs.set('limit', String(params.limit)); } if (params?.offset) { qs.set('offset', String(params.offset)); } const q = qs.toString(); return request<EngineerProject[]>(`/engineer/projects${q ? `?${q}` : ''}`); },
    getStats: () => request<EngineerStats>('/engineer/stats'),
    getBids: (status?: string, params?: { limit?: number; offset?: number }) => { const qs = new URLSearchParams(); if (status) { qs.set('status', status); } if (params?.limit) { qs.set('limit', String(params.limit)); } if (params?.offset) { qs.set('offset', String(params.offset)); } const q = qs.toString(); return request<EngineerBid[]>(`/engineer/bids${q ? `?${q}` : ''}`); },
    getProfile: () => request<EngineerProfile>('/engineer/profile'),
    getCaptures: (limit?: number) => { const qs = limit ? `?limit=${limit}` : ''; return request<EngineerCapture[]>(`/engineer/captures${qs}`); },
    submitCapture: (data: { project_id: string; file_url: string; construction_phase: string; capture_type?: string; title?: string; description?: string; thumbnail_url?: string; gps_lat?: number; gps_lng?: number; gps_accuracy_meters?: number }) => request('/engineer/camera/capture', { method: 'POST', body: JSON.stringify(data), headers: { 'Idempotency-Key': crypto.randomUUID() } }),
    submitSpatialProof: (data: { item_id: string; project_id: string; image_url: string; gps_lat: number; gps_lng: number; gps_accuracy_meters?: number; description?: string; client_hash?: string }) => request('/engineer/camera/spatial-proof', { method: 'POST', body: JSON.stringify(data), headers: { 'Idempotency-Key': crypto.randomUUID() } }),
};

// ── Contractor Types ────────────────────────────────────────────────────────
// AUDIT FIX: Updated to match actual backend response (contractor.service.ts)
interface ContractorProject { project_id: string; title: string; region: string; status: string; phase: string; progress: number; boq_count: number; engineer_name: string | null; created_at: string; }
interface ContractorBid { bid_id: string; project_id: string; project_title: string; proposed_cost: number; estimated_days: number; cover_letter: string | null; status: string; engineer_score_snapshot: number | null; submitted_at: string; responded_at: string | null; }
interface ContractorProfile { user_id: string; full_name: string; specialty: string | null; commercial_register_number: string | null; dynamic_score: number; completed_projects_count: number; active_projects_count: number; total_bids: number; bid_win_rate: number; }
interface ContractorStats { active_projects: number; pending_bids: number; won_bids: number; total_escrow_received: number; total_bids: number; bid_win_rate: number; }
interface ContractorPayment { transaction_id: string; project_id: string; project_title: string; amount: number; transaction_type: string; created_at: string; }
interface AvailableProject { project_id: string; title: string; region: string; damage_type: string; total_estimated_cost: number; boq_count: number; published_at: string; bid_count: number; distance_km: number | null; }

export const contractor = {
    getProjects: (status?: string, params?: { limit?: number; offset?: number }) => { const qs = new URLSearchParams(); if (status) { qs.set('status', status); } if (params?.limit) { qs.set('limit', String(params.limit)); } if (params?.offset) { qs.set('offset', String(params.offset)); } const q = qs.toString(); return request<ContractorProject[]>(`/contractor/projects${q ? `?${q}` : ''}`); },
    getStats: () => request<ContractorStats>('/contractor/stats'),
    getBids: (status?: string, params?: { limit?: number; offset?: number }) => { const qs = new URLSearchParams(); if (status) { qs.set('status', status); } if (params?.limit) { qs.set('limit', String(params.limit)); } if (params?.offset) { qs.set('offset', String(params.offset)); } const q = qs.toString(); return request<ContractorBid[]>(`/contractor/bids${q ? `?${q}` : ''}`); },
    getMarketplace: (params?: { limit?: number; offset?: number }) => { const qs = new URLSearchParams(); if (params?.limit) { qs.set('limit', String(params.limit)); } if (params?.offset) { qs.set('offset', String(params.offset)); } const q = qs.toString(); return request<AvailableProject[]>(`/contractor/marketplace${q ? `?${q}` : ''}`); },
    getProfile: () => request<ContractorProfile>('/contractor/profile'),
    getPayments: (params?: { limit?: number; offset?: number }) => { const qs = new URLSearchParams(); if (params?.limit) { qs.set('limit', String(params.limit)); } if (params?.offset) { qs.set('offset', String(params.offset)); } const q = qs.toString(); return request<ContractorPayment[]>(`/contractor/payments${q ? `?${q}` : ''}`); },
    submitBid: (data: { project_id: string; proposed_cost: number; estimated_days: number; cover_letter?: string; methodology?: string }) => request('/contractor/bids', { method: 'POST', body: JSON.stringify(data), headers: { 'Idempotency-Key': crypto.randomUUID() } }),
};

// ── Homeowner Types ─────────────────────────────────────────────────────────
interface HomeownerProject { project_id: string; title: string; status: string; damage_type: string; damage_severity: string; funded_percentage: number; created_at: string; }
interface HomeownerStats { active_projects: number; completed_projects: number; pending_approvals: number; active_service_requests: number; total_invested: number; total_bids_received: number; }
interface HomeownerServiceRequest { request_id: string; trade_needed: string; title: string; description: string | null; address_text: string | null; urgency: string; budget_min: number | null; budget_max: number | null; status: string; tradesperson_name: string | null; tradesperson_trade: string | null; created_at: string; matched_at: string | null; }
interface HomeownerApproval { approval_id: string; project_title: string; title: string; description: string | null; status: string; created_at: string; }
interface HomeownerEscrowSummary { total_escrowed: number; total_released: number; pending_release: number; }

export const homeowner = {
    getProjects: () => request<HomeownerProject[]>('/homeowner/projects'),
    getStats: () => request<HomeownerStats>('/homeowner/stats'),
    getProjectBids: (projectId: string) => request(`/homeowner/projects/${projectId}/bids`),
    createServiceRequest: (data: { trade_needed: string; title: string; description?: string; address_text?: string; urgency?: 'routine' | 'urgent' | 'emergency'; budget_min?: number; budget_max?: number }) => request<HomeownerServiceRequest>('/homeowner/service-requests', { method: 'POST', body: JSON.stringify(data), headers: { 'Idempotency-Key': crypto.randomUUID() } }),
    getServiceRequests: () => request<HomeownerServiceRequest[]>('/homeowner/service-requests'),
    cancelServiceRequest: (requestId: string) => request(`/homeowner/service-requests/${requestId}/cancel`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() } }),
    getApprovals: (status?: string) => { const qs = status ? `?status=${encodeURIComponent(status)}` : ''; return request<HomeownerApproval[]>(`/homeowner/approvals${qs}`); },
    getEscrow: () => request<HomeownerEscrowSummary>('/homeowner/escrow'),
    respondToApproval: (approvalId: string, decision: 'approved' | 'rejected') => request(`/dashboard/approvals/${approvalId}`, { method: 'PATCH', body: JSON.stringify({ decision }), headers: { 'Idempotency-Key': crypto.randomUUID() } }),
};

// ── Donor Types ─────────────────────────────────────────────────────────────
interface DonorStats { total_donated: number; projects_supported: number; items_funded: number; escrow_locked: number; escrow_released: number; impact_score: number; }
interface DonorDonation { escrow_id: string; project_title: string; material_name: string; amount_locked: number; status: string; locked_at: string; }
interface DonorFundedProject { project_id: string; title: string; damage_type: string; region: string | null; status: string; my_total_donated: number; funded_percentage: number; items_i_funded: number; }
interface DonorMarketProject { project_id: string; title: string; damage_type: string; region: string | null; total_cost: number; total_funded: number; funded_percentage: number; items_count: number; }
interface DonorProof { proof_id: string; project_title: string; material_name: string; photo_url: string | null; gps_lat: number | null; gps_lng: number | null; verified_by: string | null; verified_at: string | null; description: string | null; }

export const donor = {
    getStats: () => request<DonorStats>('/donor/stats'),
    getDonations: (limit?: number) => { const qs = limit ? `?limit=${limit}` : ''; return request<DonorDonation[]>(`/donor/donations${qs}`); },
    getImpact: () => request<DonorFundedProject[]>('/donor/impact'),
    getMarketplace: () => request<DonorMarketProject[]>('/donor/marketplace'),
    getProjectFunding: (projectId: string) => request(`/donor/projects/${projectId}/funding`),
    getProofs: () => request<DonorProof[]>('/donor/proofs'),
    getTimeline: (limit?: number) => { const qs = limit ? `?limit=${limit}` : ''; return request<{ event_type: 'donated' | 'delivered' | 'verified' | 'released' | 'refunded'; event_date: string; project_id: string; project_title: string; item_id: string; material_name: string; amount: number; proof_image_url: string | null; proof_gps_lat: number | null; proof_gps_lng: number | null; verified_by_name: string | null; verified_at: string | null; gift_recipient_name: string | null; donation_intent: string | null }[]>(`/donor/timeline${qs}`); },
    requestRefund: (data: { escrow_id: string; reason: string }) => request('/donor/refunds', { method: 'POST', body: JSON.stringify(data), headers: { 'Idempotency-Key': crypto.randomUUID() } }),
    getReceiptUrl: (escrowId: string) => `/api/donor/receipts/${escrowId}`,
};
