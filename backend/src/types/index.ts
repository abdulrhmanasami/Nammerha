// ============================================================================
// Nammerha Backend — TypeScript Type Definitions
// All types mirror the PostgreSQL ENUM and table definitions from
// migrations 001_core_schema and 002_user_journeys.
// ============================================================================

// ─── ENUM Types ─────────────────────────────────────────────────────────────

export type UserRole = 'donor' | 'homeowner' | 'engineer' | 'supplier' | 'admin' | 'auditor';

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
    created_at: Date;
    updated_at: Date;
}

export interface Project {
    project_id: string;
    homeowner_id: string;
    assigned_engineer_id: string | null;
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
    payment_method: 'visa' | 'bank_transfer' | 'crypto';
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

// ─── Auth Context ───────────────────────────────────────────────────────────

export interface AuthUser {
    user_id: string;
    role: UserRole;
    is_active: boolean;
}

// Extend Express Request to include auth user
declare global {
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
