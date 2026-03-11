// ============================================================================
// Nammerha — Payment Gateway Service (Visa Click-to-Pay + Fatora REST)
// Production-ready: real gateway API calls with dev-mode fallback
// ============================================================================

import crypto from 'crypto';
import pool, { transaction } from '../config/database';

// ─── Types ──────────────────────────────────────────────────────────────────
export type PaymentGateway = 'visa' | 'fatora';
export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';

export interface PaymentInitiation {
    donor_id: string;
    item_id: string;
    project_id: string;
    amount: number;       // BIGINT (integer cents)
    currency: string;     // Default: 'USD'
    gateway: PaymentGateway;
    return_url?: string;
    metadata?: Record<string, string>;
    // NMR-AUD-007: Real donor details for gateway APIs (Fatora requires email)
    donor_name?: string;
    donor_email?: string;
}

interface PaymentRecord {
    payment_id: string;
    reference: string;
    donor_id: string;
    item_id: string;
    project_id: string;
    status: PaymentStatus;
    gateway: PaymentGateway;
    amount: number;
    currency: string;
    gateway_tx_id: string | null;
    created_at: Date;
}

interface GatewayResponse {
    success: boolean;
    payment_url?: string;
    reference: string;
    gateway_tx_id?: string;
    error?: string;
}

// ─── Webhook Signature Verification ─────────────────────────────────────────
const WEBHOOK_SECRET = process.env['PAYMENT_WEBHOOK_SECRET'] ?? '';

/**
 * HMAC-SHA256 hex signature regex: exactly 64 lowercase hex characters.
 * Pre-compiled for performance — avoids regex recompilation on every webhook.
 */
const HMAC_SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;

/**
 * Verify webhook payload signature using HMAC-SHA256.
 * Returns true if signature is valid, false otherwise.
 * In development without a configured secret, logs a warning and allows through.
 *
 * CRT-NEW-001 FIX: Three-layer defense against malformed signatures:
 *   1. Regex validates signature is exactly 64 hex chars (SHA-256 output)
 *   2. Buffer length equality check before timingSafeEqual
 *   3. try/catch safety net — never throws, always returns boolean
 *
 * Without these guards, crypto.timingSafeEqual() throws on mismatched buffer
 * lengths, and Buffer.from(invalidHex, 'hex') silently produces wrong-length
 * buffers. Since the webhook endpoint is public (no auth), any external actor
 * could crash the server with a single malformed request.
 */
function verifyWebhookSignature(
    payload: string,
    signature: string | undefined,
): boolean {
    if (!WEBHOOK_SECRET) {
        if (process.env['NODE_ENV'] === 'development') {
            console.warn('[Payment] PAYMENT_WEBHOOK_SECRET not configured — skipping verification in development.');
            return true;
        }
        console.error('[Payment] PAYMENT_WEBHOOK_SECRET not configured — rejecting webhook in production.');
        return false;
    }

    if (!signature) {
        console.error('[Payment] Webhook received without signature — rejected.');
        return false;
    }

    // CRT-NEW-001 Guard 1: Validate signature format before any Buffer operations.
    // HMAC-SHA256 always produces exactly 64 hex characters (32 bytes).
    // Reject early on obviously malformed input without touching crypto APIs.
    if (!HMAC_SHA256_HEX_REGEX.test(signature)) {
        console.error('[Payment] Webhook signature is not valid HMAC-SHA256 hex (expected 64 hex chars) — rejected.');
        return false;
    }

    try {
        const expected = crypto
            .createHmac('sha256', WEBHOOK_SECRET)
            .update(payload)
            .digest('hex');

        const sigBuffer = Buffer.from(signature, 'hex');
        const expectedBuffer = Buffer.from(expected, 'hex');

        // CRT-NEW-001 Guard 2: Explicit length check before timingSafeEqual.
        // This is a defensive redundancy — the regex above guarantees 64 hex chars
        // (32 bytes) which matches SHA-256 output. But defense-in-depth mandates
        // we never rely on a single gate for crash prevention.
        if (sigBuffer.length !== expectedBuffer.length) {
            console.error(`[Payment] Webhook signature buffer length mismatch: got ${sigBuffer.length}, expected ${expectedBuffer.length} — rejected.`);
            return false;
        }

        // Constant-time comparison to prevent timing attacks.
        // Safe to call: both buffers are guaranteed to be exactly 32 bytes.
        return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    } catch (err) {
        // CRT-NEW-001 Guard 3: Final safety net.
        // If any unforeseen edge case bypasses Guards 1 & 2, we log and return
        // false instead of allowing the process to crash.
        console.error('[Payment] Webhook signature verification threw unexpectedly:', err);
        return false;
    }
}

// ─── Payment Reference Generator ────────────────────────────────────────────
// P3-001 FIX: Use crypto.randomBytes for secure, collision-resistant references
function generatePaymentRef(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `NMR-PAY-${timestamp}-${random}`;
}

// ─── Gateway Credential Configuration ───────────────────────────────────────
// P1-001 FIX: Production-ready gateway integration.
// Credentials are loaded from environment variables at module load time.
// In production: missing credentials cause a startup warning (not crash) so
// the platform can still serve non-payment endpoints.
// In development: missing credentials silently fall back to simulation mode.

interface GatewayCredentials {
    readonly apiKey: string;
    readonly merchantId: string;
    readonly baseUrl: string;
    readonly webhookUrl: string;
}

const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';

/** Visa Checkout / Visa Direct credentials */
const VISA_CONFIG: GatewayCredentials | null = (() => {
    const apiKey = process.env['VISA_API_KEY'] ?? '';
    const merchantId = process.env['VISA_MERCHANT_ID'] ?? '';
    const baseUrl = process.env['VISA_API_BASE_URL'] ?? 'https://sandbox.api.visa.com';
    const webhookUrl = process.env['PLATFORM_BASE_URL']
        ? `${process.env['PLATFORM_BASE_URL']}/api/payments/webhook`
        : '';

    if (!apiKey || !merchantId) {
        if (IS_PRODUCTION) {
            console.error('[Payment] ⛔ VISA_API_KEY or VISA_MERCHANT_ID not configured — Visa payments will be rejected in production.');
        }
        return null;
    }
    return { apiKey, merchantId, baseUrl, webhookUrl };
})();

/** Fatora payment gateway credentials */
const FATORA_CONFIG: GatewayCredentials | null = (() => {
    const apiKey = process.env['FATORA_API_KEY'] ?? '';
    const merchantId = process.env['FATORA_MERCHANT_CODE'] ?? '';
    const baseUrl = process.env['FATORA_API_BASE_URL'] ?? 'https://api.fatora.io';
    const webhookUrl = process.env['PLATFORM_BASE_URL']
        ? `${process.env['PLATFORM_BASE_URL']}/api/payments/webhook`
        : '';

    if (!apiKey || !merchantId) {
        if (IS_PRODUCTION) {
            console.error('[Payment] ⛔ FATORA_API_KEY or FATORA_MERCHANT_CODE not configured — Fatora payments will be rejected in production.');
        }
        return null;
    }
    return { apiKey, merchantId, baseUrl, webhookUrl };
})();

/** Gateway HTTP request timeout (30 seconds) */
const GATEWAY_TIMEOUT_MS = 30_000;

// ─── Visa REST API Integration ──────────────────────────────────────────────
// Visa Checkout / Visa Direct API
// Docs: https://developer.visa.com/

async function initiateVisaPayment(
    reference: string,
    amount: number,
    currency: string,
    returnUrl?: string
): Promise<GatewayResponse> {
    // Development fallback: simulate when credentials are absent
    if (!VISA_CONFIG) {
        if (IS_PRODUCTION) {
            return { success: false, reference, error: 'Visa gateway not configured. Contact administrator.' };
        }
        console.warn(`[Payment] DEV MODE: Simulating Visa payment ${reference}, amount: ${amount} ${currency}`);
        return {
            success: true,
            payment_url: `/payment/visa/checkout?ref=${reference}`,
            reference,
            gateway_tx_id: `VISA-SIM-${crypto.randomUUID()}`,
        };
    }

    // Production: Real Visa API call
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);

    try {
        const response = await fetch(`${VISA_CONFIG.baseUrl}/checkout/v1/payments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${Buffer.from(`${VISA_CONFIG.merchantId}:${VISA_CONFIG.apiKey}`).toString('base64')}`,
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                amount: (amount / 100).toFixed(2), // Convert cents → decimal for API
                currency,
                orderNumber: reference,
                callbackUrl: VISA_CONFIG.webhookUrl,
                returnUrl: returnUrl ?? `${process.env['PLATFORM_BASE_URL'] ?? ''}/payment/complete`,
                payer: { merchantCustomerId: reference },
                transaction: { description: `Nammerha Donation: ${reference}` },
            }),
            signal: controller.signal,
        });

        const body = await response.json() as Record<string, unknown>;

        if (!response.ok) {
            console.error(`[Payment] Visa API ${response.status}:`, body);
            return {
                success: false,
                reference,
                error: `Visa API error: ${response.status} — ${(body['message'] as string) ?? 'Unknown error'}`,
            };
        }

        console.warn(`[Payment] Visa payment initiated: ${reference}, tx: ${body['transactionId'] ?? 'N/A'}`);

        return {
            success: true,
            payment_url: (body['paymentUrl'] as string) ?? (body['redirectUrl'] as string) ?? undefined,
            reference,
            gateway_tx_id: (body['transactionId'] as string) ?? (body['id'] as string) ?? undefined,
        };
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            console.error(`[Payment] Visa API timeout after ${GATEWAY_TIMEOUT_MS}ms for ${reference}`);
            return { success: false, reference, error: 'Payment gateway timeout. Please try again.' };
        }
        console.error(`[Payment] Visa API network error for ${reference}:`, err);
        return { success: false, reference, error: 'Payment gateway unavailable. Please try again later.' };
    } finally {
        clearTimeout(timeout);
    }
}

// ─── Fatora REST API Integration ────────────────────────────────────────────
// Fatora Payment Gateway
// Docs: https://fatora.io/api-docs

async function initiateFatoraPayment(
    reference: string,
    amount: number,
    currency: string,
    returnUrl?: string,
    donorName?: string,
    donorEmail?: string,
): Promise<GatewayResponse> {
    // Development fallback: simulate when credentials are absent
    if (!FATORA_CONFIG) {
        if (IS_PRODUCTION) {
            return { success: false, reference, error: 'Fatora gateway not configured. Contact administrator.' };
        }
        console.warn(`[Payment] DEV MODE: Simulating Fatora payment ${reference}, amount: ${amount} ${currency}`);
        return {
            success: true,
            payment_url: `/payment/fatora/checkout?ref=${reference}`,
            reference,
            gateway_tx_id: `FTR-SIM-${crypto.randomUUID()}`,
        };
    }

    // Production: Real Fatora API call
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);

    try {
        const response = await fetch(`${FATORA_CONFIG.baseUrl}/v1/payments/checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api_key': FATORA_CONFIG.apiKey,
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                amount: (amount / 100).toFixed(2), // Convert cents → decimal for API
                currency,
                order_id: reference,
                // NMR-AUD-007 FIX: Pass real donor details instead of hardcoded empty strings.
                // Fatora API requires a valid client email for payment notifications.
                client: {
                    name: donorName ?? 'Nammerha Donor',
                    email: donorEmail ?? 'donor@nammerha.com',
                },
                success_url: returnUrl ?? `${process.env['PLATFORM_BASE_URL'] ?? ''}/payment/complete`,
                failure_url: `${process.env['PLATFORM_BASE_URL'] ?? ''}/payment/failed`,
                webhook_url: FATORA_CONFIG.webhookUrl,
                note: `Nammerha Platform Donation: ${reference}`,
            }),
            signal: controller.signal,
        });

        const body = await response.json() as Record<string, unknown>;

        if (!response.ok) {
            console.error(`[Payment] Fatora API ${response.status}:`, body);
            return {
                success: false,
                reference,
                error: `Fatora API error: ${response.status} — ${(body['message'] as string) ?? 'Unknown error'}`,
            };
        }

        console.warn(`[Payment] Fatora payment initiated: ${reference}, tx: ${body['transaction_id'] ?? 'N/A'}`);

        return {
            success: true,
            payment_url: (body['checkout_url'] as string) ?? (body['url'] as string) ?? undefined,
            reference,
            gateway_tx_id: (body['transaction_id'] as string) ?? (body['payment_id'] as string) ?? undefined,
        };
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            console.error(`[Payment] Fatora API timeout after ${GATEWAY_TIMEOUT_MS}ms for ${reference}`);
            return { success: false, reference, error: 'Payment gateway timeout. Please try again.' };
        }
        console.error(`[Payment] Fatora API network error for ${reference}:`, err);
        return { success: false, reference, error: 'Payment gateway unavailable. Please try again later.' };
    } finally {
        clearTimeout(timeout);
    }
}

// ─── Service Methods ────────────────────────────────────────────────────────

export const paymentService = {

    /**
     * Initiate a payment for a donation item.
     * Creates a payment record and calls the appropriate gateway (Visa/Fatora).
     *
     * NMR-AUD-009 FIX: Decoupled architecture to prevent DB pool starvation.
     * Previous implementation held a DB connection open for the entire duration
     * of the external gateway HTTP call (up to 30s timeout). Under concurrent
     * load (10 donors), this exhausted the pool (max 10 connections) and blocked
     * ALL database operations platform-wide.
     *
     * New flow:
     *   1. INSERT payment record as 'pending' (fast, ~5ms, no transaction needed)
     *   2. Call gateway OUTSIDE any DB transaction (up to 30s, no DB lock held)
     *   3. UPDATE record with gateway response (fast, ~5ms)
     *
     * If the gateway call fails network-side (step 2), the record stays 'pending'
     * and can be retried or expired by a background cleanup job.
     */
    async initiate(data: PaymentInitiation): Promise<PaymentRecord & { payment_url?: string }> {
        const reference = generatePaymentRef();

        // ── Step 1: Create payment record (fast DB operation, no transaction) ──
        const insertResult = await pool.query<PaymentRecord>(
            `INSERT INTO payment_transactions (
                reference, donor_id, item_id, project_id,
                amount, currency, gateway, status,
                metadata, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, NOW())
            RETURNING *`,
            [
                reference,
                data.donor_id,
                data.item_id,
                data.project_id,
                data.amount,
                data.currency || 'USD',
                data.gateway,
                JSON.stringify(data.metadata || {}),
            ]
        );

        const payment = insertResult.rows[0];
        if (!payment) {
            throw new Error('Failed to create payment record');
        }

        // ── Step 2: Call gateway OUTSIDE transaction (prevents pool starvation) ──
        let gatewayResponse: GatewayResponse;
        if (data.gateway === 'visa') {
            gatewayResponse = await initiateVisaPayment(
                reference, data.amount, data.currency || 'USD', data.return_url
            );
        } else {
            gatewayResponse = await initiateFatoraPayment(
                reference, data.amount, data.currency || 'USD', data.return_url,
                data.donor_name, data.donor_email,
            );
        }

        // ── Step 3: Update record with gateway response (fast DB operation) ──
        if (gatewayResponse.success && gatewayResponse.gateway_tx_id) {
            await pool.query(
                `UPDATE payment_transactions
                 SET gateway_tx_id = $1, status = 'processing'
                 WHERE reference = $2`,
                [gatewayResponse.gateway_tx_id, reference]
            );
        } else if (!gatewayResponse.success) {
            // Mark as failed if the gateway explicitly rejected it
            await pool.query(
                `UPDATE payment_transactions
                 SET status = 'failed', updated_at = NOW()
                 WHERE reference = $1`,
                [reference]
            );
        }

        return {
            ...payment,
            status: gatewayResponse.success ? 'processing' as PaymentStatus : 'failed' as PaymentStatus,
            gateway_tx_id: gatewayResponse.gateway_tx_id ?? null,
            payment_url: gatewayResponse.payment_url,
        };
    },

    /**
     * Verify a webhook payload signature.
     * Exposed for use in the route layer before processing.
     */
    verifySignature(payload: string, signature: string | undefined): boolean {
        return verifyWebhookSignature(payload, signature);
    },

    /**
     * Handle webhook callback from payment gateway.
     * Updates payment status and triggers donation recording if successful.
     *
     * CRITICAL (CRT-002 fix): Donation recording is done INLINE within the
     * same transaction client — NOT via createDonation() which opens its own
     * independent transaction and would cause a connection pool deadlock.
     */
    handleWebhook(data: {
        reference: string;
        gateway: PaymentGateway;
        status: 'success' | 'failure';
        gateway_tx_id: string;
    }): Promise<{ processed: boolean; payment_id?: string }> {

        return transaction(async (client) => {
            // GAP-3 FIX: Acquire a PostgreSQL advisory lock scoped to this transaction.
            // Uses hashtext(reference) to generate a deterministic int for the lock key.
            // This prevents concurrent processing of the same webhook under retry storms
            // (Fatora/Visa may fire the same webhook 3-5 times in rapid succession).
            // The lock is automatically released when the transaction commits/rolls back.
            await client.query(
                `SELECT pg_advisory_xact_lock(hashtext($1))`,
                [data.reference]
            );

            // 1. Look up payment
            const paymentResult = await client.query<PaymentRecord>(
                `SELECT * FROM payment_transactions WHERE reference = $1 AND gateway = $2`,
                [data.reference, data.gateway]
            );

            const payment = paymentResult.rows[0];
            if (!payment) {
                console.warn(`[Payment] Webhook: payment not found: ${data.reference}`);
                return { processed: false };
            }

            // 2. Idempotency: skip if already in terminal state
            if (payment.status === 'completed' || payment.status === 'failed') {
                return { processed: true, payment_id: payment.payment_id };
            }

            const newStatus: PaymentStatus = data.status === 'success' ? 'completed' : 'failed';

            // 3. Update payment status
            await client.query(
                `UPDATE payment_transactions
         SET status = $1, gateway_tx_id = $2, updated_at = NOW()
         WHERE reference = $3`,
                [newStatus, data.gateway_tx_id, data.reference]
            );

            // 4. If successful, record donation INLINE (same transaction client)
            //    Previous implementation called createDonation() which opened its
            //    own transaction → deadlock under concurrent webhook load (CRT-002).
            if (newStatus === 'completed') {
                try {
                    // 4a. Fetch BOQ item with lock to prevent over-funding
                    const boqResult = await client.query<{
                        item_id: string;
                        project_id: string;
                        unit_price: number;
                        required_quantity: number;
                        funded_amount: number;
                        status: string;
                    }>(
                        `SELECT item_id, project_id, unit_price, required_quantity, funded_amount, status
                         FROM itemized_boq WHERE item_id = $1 FOR UPDATE`,
                        [payment.item_id]
                    );

                    const boqItem = boqResult.rows[0];
                    if (!boqItem) {
                        console.error(`[Payment] BOQ item ${payment.item_id} not found during webhook processing`);
                    } else {
                        // 4b. Calculate remaining need (P2-001 FIX: integer-safe BigInt arithmetic)
                        //
                        // PLT-AUD-009 FIX: Defensive decimal-to-integer conversion.
                        // ─────────────────────────────────────────────────────────
                        // GUARANTEE: required_quantity is DECIMAL(12,2) in the DB schema
                        // (migration 001, line 258). However, as defense-in-depth, we
                        // explicitly truncate to 2 decimal places. If the schema ever
                        // changes or a computed column is added, this guard prevents
                        // silent precision loss in financial calculations.
                        //
                        // Algorithm: Convert decimal to integer-cents by multiplying
                        // by 100. e.g. 12.50 → split("12", "50") → 12*100 + 50 = 1250
                        const priceStr = String(boqItem.unit_price);
                        const qtyStr = String(boqItem.required_quantity);
                        const fundedStr = String(boqItem.funded_amount);

                        const qtyParts = qtyStr.split('.');
                        const qtyIntPart = qtyParts[0] ?? '0';
                        // Truncate decimal part to exactly 2 digits (defense-in-depth).
                        // padEnd ensures "1.5" → "50", slice(0,2) ensures "1.553" → "55".
                        const rawDecPart = qtyParts[1] ?? '';
                        const qtyDecPart = rawDecPart.padEnd(2, '0').slice(0, 2);

                        // Validate: decimal part must be purely numeric after truncation
                        if (!/^\d{2}$/.test(qtyDecPart)) {
                            console.error(`[Payment] PLT-AUD-009: Invalid quantity decimal "${qtyStr}" for BOQ ${payment.item_id}`);
                            // Fail-safe: skip escrow rather than corrupt financial data
                        } else {
                        const qtyFixed = BigInt(qtyIntPart) * 100n + BigInt(qtyDecPart);

                        const totalCost = Number((BigInt(priceStr) * qtyFixed) / 100n);
                        const remainingNeed = totalCost - Number(BigInt(fundedStr));

                        if (remainingNeed <= 0) {
                            console.warn(`[Payment] BOQ item ${payment.item_id} already fully funded, skipping escrow`);
                        } else {
                            const actualAmount = Math.min(payment.amount, remainingNeed);

                            // 4c. Create escrow entry (locked)
                            const paymentMethod = data.gateway === 'visa' ? 'visa' : 'bank_transfer';
                            await client.query(
                                `INSERT INTO escrow_ledger (
                                    donor_id, item_id, project_id, amount_locked, currency,
                                    payment_status, payment_method, payment_gateway_ref, locked_at
                                ) VALUES ($1, $2, $3, $4, 'USD', 'locked', $5, $6, NOW())`,
                                [
                                    payment.donor_id,
                                    payment.item_id,
                                    payment.project_id,
                                    actualAmount,
                                    paymentMethod,
                                    data.reference,
                                ]
                            );

                            // 4d. Check if item is now fully funded (trigger updates funded_amount)
                            const updatedBoq = await client.query<{ funded_amount: number }>(
                                'SELECT funded_amount FROM itemized_boq WHERE item_id = $1',
                                [payment.item_id]
                            );
                            const newFunded = updatedBoq.rows[0]?.funded_amount ?? 0;

                            if (newFunded >= totalCost) {
                                await client.query(
                                    "UPDATE itemized_boq SET status = 'fully_funded' WHERE item_id = $1",
                                    [payment.item_id]
                                );
                            } else if (newFunded > 0 && boqItem.status === 'verified') {
                                await client.query(
                                    "UPDATE itemized_boq SET status = 'partially_funded' WHERE item_id = $1",
                                    [payment.item_id]
                                );
                            }
                        }
                        } // PLT-AUD-009: close decimal validation else
                    }
                } catch (escrowErr) {
                    // P1-005 FIX: Record failure in audit_trail instead of silently swallowing.
                    // Payment succeeded but escrow entry creation failed — this is a critical
                    // financial discrepancy that operations MUST remediate.
                    const errorMessage = escrowErr instanceof Error ? escrowErr.message : String(escrowErr);
                    console.error(`[Payment] CRITICAL: Escrow recording failed for ${data.reference}:`, escrowErr);
                    try {
                        await client.query(
                            `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
                             VALUES ('payment_escrow_failure', 'payment_transactions', $1, NULL, $2)`,
                            [
                                payment.payment_id,
                                JSON.stringify({
                                    reference: data.reference,
                                    donor_id: payment.donor_id,
                                    item_id: payment.item_id,
                                    project_id: payment.project_id,
                                    amount: payment.amount,
                                    error: errorMessage,
                                    requires_manual_reconciliation: true,
                                }),
                            ]
                        );
                    } catch (auditErr) {
                        // Last-resort: if even the audit trail fails, log to stderr
                        console.error(`[Payment] FATAL: Audit trail write also failed for ${data.reference}:`, auditErr);
                    }
                }
            }

            return { processed: true, payment_id: payment.payment_id };
        });
    },

    /**
     * Get payment status by reference.
     */
    async getStatus(reference: string): Promise<PaymentRecord | null> {
        const result = await pool.query<PaymentRecord>(
            `SELECT * FROM payment_transactions WHERE reference = $1`,
            [reference]
        );
        return result.rows[0] ?? null;
    },

    /**
     * Get payment history for a donor.
     */
    async getDonorPayments(donorId: string): Promise<PaymentRecord[]> {
        const result = await pool.query<PaymentRecord>(
            `SELECT * FROM payment_transactions
       WHERE donor_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
            [donorId]
        );
        return result.rows;
    },
};
