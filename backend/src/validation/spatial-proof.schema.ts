// ============================================================================
// Nammerha Backend — Zod Validation Schemas (F-006 Remediation)
// ============================================================================
// Runtime validation schemas for request payloads on security-critical routes.
// Each schema mirrors a corresponding TypeScript DTO interface from types/index.ts.
//
// WHY ZOD:
//   `req.body as SomeDTO` is a TYPE ASSERTION — it tells TypeScript to trust the
//   runtime shape of untrusted external input. If gps_lat is the string "NaN",
//   the type says `number` but the runtime value breaks Haversine calculations.
//   Zod enforces runtime validation + produces structured error messages.
//
// ZOD VERSION: 4.x — uses `{ error: ... }` param syntax (v3's `required_error`
// and `invalid_type_error` are removed in v4).
//
// NAMING CONVENTION:
//   Schema: submitSpatialProofSchema (camelCase, suffix Schema)
//   Parsed type: z.infer<typeof submitSpatialProofSchema>
//   Validator fn: parseSpatialProof (used in route handlers)
// ============================================================================

import { z } from 'zod';

// ─── UUID Validation ────────────────────────────────────────────────────────
// Reusable UUID regex for all entity IDs (PostgreSQL gen_random_uuid output).
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const zodUUID = (fieldName: string) =>
    z.string({ error: `${fieldName} must be a valid string` })
        .regex(UUID_REGEX, { message: `${fieldName} must be a valid UUID` });

// ─── Spatial Proof Schema (Path 3: Execution → Spatial Proof) ───────────────
// Used by:
//   - POST /api/spatial-proof  (spatial-proof.routes.ts)
//   - POST /api/engineer/camera/spatial-proof  (engineer.routes.ts)

export const submitSpatialProofSchema = z.object({
    item_id: zodUUID('item_id'),

    project_id: zodUUID('project_id'),

    // GPS coordinates — must be within valid Earth ranges.
    // Syria bounding box: lat [32.3°, 37.3°], lng [35.7°, 42.3°]
    // We validate global range here; the Haversine proximity check in
    // reality-capture.service.ts handles project-specific geo-fencing.
    gps_lat: z.number({ error: 'gps_lat must be a valid number' })
        .min(-90, { message: 'gps_lat must be between -90 and 90' })
        .max(90, { message: 'gps_lat must be between -90 and 90' })
        .refine((val) => Number.isFinite(val), { message: 'gps_lat must be a finite number (not NaN or Infinity)' }),

    gps_lng: z.number({ error: 'gps_lng must be a valid number' })
        .min(-180, { message: 'gps_lng must be between -180 and 180' })
        .max(180, { message: 'gps_lng must be between -180 and 180' })
        .refine((val) => Number.isFinite(val), { message: 'gps_lng must be a finite number (not NaN or Infinity)' }),

    // Accuracy in meters — device-reported GPS accuracy.
    // Used by auditors to assess proof confidence. Reject absurd values.
    gps_accuracy_meters: z.number()
        .positive({ message: 'gps_accuracy_meters must be positive' })
        .max(10000, { message: 'gps_accuracy_meters exceeds maximum (10,000m)' })
        .optional(),

    // Pre-signed S3/MinIO URL for the proof image.
    // Must be non-empty; actual URL format validation is handled by the
    // storage service (which verifies the bucket/key exist).
    image_url: z.string({ error: 'image_url must be a valid string' })
        .min(1, { message: 'image_url cannot be empty' })
        .max(2048, { message: 'image_url exceeds maximum length (2048 chars)' }),

    // Engineer's textual description of the delivered material/work.
    description: z.string()
        .max(2000, { message: 'description exceeds maximum length (2000 chars)' })
        .optional(),

    // Client-side device metadata (OS, app version, etc.)
    // Captured by mobile app for forensic analysis.
    device_info: z.record(z.string(), z.unknown()).optional(),

    // Client-computed SHA-256 of the image — for tamper detection.
    // Server recomputes from the stored image and compares.
    client_hash: z.string()
        .max(128, { message: 'client_hash exceeds maximum length (128 chars)' })
        .optional(),
});

// Inferred TypeScript type from Zod schema — should match SubmitSpatialProofDTO.
export type ValidatedSpatialProof = z.infer<typeof submitSpatialProofSchema>;

// ─── Validation Utilities ───────────────────────────────────────────────────

/**
 * Parse and validate spatial proof input.
 *
 * @returns Parsed DTO on success
 * @throws ZodError with structured field-level errors
 */
export function parseSpatialProof(input: unknown): ValidatedSpatialProof {
    return submitSpatialProofSchema.parse(input);
}

/**
 * Format Zod errors into a human-readable string for API error responses.
 * Groups all field errors into a single message.
 *
 * Example output:
 *   "gps_lat: must be between -90 and 90; image_url: is required"
 */
export function formatZodErrors(error: z.ZodError): string {
    return error.issues
        .map((issue) => {
            const path = issue.path.join('.');
            return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join('; ');
}
