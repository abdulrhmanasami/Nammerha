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

// P2-W12-001 FIX: Single source of truth for password complexity rules.
// PREVIOUS: Identical Zod chains duplicated 3× (registerSchema L43-49,
// resetPasswordSchema L75-81, changePasswordSchema L86-92). changePasswordSchema
// had bare .regex() with NO validation messages — users got cryptic Zod errors.
// NOW: One exported `passwordSchema` used by all 3 schemas.
// Standard: DRY Principle, OWASP ASVS 2.1.1 (Password Length),
// NIST SP 800-63B §5.1.1 (Memorized Secrets).
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  // P2-DEEP-001 FIX: Strict name validation — parity with frontend validateName().
  // PREVIOUS: Only min(2).max(100).trim() — accepted "123456", "!!!", pure emoji.
  // NOW: Must contain ≥1 Unicode letter, no digits, no dangerous chars.
  // Standard: Unicode CLDR Name Validation, OWASP Input Validation, Frontend Parity.
  full_name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must not exceed 100 characters')
    .trim()
    .regex(/\p{L}/u, 'Name must contain at least one letter')
    .regex(/^[^0-9]*$/, 'Name must not contain digits')
    .regex(/^[^<>{}[\]\\]*$/, 'Name must not contain special characters like < > { } [ ] \\'),
  // P2-W15-006 FIX: Phone format validation — prevents garbage data like "abc".
  // PREVIOUS: Only `.max(20)` — accepted any string as a phone number.
  // NOW: Must be digits with optional + prefix, 7-20 chars total.
  // Standard: E.164 (relaxed), Frontend Parity, OWASP Input Validation.
  phone: z
    .string()
    .max(20, 'Phone number must not exceed 20 characters')
    .regex(/^\+?[0-9]{7,20}$/, 'Invalid phone number format')
    .optional(),
  role: z
    .enum(['homeowner', 'engineer', 'donor', 'supplier', 'contractor', 'tradesperson'])
    .optional(),
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
  new_password: passwordSchema,
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: passwordSchema,
  remember: z.boolean().optional(),
});

export const resendVerificationSchema = z.object({
  email: emailSchema,
});

// P0-W12-004 FIX: Zod schema for POST /auth/verify-email body.
// PREVIOUS: verify-email was GET with token in URL path — no Zod validation.
// NOW: POST with token in body. Min length 10 = parity with existing inline
// check at auth.routes.ts L694 (token.length < 10).
// Standard: Input Validation (Zod), OWASP Input Validation.
export const verifyEmailSchema = z.object({
  token: z.string().min(10, 'Invalid verification token').max(256, 'Token too long'),
});

// ─── MFA Schemas (Migration 046) ────────────────────────────────────────────

/** TOTP code for MFA setup confirmation */
export const mfaConfirmSchema = z.object({
  token: z
    .string()
    .length(6, 'Must be exactly 6 digits')
    .regex(/^\d{6}$/, 'Must be 6 digits'),
});

/** Login MFA challenge — TOTP code verification */
export const mfaVerifySchema = z.object({
  mfa_token: z.string().min(1, 'MFA token is required'),
  code: z
    .string()
    .length(6, 'Must be exactly 6 digits')
    .regex(/^\d{6}$/, 'Must be 6 digits'),
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
  items: z
    .array(
      z.object({
        item_id: uuidSchema,
        amount: centsSchema,
      }),
    )
    .min(1, 'At least one item is required'),
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
  fidic_params: z
    .object({
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
    })
    .refine((params) => Math.abs(params.a + params.b + params.c + params.d - 1.0) < 0.001, {
      message: 'FIDIC coefficients (a+b+c+d) must sum to 1.0',
    }),
  original_amount: centsSchema,
});

// ─── Compliance Schemas ─────────────────────────────────────────────────────

export const sdnScreenSchema = z.object({
  full_name: z.string().min(2).max(200).trim(),
  country: z.string().max(100).optional(),
});

// ─── Storage Schemas ────────────────────────────────────────────────────────

export const presignedUploadSchema = z.object({
  filename: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Filename contains invalid characters'),
  content_type: z
    .string()
    .regex(
      /^(image|video|application)\/(jpeg|jpg|png|gif|webp|mp4|pdf|octet-stream)$/i,
      'Unsupported file type',
    ),
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

export const providerTypeSchema = z.enum(['contractor', 'engineer', 'tradesperson', 'supplier']);

export const contractPayMethodSchema = z.enum(['fatora', 'cash', 'bank_transfer']);

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

// ─── Compliance Schemas (SDN / Export Controls) ─────────────────────────────

export const sdnReviewSchema = z.object({
  decision: z.enum(['false_positive', 'confirmed_match']),
  notes: z.string().max(2000).optional(),
});

export const importSDNSchema = z.object({
  entries: z
    .array(
      z.object({
        sdn_name: z.string().min(1).max(300),
        sdn_type: z.string().max(50).optional(),
        aliases: z.array(z.string().max(300)).optional(),
        country: z.string().max(100).optional(),
        id_numbers: z.array(z.string().max(300)).optional(),
        source: z.string().max(200).optional(),
        program: z.string().max(200).optional(),
        remarks: z.string().max(5000).optional(),
      }),
    )
    .min(1, 'At least one SDN entry is required')
    .max(10000, 'Maximum 10,000 entries per import'),
});

export const addControlledMaterialSchema = z.object({
  material_name: z.string().min(1).max(200).trim(),
  material_category: z.string().min(1).max(100).trim(),
  hs_code: z.string().max(50).optional(),
  regulation: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

// ─── Payment Webhook Schema ─────────────────────────────────────────────────

export const webhookCallbackSchema = z.object({
  reference: z.string().min(1).max(255),
  gateway: z.string().min(1).max(50),
  status: z.string().min(1).max(50),
  gateway_tx_id: z.string().max(255).optional(),
  signature: z.string().max(1024).optional(),
});

// ─── Project Dashboard Schemas ──────────────────────────────────────────────

export const createDailyLogSchema = z.object({
  summary: z.string().min(5).max(5000).trim(),
  weather: z.string().max(100).optional(),
  temperature_c: z.number().min(-60).max(60).optional(),
  workers_count: z.number().int().min(0).max(10000).optional(),
  hours_worked: z.number().min(0).max(24).optional(),
  materials_used: z.string().max(5000).optional(),
  issues: z.string().max(5000).optional(),
  images: z.array(z.string().url()).max(20).optional(),
});

export const createApprovalSchema = z.object({
  approval_type: z.string().min(1).max(100),
  description: z.string().min(5).max(5000).trim(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  documents: z.array(z.string().url()).max(10).optional(),
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().max(2000).optional(),
});

// ─── Routing Schemas (Georavity) ────────────────────────────────────────────

const latLngSchema = z.object({
  lat: gpsLatSchema,
  lng: gpsLngSchema,
});

const costingModelSchema = z.enum([
  'auto', 'pedestrian', 'bicycle', 'truck', 'motor_scooter',
]).optional();

export const routeRequestSchema = z.object({
  origin: latLngSchema,
  destination: latLngSchema,
  costing: costingModelSchema,
});

export const matrixRequestSchema = z.object({
  source: latLngSchema,
  targets: z.array(latLngSchema).min(1).max(50),
  costing: costingModelSchema,
});

export const isochroneRequestSchema = z.object({
  center: latLngSchema,
  contours_minutes: z.array(z.number().int().min(1).max(120)).min(1).max(10),
  costing: costingModelSchema,
});

// ─── Enterprise Schemas ─────────────────────────────────────────────────────

export const feeRateSchema = z.object({
  fee_rate_bps: z.number().int().min(0).max(2000),
});

export const createOrgSchema = z.object({
  org_name: z.string().min(2).max(200).trim(),
  org_type: z.string().min(2).max(100).trim(),
  contact_email: emailSchema,
  tier: z.string().max(50).optional(),
  annual_fee_cents: z.number().int().min(0).optional(),
});

// ─── Admin Schemas (continued) ──────────────────────────────────────────────

export const refundDecisionSchema = z.object({
  refund_id: uuidSchema,
  decision: z.enum(['approved', 'rejected']),
  notes: z.string().max(2000).optional(),
});

// ─── Supplier Catalog Schemas ───────────────────────────────────────────────

/** Max unit price in cents ($1M) — prevents integer overflow and unrealistic pricing. */
const MAX_UNIT_PRICE_CENTS = 100_000_000;

export const addCatalogItemSchema = z.object({
  material_name: z.string().min(1).max(200).trim(),
  material_category: z.string().min(1).max(100).trim(),
  description: z.string().max(2000).optional(),
  image_url: z.string().url().optional(),
  unit: z.string().min(1).max(50),
  unit_price_guide: z.number().int().positive().max(MAX_UNIT_PRICE_CENTS),
  min_order_qty: z.number().int().min(1).optional(),
  lead_time_days: z.number().int().min(1).optional(),
});

export const updateCatalogItemSchema = z.object({
  material_name: z.string().min(1).max(200).trim().optional(),
  material_category: z.string().min(1).max(100).trim().optional(),
  description: z.string().max(2000).optional(),
  image_url: z.string().url().optional(),
  unit: z.string().min(1).max(50).optional(),
  unit_price_guide: z.number().int().positive().max(MAX_UNIT_PRICE_CENTS).optional(),
  min_order_qty: z.number().int().min(1).optional(),
  lead_time_days: z.number().int().min(1).optional(),
});

export const poStatusSchema = z.object({
  status: z.enum(['acknowledged', 'shipped', 'delivered']),
});

// ─── Review Schemas (full set) ──────────────────────────────────────────────

const reviewableTypeSchema = z.enum([
  'contractor_profiles', 'supplier_profiles', 'engineer_profiles',
  'tradesperson_profiles', 'homeowner_profiles', 'project',
]);

const dimensionRatingSchema = z.object({
  dimension_key: z.string().min(1).max(100),
  score: z.number().int().min(1).max(5),
});

export const createReviewFullSchema = z.object({
  reviewable_type: reviewableTypeSchema,
  reviewable_id: uuidSchema,
  project_id: uuidSchema.optional(),
  overall_rating: z.number().int().min(1).max(5),
  title: z.string().max(200).optional(),
  body: z.string().min(10).max(5000),
  ratings: z.array(dimensionRatingSchema).max(20).optional(),
});

export const updateReviewSchema = z.object({
  overall_rating: z.number().int().min(1).max(5).optional(),
  title: z.string().max(200).optional(),
  body: z.string().min(10).max(5000).optional(),
  ratings: z.array(dimensionRatingSchema).max(20).optional(),
});

export const createResponseSchema = z.object({
  body: z.string().min(5).max(2000),
});

export const flagReviewSchema = z.object({
  reason: z.enum(['spam', 'inappropriate', 'fake', 'conflict_of_interest', 'other']),
  description: z.string().max(1000).optional(),
});

export const reviewHelpfulSchema = z.object({
  is_helpful: z.boolean(),
});

// ─── Monetization Schemas ───────────────────────────────────────────────────

export const commissionRateSchema = z.object({
  commission_rate_bps: z.number().int().min(0).max(5000),
});

export const createTipSchema = z.object({
  payment_reference: z.string().min(1).max(255),
  tip_amount_cents: z.number().int().positive(),
  tip_percentage: z.number().min(0).max(100).optional(),
  payment_gateway: z.string().max(50).optional(),
  payment_gateway_ref: z.string().max(255).optional(),
});

// ─── Reality Capture Schemas ────────────────────────────────────────────────

export const submitCaptureSchema = z.object({
  project_id: uuidSchema,
  capture_type: z.enum(['photo', 'video', 'panorama', '3d_scan']),
  media_url: z.string().url(),
  gps_lat: gpsLatSchema,
  gps_lng: gpsLngSchema,
  gps_accuracy_meters: z.number().min(0).max(1000).optional(),
  description: z.string().max(2000).optional(),
  device_info: z.record(z.string(), z.unknown()).optional(),
});

export const addAnnotationSchema = z.object({
  capture_id: uuidSchema,
  annotation_type: z.string().min(1).max(100),
  content: z.string().min(1).max(5000),
  position_x: z.number().optional(),
  position_y: z.number().optional(),
});

/** Engineer camera capture — matches SubmitCaptureDTO + project_id at engineer.routes.ts L113 */
export const engineerCaptureSchema = z.object({
  project_id: uuidSchema,
  construction_phase: z.enum([
    'demolition', 'foundation', 'structural',
    'plumbing_pre_concrete', 'electrical_pre_concrete', 'concrete_pour',
    'masonry', 'plastering', 'finishing', 'final_inspection',
  ]),
  file_url: z.string().url(),
  capture_type: z.enum(['photo_360', 'video_360', 'point_cloud', 'photo_standard']).optional(),
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  thumbnail_url: z.string().url().optional(),
  file_size_bytes: z.number().int().positive().max(524_288_000).optional(), // 500MB
  camera_model: z.string().max(100).optional(),
  horizontal_fov: z.number().min(0).max(360).optional(),
  heading: z.number().min(0).max(360).optional(),
  pitch: z.number().min(-90).max(90).optional(),
  gps_lat: gpsLatSchema.optional(),
  gps_lng: gpsLngSchema.optional(),
  gps_accuracy_meters: z.number().min(0).max(1000).optional(),
  altitude_meters: z.number().optional(),
  floor_plan_id: uuidSchema.optional(),
});

export const uploadFloorPlanSchema = z.object({
  project_id: uuidSchema,
  floor_label: z.string().min(1).max(100),
  media_url: z.string().url(),
  scale_meters_per_pixel: z.number().positive().optional(),
});

// ─── Tradesperson Schemas ───────────────────────────────────────────────────

export const acceptTaskSchema = z.object({
  accept: z.boolean(),
});

export const taskStatusSchema = z.object({
  status: z.enum(['in_progress', 'completed', 'blocked']),
});

export const availabilityStatusSchema = z.object({
  status: z.enum(['available', 'busy', 'offline']),
});

// ─── Subscription Schemas ───────────────────────────────────────────────────

export const subscribeSchema = z.object({
  plan_slug: z.string().min(1).max(100),
});

export const updatePlanPriceSchema = z.object({
  price_cents: z.number().int().min(0).max(100_000_000),
});

// ─── Storage Upload Request Schema ──────────────────────────────────────────

export const presignedUploadRequestSchema = z.object({
  project_id: uuidSchema,
  category: z.string().min(1).max(100),
  filename: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Filename contains invalid characters'),
  content_type: z
    .string()
    .regex(
      /^(image|video|application)\/(jpeg|jpg|png|gif|webp|mp4|pdf|octet-stream)$/i,
      'Unsupported file type',
    ),
  file_size_bytes: z.number().int().positive().max(52_428_800), // 50MB
});

// ─── MFA Login Token Schema ─────────────────────────────────────────────────

export const mfaLoginTokenSchema = z.object({
  mfa_token: z.string().min(1, 'MFA token is required'),
});

// ─── Homeowner Service Request Schema ───────────────────────────────────────

export const createServiceRequestSchema = z.object({
  damage_type: z.enum(['structural', 'plumbing', 'electrical', 'mixed', 'general']),
  damage_severity: z.enum(['minor', 'moderate', 'severe', 'total_destruction']).optional(),
  description: z.string().min(10).max(5000).trim(),
  gps_lat: gpsLatSchema,
  gps_lng: gpsLngSchema,
  address_text: z.string().max(500).optional(),
  images: z.array(z.string().url()).max(10).optional(),
  budget_max: z.number().int().positive().optional(),
});

// ─── Spatial / Satellite / Geofencing Schemas ───────────────────────────────

export const registerImagerySchema = z.object({
  project_id: uuidSchema,
  provider: z.string().min(1).max(100),
  image_url: z.string().url(),
  capture_date: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/).optional(),
  resolution_cm: z.number().positive().optional(),
  gps_bounds: z.object({
    north: gpsLatSchema,
    south: gpsLatSchema,
    east: gpsLngSchema,
    west: gpsLngSchema,
  }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const nearbySearchSchema = z.object({
  lat: gpsLatSchema,
  lng: gpsLngSchema,
});

export const createGeofenceZoneSchema = z.object({
  project_id: uuidSchema,
  zone_name: z.string().min(1).max(200).trim(),
  zone_type: z.enum(['work_area', 'exclusion', 'safety', 'staging']).optional(),
  geometry: z.record(z.string(), z.unknown()), // GeoJSON geometry
  radius_meters: z.number().positive().optional(),
  alert_on_entry: z.boolean().optional(),
  alert_on_exit: z.boolean().optional(),
});

// ─── Privacy Settings Schema ────────────────────────────────────────────────

export const privacySettingsSchema = z.object({
  settings: z.record(
    z.string(),
    z.record(z.string(), z.enum(['public', 'project_members', 'private'])),
  ).optional(),
});

// ─── Role Assignment Schema ─────────────────────────────────────────────────

export const assignRoleSchema = z.object({
  role: z.enum(['homeowner', 'engineer', 'donor', 'supplier', 'contractor', 'tradesperson', 'admin', 'auditor']),
});

// ─── API Keys Schema ────────────────────────────────────────────────────────

export const createApiKeySchema = z.object({
  key_name: z.string().min(1).max(100).trim(),
  scopes: z.array(z.string().max(100)).min(1).max(20),
  expires_in_days: z.number().int().min(1).max(365).optional(),
});

// ─── EPA Oracle Approval Schema ─────────────────────────────────────────────

export const epaApprovalSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
});

// ─── Contractor Bid Schema ──────────────────────────────────────────────────

export const contractorBidSchema = z.object({
  project_id: uuidSchema,
  proposed_cost: centsSchema,
  estimated_days: z.number().int().positive().max(3650),
  cover_letter: z.string().max(5000).optional(),
  methodology: z.string().max(5000).optional(),
});

// ─── Translation Schemas (continued) ────────────────────────────────────────

export const addGlossaryTermSchema = z.object({
  source_term: z.string().min(1).max(500).trim(),
  approved_translation: z.string().min(1).max(500).trim(),
  source_lang: z.string().min(2).max(5).optional(),
  target_lang: z.string().min(2).max(5),
  context: z.string().max(2000).optional(),
});

export const resolveConflictSchema = z.object({
  resolution: z.enum(['approved', 'corrected', 'rejected']),
  corrected_text: z.string().max(10000).optional(),
});

export const batchTranslateRequestSchema = z.object({
  items: z.array(z.string().min(1).max(10000)).min(1).max(50),
  source_lang: z.string().min(2).max(5),
  target_lang: z.string().min(2).max(5),
  content_type: z.string().max(50).optional(),
  context: z.string().max(2000).optional(),
});

// ─── CSP Report Schema ──────────────────────────────────────────────────────

export const cspReportSchema = z.record(z.string(), z.unknown());

// ─── Storage Upload URL Schema ──────────────────────────────────────────────

export const storageUploadUrlSchema = z.object({
  project_id: z.string().min(1).max(100),
  category: z.string().min(1).max(50),
  filename: z.string().min(1).max(255),
  content_type: z.string().min(1).max(100),
  file_size_bytes: z.number().int().positive().max(52_428_800).optional(),
});

