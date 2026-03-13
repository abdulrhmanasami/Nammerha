// ============================================================================
// Nammerha Backend — TypeScript Type Definitions
// All types mirror the PostgreSQL ENUM and table definitions from
// migrations 001_core_schema and 002_user_journeys.
// ============================================================================

// ─── ENUM Types ─────────────────────────────────────────────────────────────

export type UserRole = 'donor' | 'homeowner' | 'engineer' | 'contractor' | 'tradesperson' | 'supplier' | 'admin' | 'auditor';

export type KycStatus = 'pending' | 'submitted' | 'verified' | 'rejected' | 'suspended';

export type DamageType = 'structural' | 'plumbing' | 'electrical' | 'mixed';

export type DamageSeverity = 'minor' | 'moderate' | 'severe' | 'total_destruction';

export type ProjectStatus =
    | 'draft'
    | 'pending_assessment'
    | 'assessed'
    | 'published'
    | 'in_progress'
    | 'completed'
    | 'cancelled';

export type BoqItemStatus =
    | 'pending_verification'
    | 'verified'
    | 'partially_funded'
    | 'fully_funded'
    | 'delivered'
    | 'installed';

export type PaymentStatus = 'locked' | 'released' | 'refunded' | 'disputed';

export type VerificationStatus = 'submitted' | 'verified' | 'rejected';

export type PoStatus =
    | 'generated'
    | 'sent_to_supplier'
    | 'acknowledged'
    | 'shipped'
    | 'delivered'
    | 'cancelled';

export type NotificationType =
    | 'donation_received'
    | 'proof_submitted'
    | 'funds_released'
    | 'delivery_confirmed'
    | 'engineer_assigned'
    | 'po_generated'
    | 'project_published'
    | 'kyc_approved'
    | 'kyc_rejected'
    | 'discrepancy_flagged';

export type NotificationChannel = 'push' | 'email' | 'sms' | 'in_app';

// ─── Entity Interfaces ──────────────────────────────────────────────────────

export interface User {
    user_id: string;
    email: string;
    phone: string | null;
    full_name: string;
    role: UserRole;
    password_hash: string;
    avatar_url: string | null;
    kyc_verification_status: KycStatus;
    kyc_document_url: string | null;
    kyc_verified_at: Date | null;
    kyc_verified_by: string | null;
    commercial_register_number: string | null;
    engineering_license_number: string | null;
    guild_membership_id: string | null;
    is_active: boolean;
    // Email verification (Migration 017)
    is_email_verified: boolean;
    email_verification_token: string | null;
    email_token_expires_at: Date | null;
    // Password reset (Migration 018)
    password_reset_token: string | null;
    reset_token_expires_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface Project {
    project_id: string;
    homeowner_id: string;
    assigned_engineer_id: string | null;
    assigned_contractor_id: string | null;
    title: string;
    description: string | null;
    cover_image_url: string | null;
    gps_location: string | null; // PostGIS geography serialized
    address_text: string | null;
    damage_type: DamageType;
    damage_severity: DamageSeverity | null;
    status: ProjectStatus;
    is_public: boolean;
    total_estimated_cost: number; // BIGINT cents
    total_funded_amount: number;  // BIGINT cents
    ocds_release_id: string | null;
    published_at: Date | null;
    completed_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface ItemizedBOQ {
    item_id: string;
    project_id: string;
    material_name: string;
    material_category: string | null;
    description: string | null;
    image_url: string | null;
    unit: string;
    unit_price: number;          // BIGINT cents
    required_quantity: number;
    funded_amount: number;       // BIGINT cents
    oracle_reference_price: number | null;
    oracle_price_date: Date | null;
    preferred_supplier_id: string | null;  // Pre-assigned verified supplier
    status: BoqItemStatus;
    created_by: string | null;
    verified_by: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface EscrowLedger {
    transaction_id: string;
    donor_id: string;
    item_id: string;
    project_id: string;
    amount_locked: number;       // BIGINT cents
    currency: string;
    payment_status: PaymentStatus;
    payment_method: string | null;
    payment_gateway_ref: string | null;
    locked_at: Date;
    released_at: Date | null;
    released_by: string | null;
    release_proof_id: string | null;
    refunded_at: Date | null;
    blockchain_tx_hash: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface SpatialProof {
    proof_id: string;
    item_id: string;
    project_id: string;
    engineer_id: string;
    gps_coordinates: string;     // PostGIS geography serialized
    gps_accuracy_meters: number | null;
    captured_at: Date;
    image_url: string;
    image_hash: string | null;
    description: string | null;
    device_info: Record<string, unknown> | null;
    verification_status: VerificationStatus;
    verified_by: string | null;
    verified_at: Date | null;
    created_at: Date;
}

export interface PurchaseOrder {
    po_id: string;
    po_number: string;
    item_id: string;
    project_id: string;
    supplier_id: string;
    amount: number;              // BIGINT cents
    currency: string;
    status: PoStatus;
    material_name: string;
    material_category: string | null;
    quantity: number;
    unit: string;
    unit_price: number;          // BIGINT cents
    supplier_name: string;
    supplier_commercial_reg: string | null;
    generated_at: Date;
    sent_at: Date | null;
    acknowledged_at: Date | null;
    shipped_at: Date | null;
    delivered_at: Date | null;
    cancelled_at: Date | null;
    created_by: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface Notification {
    notification_id: string;
    user_id: string;
    type: NotificationType;
    title: string;
    body: string;
    data: Record<string, unknown> | null;
    channel: NotificationChannel;
    is_read: boolean;
    read_at: Date | null;
    created_at: Date;
}

// ─── View Interfaces ────────────────────────────────────────────────────────

export interface ProjectCard {
    project_id: string;
    title: string;
    description: string | null;
    cover_image_url: string | null;
    address_text: string | null;
    damage_type: DamageType;
    status: ProjectStatus;
    total_estimated_cost: number;
    total_funded_amount: number;
    funded_percentage: number;
    homeowner_name: string;
    latitude: number | null;
    longitude: number | null;
    published_at: Date | null;
    total_items: number;
    fully_funded_items: number;
}

export interface BOQFunding {
    item_id: string;
    project_id: string;
    material_name: string;
    material_category: string | null;
    unit: string;
    unit_price: number;
    required_quantity: number;
    total_cost: number;
    funded_amount: number;
    funded_percentage: number;
    status: BoqItemStatus;
    image_url: string | null;
    oracle_reference_price: number | null;
    project_title: string;
    // Supplier transparency (per strategic study §7.1)
    supplier_id: string | null;
    supplier_name: string | null;
    supplier_commercial_reg: string | null;
}

// ─── Request DTOs ───────────────────────────────────────────────────────────

export interface CreateProjectDTO {
    damage_type: DamageType;
    damage_severity?: DamageSeverity;
    description?: string;
    voice_recording_url?: string;
    gps_lat: number;
    gps_lng: number;
    address_text?: string;
    cover_image_url?: string;
    title: string;
}

export interface AddBOQItemDTO {
    material_name: string;
    material_category?: string;
    description?: string;
    unit: string;
    unit_price: number;           // in cents
    required_quantity: number;
    image_url?: string;
    preferred_supplier_id: string; // Required: pre-assigned verified supplier
}

export interface CreateDonationDTO {
    items: Array<{
        item_id: string;
        amount: number;             // in cents
    }>;
    // F-001 FIX: Aligned with PaymentGateway type in payment.service.ts.
    // Only 'visa' and 'fatora' are implemented gateways. Previous values
    // ('bank_transfer', 'crypto') silently fell through to Fatora, creating
    // a contract mismatch between API documentation and actual behavior.
    payment_method: 'visa' | 'fatora';
    return_url?: string;            // Gateway redirect after checkout
}

export interface SubmitSpatialProofDTO {
    item_id: string;
    project_id: string;
    gps_lat: number;
    gps_lng: number;
    gps_accuracy_meters?: number;
    image_url: string;
    description?: string;
    device_info?: Record<string, unknown>;
}

export interface ReleaseEscrowDTO {
    proof_id: string;
    item_id: string;
}

export interface FlagDiscrepancyDTO {
    proof_id: string;
    reason: string;
}

// ─── Supplier Catalog ───────────────────────────────────────────────────────

export interface SupplierCatalogItem {
    catalog_id: string;
    supplier_id: string;
    material_name: string;
    material_category: string;
    description: string | null;
    image_url: string | null;
    unit: string;
    unit_price_guide: number;     // BIGINT cents — guide price only
    min_order_qty: number;
    lead_time_days: number;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface AddCatalogItemDTO {
    material_name: string;
    material_category: string;
    description?: string;
    image_url?: string;
    unit: string;
    unit_price_guide: number;     // in cents
    min_order_qty?: number;
    lead_time_days?: number;
}

export interface UpdateCatalogItemDTO {
    material_name?: string;
    material_category?: string;
    description?: string;
    image_url?: string;
    unit?: string;
    unit_price_guide?: number;
    min_order_qty?: number;
    lead_time_days?: number;
}

export interface SupplierStats {
    pending_orders: number;       // POs with status 'generated' or 'sent_to_supplier'
    won_contracts: number;        // POs with status 'acknowledged' or beyond
    in_transit: number;           // POs with status 'shipped'
    total_revenue: number;        // Sum of delivered PO amounts (cents)
    catalog_items: number;        // Active catalog items
    total_orders: number;         // All POs ever received
}

// ─── Engineer Dashboard ─────────────────────────────────────────────────────

export interface EngineerStats {
    assigned_projects: number;    // Projects with assigned_engineer_id = me
    proofs_pending: number;       // Spatial proofs in 'submitted' status
    proofs_verified: number;      // Spatial proofs in 'verified' status
    escrow_released: number;      // Total escrow released (cents)
    active_bids: number;          // Bids in 'pending' status
    total_bids: number;           // All bids ever submitted
}

export interface EngineerProject {
    project_id: string;
    title: string;
    region: string;
    status: string;
    phase: string;                // Construction phase
    progress: number;             // Funded percentage 0-100
    boq_count: number;            // Number of BOQ items
    next_proof_due: string | null;
    created_at: Date;
}

// ─── Contractor Dashboard ───────────────────────────────────────────────────

export interface ContractorStats {
    active_projects: number;      // Projects with assigned_contractor_id = me
    pending_bids: number;         // Bids in 'pending' status
    won_bids: number;             // Bids in 'accepted' status
    total_escrow_received: number; // Escrow released (cents)
    total_bids: number;           // All bids ever submitted
    bid_win_rate: number;         // Accepted / total (0-1)
}

export interface AvailableProject {
    project_id: string;
    title: string;
    region: string;
    damage_type: string;
    total_estimated_cost: number;
    boq_count: number;
    published_at: Date;
    bid_count: number;            // How many contractors already bid
    distance_km: number | null;   // Distance from contractor
}

export interface ContractorPayment {
    transaction_id: string;
    project_id: string;
    project_title: string;
    amount: number;               // cents
    transaction_type: string;
    created_at: Date;
}

// ─── Tradesperson Dashboard ─────────────────────────────────────────────────

export type TradeType = 'tiling' | 'painting' | 'plumbing' | 'electrical' | 'carpentry' | 'welding' | 'masonry' | 'plastering' | 'hvac' | 'general';
export type AvailabilityStatus = 'available' | 'busy' | 'offline';
export type RequestUrgency = 'routine' | 'urgent' | 'emergency';

export interface TradespersonStats {
    active_jobs: number;            // In-progress requests + assignments
    completed_jobs: number;
    pending_requests: number;       // Open requests matching my trade
    active_assignments: number;     // Active contractor assignments
    total_earnings: number;         // cents
    average_rating: number | null;  // 1.00-5.00
}

export interface ServiceRequest {
    request_id: string;
    homeowner_id: string;
    homeowner_name: string;
    trade_needed: TradeType;
    title: string;
    description: string | null;
    address_text: string | null;
    urgency: RequestUrgency;
    budget_min: number | null;
    budget_max: number | null;
    status: string;
    created_at: Date;
}

export interface TradeAssignment {
    assignment_id: string;
    contractor_id: string;
    contractor_name: string;
    project_id: string;
    project_title: string;
    trade_required: TradeType;
    scope_description: string;
    agreed_rate: number;           // cents
    rate_type: string;
    estimated_days: number | null;
    status: string;
    start_date: string | null;
    end_date: string | null;
    created_at: Date;
}

// ─── Auth Context ───────────────────────────────────────────────────────────

export interface AuthUser {
    user_id: string;
    role: UserRole;
    is_active: boolean;
}

// Extend Express Request to include auth user
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace -- Declaration merging for Express.Request requires namespace syntax
    namespace Express {
        interface Request {
            authUser?: AuthUser;
        }
    }
}

// ─── API Response ───────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

// ─── Verification Case (Admin View) ─────────────────────────────────────────

export interface VerificationCase {
    proof: SpatialProof;
    project: Pick<Project, 'project_id' | 'title' | 'gps_location' | 'address_text'>;
    boq_item: Pick<ItemizedBOQ, 'item_id' | 'material_name' | 'material_category' | 'unit_price' | 'required_quantity'>;
    purchase_order: PurchaseOrder | null;
    escrow_entries: Array<Pick<EscrowLedger, 'transaction_id' | 'donor_id' | 'amount_locked' | 'payment_status'>>;
    engineer_name: string;
}
