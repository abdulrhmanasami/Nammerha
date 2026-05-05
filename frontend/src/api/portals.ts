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
interface CatalogItem { catalog_item_id: string; supplier_id: string; material_name: string; material_category: string; unit: string; unit_price_guide: number; lead_time_days: number | null; minimum_order: number | null; is_active: boolean; created_at: string; }
interface PurchaseOrder { order_id: string; project_id: string; project_title: string; material_name: string; quantity: number; unit_price: number; total_price: number; status: string; created_at: string; }
interface SupplierStats { active_catalog_items: number; total_orders: number; pending_orders: number; total_revenue: number; }

export const supplier = {
    addCatalogItem: (data: { material_name: string; material_category: string; unit: string; unit_price_guide: number; lead_time_days?: number; minimum_order?: number }) => request<CatalogItem>('/supplier/catalog', { method: 'POST', body: JSON.stringify(data), headers: { 'Idempotency-Key': crypto.randomUUID() } }),
    getCatalog: () => request<CatalogItem[]>('/supplier/catalog'),
    updateCatalogItem: (itemId: string, data: { material_name?: string; material_category?: string; unit?: string; unit_price_guide?: number; lead_time_days?: number; minimum_order?: number }) => request<CatalogItem>(`/supplier/catalog/${itemId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deactivateItem: (itemId: string) => request(`/supplier/catalog/${itemId}`, { method: 'DELETE' }),
    getOrders: (status?: string) => { const qs = status ? `?status=${encodeURIComponent(status)}` : ''; return request<PurchaseOrder[]>(`/supplier/orders${qs}`); },
    updateOrderStatus: (orderId: string, status: 'acknowledged' | 'shipped' | 'delivered') => request<PurchaseOrder>(`/supplier/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    getStats: () => request<SupplierStats>('/supplier/stats'),
};

// ── Engineer Types ──────────────────────────────────────────────────────────
interface EngineerProject { project_id: string; title: string; status: string; damage_type: string; homeowner_name: string; created_at: string; }
interface EngineerProfile { full_name: string; specialty: string | null; years_experience: number | null; score: number; completed_projects: number; average_rating: number | null; }
interface EngineerBid { bid_id: string; project_title: string; proposed_cost: number; estimated_days: number; status: string; created_at: string; }
interface EngineerStats { assigned_projects: number; completed_projects: number; active_bids: number; average_score: number; }

export const engineer = {
    getProjects: (status?: string) => { const qs = status ? `?status=${encodeURIComponent(status)}` : ''; return request<EngineerProject[]>(`/engineer/projects${qs}`); },
    getStats: () => request<EngineerStats>('/engineer/stats'),
    getBids: (status?: string) => { const qs = status ? `?status=${encodeURIComponent(status)}` : ''; return request<EngineerBid[]>(`/engineer/bids${qs}`); },
    getProfile: () => request<EngineerProfile>('/engineer/profile'),
    getCaptures: (limit?: number) => { const qs = limit ? `?limit=${limit}` : ''; return request(`/engineer/captures${qs}`); },
    submitCapture: (data: { project_id: string; file_url: string; construction_phase: string; capture_type?: string; title?: string; description?: string; thumbnail_url?: string; gps_lat?: number; gps_lng?: number; gps_accuracy_meters?: number }) => request('/engineer/camera/capture', { method: 'POST', body: JSON.stringify(data), headers: { 'Idempotency-Key': crypto.randomUUID() } }),
    submitSpatialProof: (data: { item_id: string; project_id: string; image_url: string; gps_lat: number; gps_lng: number; gps_accuracy_meters?: number; description?: string; client_hash?: string }) => request('/engineer/camera/spatial-proof', { method: 'POST', body: JSON.stringify(data), headers: { 'Idempotency-Key': crypto.randomUUID() } }),
};

// ── Contractor Types ────────────────────────────────────────────────────────
interface ContractorProject { project_id: string; title: string; status: string; damage_type: string; homeowner_name: string; created_at: string; }
interface ContractorBid { bid_id: string; project_title: string; proposed_cost: number; estimated_days: number; status: string; created_at: string; }
interface ContractorProfile { full_name: string; specialty: string | null; years_experience: number | null; score: number; completed_projects: number; average_rating: number | null; }
interface ContractorStats { assigned_projects: number; completed_projects: number; active_bids: number; total_earnings: number; }
interface ContractorPayment { payment_id: string; project_title: string; amount: number; status: string; released_at: string | null; }

export const contractor = {
    getProjects: (status?: string) => { const qs = status ? `?status=${encodeURIComponent(status)}` : ''; return request<ContractorProject[]>(`/contractor/projects${qs}`); },
    getStats: () => request<ContractorStats>('/contractor/stats'),
    getBids: (status?: string) => { const qs = status ? `?status=${encodeURIComponent(status)}` : ''; return request<ContractorBid[]>(`/contractor/bids${qs}`); },
    getMarketplace: () => request<ContractorProject[]>('/contractor/marketplace'),
    getProfile: () => request<ContractorProfile>('/contractor/profile'),
    getPayments: (params?: { limit?: number; offset?: number }) => { const qs = new URLSearchParams(); if (params?.limit) { qs.set('limit', String(params.limit)); } if (params?.offset) { qs.set('offset', String(params.offset)); } const q = qs.toString(); return request<ContractorPayment[]>(`/contractor/payments${q ? `?${q}` : ''}`); },
    submitBid: (data: { project_id: string; proposed_cost: number; estimated_days: number; cover_letter?: string; methodology?: string }) => request('/contractor/bids', { method: 'POST', body: JSON.stringify(data), headers: { 'Idempotency-Key': crypto.randomUUID() } }),
};

// ── Homeowner Types ─────────────────────────────────────────────────────────
interface HomeownerProject { project_id: string; title: string; status: string; damage_type: string; damage_severity: string; funded_percentage: number; created_at: string; }
interface HomeownerStats { active_projects: number; completed_projects: number; pending_approvals: number; active_service_requests: number; total_invested: number; total_bids_received: number; }
interface HomeownerServiceRequest { request_id: string; trade_needed: string; title: string; description: string | null; urgency: string; status: string; created_at: string; }
interface HomeownerApproval { approval_id: string; project_title: string; title: string; description: string | null; status: string; created_at: string; }
interface HomeownerEscrowSummary { total_escrowed: number; total_released: number; pending_release: number; }

export const homeowner = {
    getProjects: () => request<HomeownerProject[]>('/homeowner/projects'),
    getStats: () => request<HomeownerStats>('/homeowner/stats'),
    getProjectBids: (projectId: string) => request(`/homeowner/projects/${projectId}/bids`),
    createServiceRequest: (data: { trade_needed: string; title: string; description?: string; address_text?: string; urgency?: 'low' | 'medium' | 'high' | 'emergency'; budget_min?: number; budget_max?: number }) => request<HomeownerServiceRequest>('/homeowner/service-requests', { method: 'POST', body: JSON.stringify(data), headers: { 'Idempotency-Key': crypto.randomUUID() } }),
    getServiceRequests: () => request<HomeownerServiceRequest[]>('/homeowner/service-requests'),
    cancelServiceRequest: (requestId: string) => request(`/homeowner/service-requests/${requestId}/cancel`, { method: 'POST' }),
    getApprovals: (status?: string) => { const qs = status ? `?status=${encodeURIComponent(status)}` : ''; return request<HomeownerApproval[]>(`/homeowner/approvals${qs}`); },
    getEscrow: () => request<HomeownerEscrowSummary>('/homeowner/escrow'),
    respondToApproval: (approvalId: string, decision: 'approved' | 'rejected') => request(`/dashboard/approvals/${approvalId}`, { method: 'PATCH', body: JSON.stringify({ decision }) }),
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
