// ============================================================================
// Nammerha Backend — Zod Validation Schemas (SEC-02)
// ============================================================================
// Centralized input validation for all critical API routes.
// Every route that accepts user input MUST validate via Zod before processing.
//
// Architecture:
//   - Each domain exports its schemas from this directory
//   - Route handlers call schema.parse(req.body) at the top of each handler
//   - Zod errors are caught by the i18n-error middleware and returned as
//     structured validation error responses with translated messages
//
// Standard: OWASP Input Validation, Nammerha Domain Law §1 (Zero-Trust)
// ============================================================================

import { z } from 'zod';

// ─── Shared Primitives ──────────────────────────────────────────────────────

/** UUID v4 format validation */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/** Email: RFC 5322 compliant */
export const emailSchema = z.string().email('Invalid email format').max(254);

/** GPS coordinate validation */
export const gpsLatSchema = z.number().min(-90).max(90);
export const gpsLngSchema = z.number().min(-180).max(180);

/** Monetary amount in cents (integer, positive) */
export const centsSchema = z.number().int().positive('Amount must be a positive integer (cents)');

/** Pagination */
export const paginationSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});

// ─── Auth Schemas ───────────────────────────────────────────────────────────

export const registerSchema = z.object({
    email: emailSchema,
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password must not exceed 128 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one digit')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    full_name: z.string().min(2).max(100).trim(),
    phone: z.string().max(20).optional(),
    role: z.enum(['homeowner', 'engineer', 'donor', 'supplier', 'contractor', 'tradesperson']).optional(),
    intent: z.string().max(500).optional(),
});

export const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required').max(128),
    remember: z.boolean().optional(),
});

export const forgotPasswordSchema = z.object({
    email: emailSchema,
});

export const resetPasswordSchema = z.object({
    token: z.string().min(1, 'Reset token is required'),
    new_password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password must not exceed 128 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one digit')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

export const changePasswordSchema = z.object({
    current_password: z.string().min(1),
    new_password: z.string()
        .min(8)
        .max(128)
        .regex(/[A-Z]/)
        .regex(/[a-z]/)
        .regex(/[0-9]/)
        .regex(/[^A-Za-z0-9]/),
    remember: z.boolean().optional(),
});

export const resendVerificationSchema = z.object({
    email: emailSchema,
});

// ─── MFA Schemas (Migration 046) ────────────────────────────────────────────

/** TOTP code for MFA setup confirmation */
export const mfaConfirmSchema = z.object({
    token: z.string().length(6, 'Must be exactly 6 digits').regex(/^\d{6}$/, 'Must be 6 digits'),
});

/** Login MFA challenge — TOTP code verification */
export const mfaVerifySchema = z.object({
    mfa_token: z.string().min(1, 'MFA token is required'),
    code: z.string().length(6, 'Must be exactly 6 digits').regex(/^\d{6}$/, 'Must be 6 digits'),
});

/** Login MFA challenge — recovery code verification */
export const mfaRecoverySchema = z.object({
    mfa_token: z.string().min(1, 'MFA token is required'),
    recovery_code: z.string().min(1, 'Recovery code is required').max(20),
});

/** Disable MFA — requires password confirmation */
export const mfaDisableSchema = z.object({
    password: z.string().min(1, 'Password is required'),
});

// ─── Account Deletion Schemas (Migration 047 — GDPR Art. 17) ────────────────

/** Request account deletion — requires password + typed confirmation */
export const accountDeletionSchema = z.object({
    password: z.string().min(1, 'Password is required'),
    confirmation: z.string().min(1, 'Confirmation text is required'),
    reason: z.string().max(500).optional(),
});

// ─── Project Schemas ────────────────────────────────────────────────────────

export const createProjectSchema = z.object({
    title: z.string().min(3).max(200).trim(),
    damage_type: z.enum(['structural', 'plumbing', 'electrical', 'mixed', 'general']),
    damage_severity: z.enum(['minor', 'moderate', 'severe', 'total_destruction']).optional(),
    description: z.string().max(5000).optional(),
    gps_lat: gpsLatSchema,
    gps_lng: gpsLngSchema,
    address_text: z.string().max(500).optional(),
    cover_image_url: z.string().url().optional(),
    images: z.array(z.string().url()).max(10).optional(),
});

export const addBOQItemSchema = z.object({
    material_name: z.string().min(1).max(200).trim(),
    material_category: z.string().max(100).optional(),
    description: z.string().max(2000).optional(),
    unit: z.string().min(1).max(50),
    unit_price: centsSchema,
    required_quantity: z.number().int().positive(),
    image_url: z.string().url().optional(),
    preferred_supplier_id: uuidSchema,
});

// ─── Donation Schemas ───────────────────────────────────────────────────────

export const createDonationSchema = z.object({
    items: z.array(z.object({
        item_id: uuidSchema,
        amount: centsSchema,
    })).min(1, 'At least one item is required'),
    payment_method: z.enum(['visa', 'fatora']).optional(),
    return_url: z.string().url().optional(),
    gift_recipient_name: z.string().max(100).optional(),
    gift_message: z.string().max(500).optional(),
    donation_intent: z.enum(['zakat', 'sadaqah', 'general']).optional(),
});

// ─── Payment Schemas ────────────────────────────────────────────────────────

export const initiatePaymentSchema = z.object({
    item_id: uuidSchema,
    project_id: uuidSchema,
    amount: centsSchema,
    gateway: z.enum(['visa', 'fatora']),
    currency: z.string().length(3).default('USD').optional(),
    return_url: z.string().url().optional(),
});

// ─── Admin Schemas ──────────────────────────────────────────────────────────

export const releaseEscrowSchema = z.object({
    proof_id: uuidSchema,
    item_id: uuidSchema,
});

export const flagDiscrepancySchema = z.object({
    proof_id: uuidSchema,
    reason: z.string().min(10, 'Reason must be at least 10 characters').max(2000),
});

export const kycDecisionSchema = z.object({
    decision: z.enum(['verified', 'rejected']),
    reason: z.string().max(2000).optional(),
});

// ─── Contact Schema ─────────────────────────────────────────────────────────

export const contactSchema = z.object({
    name: z.string().min(2).max(100).trim(),
    email: emailSchema,
    subject: z.string().min(3).max(200).trim(),
    message: z.string().min(10).max(5000).trim(),
    category: z.string().max(50).optional(),
});

// ─── Matchmaking Schemas ────────────────────────────────────────────────────

export const submitBidSchema = z.object({
    proposed_cost: centsSchema,
    estimated_days: z.number().int().positive().max(3650),
    cover_letter: z.string().max(5000).optional(),
    methodology: z.string().max(5000).optional(),
});

// ─── EPA Oracle Schemas ─────────────────────────────────────────────────────

export const upsertPriceSchema = z.object({
    material_code: z.string().min(1).max(50),
    material_name: z.string().min(1).max(200),
    unit: z.string().min(1).max(50),
    base_price: centsSchema,
    current_price: centsSchema,
});

export const calculateEPASchema = z.object({
    project_id: uuidSchema,
    milestone_id: uuidSchema.optional(),
    fidic_params: z.object({
        a: z.number().min(0).max(1),
        b: z.number().min(0).max(1),
        c: z.number().min(0).max(1),
        d: z.number().min(0).max(1),
        Ln: z.number().positive(),
        En: z.number().positive(),
        Mn: z.number().positive(),
        Lo: z.number().positive(),
        Eo: z.number().positive(),
        Mo: z.number().positive(),
    }).refine(
        (params) => Math.abs(params.a + params.b + params.c + params.d - 1.0) < 0.001,
        { message: 'FIDIC coefficients (a+b+c+d) must sum to 1.0' }
    ),
    original_amount: centsSchema,
});

// ─── Compliance Schemas ─────────────────────────────────────────────────────

export const sdnScreenSchema = z.object({
    full_name: z.string().min(2).max(200).trim(),
    country: z.string().max(100).optional(),
});

// ─── Storage Schemas ────────────────────────────────────────────────────────

export const presignedUploadSchema = z.object({
    filename: z.string()
        .min(1)
        .max(255)
        .regex(/^[a-zA-Z0-9._-]+$/, 'Filename contains invalid characters'),
    content_type: z.string()
        .regex(/^(image|video|application)\/(jpeg|jpg|png|gif|webp|mp4|pdf|octet-stream)$/i,
            'Unsupported file type'),
    size_bytes: z.number().int().positive().max(52_428_800), // 50MB max
});

// ─── Review Schemas ─────────────────────────────────────────────────────────

export const createReviewSchema = z.object({
    reviewee_id: uuidSchema,
    project_id: uuidSchema.optional(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(2000).optional(),
    review_type: z.enum(['general', 'quality', 'timeliness', 'communication']).optional(),
});

// ─── Translation Schemas ────────────────────────────────────────────────────

export const translateSchema = z.object({
    text: z.string().min(1).max(10000),
    source_lang: z.string().min(2).max(5),
    target_lang: z.string().min(2).max(5),
});

export const batchTranslateSchema = z.object({
    items: z.array(z.string().min(1).max(10000)).min(1).max(50),
    source_lang: z.string().min(2).max(5),
    target_lang: z.string().min(2).max(5),
});

// ─── Contract Payment Schemas (Phase 1 Backend) ────────────────────────────

export const providerTypeSchema = z.enum([
    'contractor', 'engineer', 'tradesperson', 'supplier',
]);

export const contractPayMethodSchema = z.enum([
    'fatora', 'cash', 'bank_transfer',
]);

/** Milestone definition for contract creation */
const milestoneDefSchema = z.object({
    title: z.string().min(2).max(300).trim(),
    description: z.string().max(2000).optional(),
    milestone_order: z.number().int().min(0).max(50),
    amount: centsSchema,
    percentage: z.number().positive().max(100),
});

export const createContractSchema = z.object({
    project_id: uuidSchema,
    provider_id: uuidSchema,
    provider_type: providerTypeSchema,
    total_agreed_amount: centsSchema,
    bid_id: uuidSchema.optional(),
    notes: z.string().max(5000).optional(),
    milestones: z.array(milestoneDefSchema).max(20).optional(),
});

export const createContractPaymentSchema = z.object({
    amount: centsSchema,
    payment_method: contractPayMethodSchema,
    milestone_id: uuidSchema.optional(),
    confirmation_note: z.string().max(2000).optional(),
    transfer_receipt_url: z.string().url().optional(),
});

export const confirmContractPaymentSchema = z.object({
    note: z.string().max(2000).optional(),
});

export const contractListQuerySchema = z.object({
    status: z.enum(['draft', 'active', 'completed', 'disputed', 'cancelled']).optional(),
    ...paginationSchema.shape,
});
