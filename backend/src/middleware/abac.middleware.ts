// ============================================================================
// Nammerha Backend — ABAC Middleware (Attribute-Based Access Control)
// ============================================================================
// Layered on TOP of RBAC. Validates credential attributes (insurance expiry,
// license validity, registration status) before allowing high-stakes actions.
//
// Auth chain per request:
//   authMiddleware → requireActive → requireRole → requireAttributes (THIS)
//
// Policies are DECLARATIVE — defined as data, not code. Each policy maps
// an action key to a set of attribute checks executed via a single SQL query.
// ============================================================================
import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import type { AbacPolicyKey } from '../types';

// ─── Policy Definitions ─────────────────────────────────────────────────────
// Each policy specifies:
//   - table: the profile table to query (static whitelist — no dynamic SQL)
//   - checks: SQL conditions + human-readable failure messages

interface AttributeCheck {
    /** SQL column expression to check (e.g. "insurance_expiry") */
    column: string;
    /** SQL condition fragment — $1 is always user_id */
    condition: string;
    /** Human-readable failure description (English) */
    failureEn: string;
    /** Human-readable failure description (Arabic) */
    failureAr: string;
    /** Credential name for logging */
    credentialName: string;
}

interface AbacPolicy {
    table: string;
    checks: AttributeCheck[];
}

// CRIT-001: Static policy definitions — NEVER accept table/column names from user input.
// Every table and column here is hardcoded and verified against the schema.
const POLICIES: Record<AbacPolicyKey, AbacPolicy> = {

    // ── CONTRACTOR POLICIES ─────────────────────────────────────────────────
    'contractor:bid': {
        table: 'contractor_profiles',
        checks: [
            {
                column: 'verification_status',
                condition: "verification_status = 'verified'",
                failureEn: 'Profile verification required before bidding',
                failureAr: 'يجب التحقق من الملف الشخصي قبل تقديم العطاءات',
                credentialName: 'verification',
            },
            {
                column: 'insurance_expiry',
                condition: 'insurance_expiry IS NOT NULL AND insurance_expiry > CURRENT_DATE',
                failureEn: 'Valid insurance required — your insurance has expired or is missing',
                failureAr: 'تأمين ساري المفعول مطلوب — تأمينك منتهي الصلاحية أو مفقود',
                credentialName: 'insurance',
            },
            {
                column: 'commercial_license_number',
                condition: 'commercial_license_number IS NOT NULL',
                failureEn: 'Commercial license number required',
                failureAr: 'رقم الرخصة التجارية مطلوب',
                credentialName: 'commercial_license',
            },
        ],
    },

    'contractor:manage_project': {
        table: 'contractor_profiles',
        checks: [
            {
                column: 'verification_status',
                condition: "verification_status = 'verified'",
                failureEn: 'Profile verification required',
                failureAr: 'يجب التحقق من الملف الشخصي',
                credentialName: 'verification',
            },
            {
                column: 'insurance_expiry',
                condition: 'insurance_expiry IS NOT NULL AND insurance_expiry > CURRENT_DATE',
                failureEn: 'Valid insurance required for project management',
                failureAr: 'تأمين ساري المفعول مطلوب لإدارة المشاريع',
                credentialName: 'insurance',
            },
        ],
    },

    // ── ENGINEER POLICIES ───────────────────────────────────────────────────
    'engineer:assess': {
        table: 'engineer_profiles',
        checks: [
            {
                column: 'verification_status',
                condition: "verification_status = 'verified'",
                failureEn: 'Profile verification required before assessments',
                failureAr: 'يجب التحقق من الملف الشخصي قبل التقييمات',
                credentialName: 'verification',
            },
            {
                column: 'license_expiry',
                condition: 'license_expiry IS NOT NULL AND license_expiry > CURRENT_DATE',
                failureEn: 'Valid engineering license required — license has expired or is missing',
                failureAr: 'رخصة هندسية سارية مطلوبة — الرخصة منتهية أو مفقودة',
                credentialName: 'engineering_license',
            },
            {
                column: 'license_status',
                condition: "license_status = 'valid'",
                failureEn: 'Engineering license must be in valid status',
                failureAr: 'يجب أن تكون رخصة الهندسة في حالة صالحة',
                credentialName: 'engineering_license',
            },
        ],
    },

    'engineer:verify_proof': {
        table: 'engineer_profiles',
        checks: [
            {
                column: 'verification_status',
                condition: "verification_status = 'verified'",
                failureEn: 'Profile verification required for proof verification',
                failureAr: 'يجب التحقق من الملف الشخصي للتحقق من الإثباتات',
                credentialName: 'verification',
            },
            {
                column: 'license_expiry',
                condition: 'license_expiry IS NOT NULL AND license_expiry > CURRENT_DATE',
                failureEn: 'Valid engineering license required',
                failureAr: 'رخصة هندسية سارية مطلوبة',
                credentialName: 'engineering_license',
            },
        ],
    },

    // ── SUPPLIER POLICIES ───────────────────────────────────────────────────
    'supplier:fulfill_order': {
        table: 'supplier_profiles',
        checks: [
            {
                column: 'verification_status',
                condition: "verification_status = 'verified'",
                failureEn: 'Profile verification required before fulfilling orders',
                failureAr: 'يجب التحقق من الملف الشخصي قبل تنفيذ الطلبات',
                credentialName: 'verification',
            },
            {
                column: 'commercial_register_expiry',
                condition: 'commercial_register_expiry IS NOT NULL AND commercial_register_expiry > CURRENT_DATE',
                failureEn: 'Valid commercial register required — registration has expired or is missing',
                failureAr: 'سجل تجاري ساري المفعول مطلوب — السجل منتهي أو مفقود',
                credentialName: 'commercial_register',
            },
            {
                column: 'register_status',
                condition: "register_status = 'valid'",
                failureEn: 'Commercial register must be in valid status',
                failureAr: 'يجب أن يكون السجل التجاري في حالة صالحة',
                credentialName: 'commercial_register',
            },
        ],
    },

    'supplier:manage_catalog': {
        table: 'supplier_profiles',
        checks: [
            {
                column: 'verification_status',
                condition: "verification_status = 'verified'",
                failureEn: 'Profile verification required for catalog management',
                failureAr: 'يجب التحقق من الملف الشخصي لإدارة الكتالوج',
                credentialName: 'verification',
            },
        ],
    },

    // ── TRADESPERSON POLICIES ────────────────────────────────────────────────
    'tradesperson:accept_job': {
        table: 'tradesperson_profiles',
        checks: [
            {
                column: 'verification_status',
                condition: "verification_status = 'verified'",
                failureEn: 'Profile verification required before accepting jobs',
                failureAr: 'يجب التحقق من الملف الشخصي قبل قبول الأعمال',
                credentialName: 'verification',
            },
            {
                column: 'guild_expiry',
                condition: 'guild_expiry IS NOT NULL AND guild_expiry > CURRENT_DATE',
                failureEn: 'Valid guild membership required — membership has expired or is missing',
                failureAr: 'عضوية نقابة سارية مطلوبة — العضوية منتهية أو مفقودة',
                credentialName: 'guild_membership',
            },
        ],
    },

    'tradesperson:respond_assignment': {
        table: 'tradesperson_profiles',
        checks: [
            {
                column: 'verification_status',
                condition: "verification_status = 'verified'",
                failureEn: 'Profile verification required',
                failureAr: 'يجب التحقق من الملف الشخصي',
                credentialName: 'verification',
            },
        ],
    },
};

// ─── ABAC Middleware Factory ────────────────────────────────────────────────

/**
 * Creates a middleware that enforces ABAC attribute checks for a given policy.
 *
 * The middleware:
 *   1. Looks up the policy by key
 *   2. Runs a SINGLE SQL query that evaluates ALL attribute conditions
 *   3. Returns structured error with specific credential failures
 *   4. Logs ABAC denials for audit
 *
 * Usage:
 *   router.post('/bids', authMiddleware, requireActive,
 *       requireRole('contractor'),
 *       requireAttributes('contractor:bid'),
 *       handler);
 */
export function requireAttributes(policyKey: AbacPolicyKey) {
    const policy = POLICIES[policyKey];

    // Compile: pre-build the SQL query at middleware creation time (not per request)
    const selectClauses = policy.checks.map((check, i) =>
        `(${check.condition}) AS check_${i}`
    );

    // CRIT-001: The table name comes from the static POLICIES object —
    // NEVER from user input. This is safe from SQL injection.
    const sql = `SELECT ${selectClauses.join(', ')} FROM ${policy.table} WHERE user_id = $1`;

    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            if (!req.authUser) {
                res.status(401).json({ success: false, error: 'Authentication required' });
                return;
            }

            const userId = req.authUser.user_id;

            // Execute single query that checks ALL attributes at once
            const result = await query<Record<string, boolean>>(sql, [userId]);
            const row = result.rows[0];

            // No profile found — user hasn't completed profile setup
            if (!row) {
                logger.warn('ABAC denied: no profile', {
                    userId, policy: policyKey, table: policy.table,
                });
                res.status(403).json({
                    success: false,
                    error: 'Profile setup required. Please complete your profile before performing this action.',
                    error_ar: 'إعداد الملف الشخصي مطلوب. يرجى إكمال ملفك الشخصي قبل تنفيذ هذا الإجراء.',
                    code: 'ABAC_NO_PROFILE',
                });
                return;
            }

            // Evaluate each check
            const failures: Array<{ credential: string; reason: string; reason_ar: string }> = [];

            for (let i = 0; i < policy.checks.length; i++) {
                const checkResult = row[`check_${i}`];
                if (!checkResult) {
                    const check = policy.checks[i];
                    if (check) {
                        failures.push({
                            credential: check.credentialName,
                            reason: check.failureEn,
                            reason_ar: check.failureAr,
                        });
                    }
                }
            }

            if (failures.length > 0) {
                logger.warn('ABAC denied: credential check failed', {
                    userId,
                    policy: policyKey,
                    failures: failures.map(f => f.credential),
                });

                res.status(403).json({
                    success: false,
                    error: 'Credential requirements not met',
                    error_ar: 'لم يتم استيفاء متطلبات الأوراق الثبوتية',
                    code: 'ABAC_CREDENTIAL_FAILURE',
                    details: failures,
                });
                return;
            }

            // All checks passed — proceed
            next();
        } catch (error) {
            logger.error('ABAC middleware error', {
                policy: policyKey,
                error: error instanceof Error ? error.message : String(error),
            });
            res.status(500).json({ success: false, error: 'Authorization check failed' });
        }
    };
}
