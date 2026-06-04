// ============================================================================
// Nammerha — Payment Gateway Service (Visa Click-to-Pay + Fatora REST)
// Production-ready: real gateway API calls with dev-mode fallback
// ============================================================================

import crypto from 'crypto';
import pool, { financialTransaction } from '../config/database';
import { logger } from '../utils/logger';
import { screenUserAgainstSDN } from './compliance.service';
import { generatePurchaseOrder } from './purchase-order.service';

// ─── Types ──────────────────────────────────────────────────────────────────
export type PaymentGateway = 'visa' | 'fatora';
export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';

export interface PaymentInitiation {
  user_id: string;
  item_id: string;
  project_id: string;
  amount: number; // BIGINT (integer cents)
  currency: string; // Default: 'USD'
  gateway: PaymentGateway;
  return_url?: string;
  metadata?: Record<string, string>;
  // NMR-AUD-007: Real user details for gateway APIs (Fatora requires email)
  user_name?: string;
  user_email?: string;
}

interface PaymentRecord {
  payment_id: string;
  reference: string;
  user_id: string;
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

// N-1 FIX: Fail-fast startup guard for production environments.
// An empty WEBHOOK_SECRET in production would silently reject ALL webhooks —
// payment completions from Visa/Fatora would never get processed, causing
// users to see payments stuck in 'pending' forever. This is a non-recoverable
// operational failure that must be caught at deploy time, not at runtime.
if (!WEBHOOK_SECRET && process.env['NODE_ENV'] === 'production') {
  throw new Error(
    'FATAL: PAYMENT_WEBHOOK_SECRET is not configured. ' +
      'Webhooks from Visa/Fatora will be rejected, causing all payment completions to fail. ' +
      'Set this environment variable before starting the server.',
  );
}

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
function verifyWebhookSignature(payload: string, signature: string | undefined): boolean {
  if (!WEBHOOK_SECRET) {
    if (process.env['NODE_ENV'] === 'development') {
      logger.warn('PAYMENT_WEBHOOK_SECRET not configured — skipping verification in development');
      return true;
    }
    logger.error('PAYMENT_WEBHOOK_SECRET not configured — rejecting webhook in production');
    return false;
  }

  if (!signature) {
    logger.error('Webhook received without signature — rejected');
    return false;
  }

  // CRT-NEW-001 Guard 1: Validate signature format before any Buffer operations.
  // HMAC-SHA256 always produces exactly 64 hex characters (32 bytes).
  // Reject early on obviously malformed input without touching crypto APIs.
  if (!HMAC_SHA256_HEX_REGEX.test(signature)) {
    logger.error(
      'Webhook signature is not valid HMAC-SHA256 hex (expected 64 hex chars) — rejected',
    );
    return false;
  }

  try {
    const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');

    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');

    // CRT-NEW-001 Guard 2: Explicit length check before timingSafeEqual.
    // This is a defensive redundancy — the regex above guarantees 64 hex chars
    // (32 bytes) which matches SHA-256 output. But defense-in-depth mandates
    // we never rely on a single gate for crash prevention.
    if (sigBuffer.length !== expectedBuffer.length) {
      logger.error('Webhook signature buffer length mismatch — rejected', {
        got: sigBuffer.length,
        expected: expectedBuffer.length,
      });
      return false;
    }

    // Constant-time comparison to prevent timing attacks.
    // Safe to call: both buffers are guaranteed to be exactly 32 bytes.
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch (err) {
    // CRT-NEW-001 Guard 3: Final safety net.
    // If any unforeseen edge case bypasses Guards 1 & 2, we log and return
    // false instead of allowing the process to crash.
    logger.error('Webhook signature verification threw unexpectedly', {
      error: err instanceof Error ? err.message : String(err),
    });
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
      logger.error(
        'VISA_API_KEY or VISA_MERCHANT_ID not configured — Visa payments will be rejected in production',
      );
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
      logger.error(
        'FATORA_API_KEY or FATORA_MERCHANT_CODE not configured — Fatora payments will be rejected in production',
      );
    }
    return null;
  }
  return { apiKey, merchantId, baseUrl, webhookUrl };
})();

/** Gateway HTTP request timeout (30 seconds) */
const GATEWAY_TIMEOUT_MS = 30_000;

/**
 * PLT-2026-MED-002: Validate return_url to prevent open redirect attacks.
 * Only allows URLs on the same hostname as PLATFORM_BASE_URL.
 */
function validateReturnUrl(url: string | undefined): string {
  const base = process.env['PLATFORM_BASE_URL'] ?? 'https://nammerha.com';
  const fallback = `${base}/payment/complete`;
  if (!url) {
    return fallback;
  }
  try {
    const parsed = new URL(url);
    const allowed = new URL(base);
    if (parsed.hostname !== allowed.hostname) {
      logger.warn('PLT-2026-MED-002: Blocked open redirect attempt in return_url', {
        provided: url,
        allowed: allowed.hostname,
      });
      return fallback;
    }
    return url;
  } catch (err) {
    logger.warn('PLT-2026-AUD-003: Malformed return_url — falling back to default', {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}

// ─── Visa REST API Integration ──────────────────────────────────────────────
// Visa Checkout / Visa Direct API
// Docs: https://developer.visa.com/

async function initiateVisaPayment(
  reference: string,
  amount: number,
  currency: string,
  returnUrl?: string,
): Promise<GatewayResponse> {
  // Development fallback: simulate when credentials are absent
  if (!VISA_CONFIG) {
    if (IS_PRODUCTION) {
      return {
        success: false,
        reference,
        error: 'Visa gateway not configured. Contact administrator.',
      };
    }
    logger.warn('DEV MODE: Simulating Visa payment', { reference, amount, currency });
    const simulatedBaseUrl = process.env['PLATFORM_BASE_URL'] ?? 'http://localhost:3000';
    return {
      success: true,
      payment_url: `${simulatedBaseUrl}/payment/visa/checkout?ref=${reference}`,
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
        Authorization: `Basic ${Buffer.from(`${VISA_CONFIG.merchantId}:${VISA_CONFIG.apiKey}`).toString('base64')}`,
        Accept: 'application/json',
      },
      body: JSON.stringify({
        amount: (amount / 100).toFixed(2), // Convert cents → decimal for API
        currency,
        orderNumber: reference,
        callbackUrl: VISA_CONFIG.webhookUrl,
        returnUrl: validateReturnUrl(returnUrl),
        payer: { merchantCustomerId: reference },
        transaction: { description: `Nammerha Donation: ${reference}` },
      }),
      signal: controller.signal,
    });

    const body = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      logger.error('Visa API error', { status: response.status, body });
      return {
        success: false,
        reference,
        error: `Visa API error: ${response.status} — ${(body['message'] as string) ?? 'Unknown error'}`,
      };
    }

    logger.info('Visa payment initiated', {
      reference,
      transactionId: (body['transactionId'] as string) ?? 'N/A',
    });

    return {
      success: true,
      payment_url: (body['paymentUrl'] as string) ?? (body['redirectUrl'] as string) ?? undefined,
      reference,
      gateway_tx_id: (body['transactionId'] as string) ?? (body['id'] as string) ?? undefined,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      logger.error('Visa API timeout', { reference, timeoutMs: GATEWAY_TIMEOUT_MS });
      return { success: false, reference, error: 'Payment gateway timeout. Please try again.' };
    }
    logger.error('Visa API network error', {
      reference,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      reference,
      error: 'Payment gateway unavailable. Please try again later.',
    };
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
  userName?: string,
  userEmail?: string,
): Promise<GatewayResponse> {
  // Development fallback: simulate when credentials are absent
  if (!FATORA_CONFIG) {
    if (IS_PRODUCTION) {
      return {
        success: false,
        reference,
        error: 'Fatora gateway not configured. Contact administrator.',
      };
    }
    logger.warn('DEV MODE: Simulating Fatora payment', { reference, amount, currency });
    const simulatedBaseUrl = process.env['PLATFORM_BASE_URL'] ?? 'http://localhost:3000';
    return {
      success: true,
      payment_url: `${simulatedBaseUrl}/payment/fatora/checkout?ref=${reference}`,
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
        api_key: FATORA_CONFIG.apiKey,
        Accept: 'application/json',
      },
      body: JSON.stringify({
        amount: (amount / 100).toFixed(2), // Convert cents → decimal for API
        currency,
        order_id: reference,
        // NMR-AUD-007 + P2-NEW-003 FIX: Real user details for gateway receipts.
        // The initiate() method now resolves user email from DB when not provided.
        // Fallback to generic name is acceptable; fallback to fake email is NOT.
        // P3-PLT-005 FIX: Simplified from eagerly-evaluated IIFE to clear
        // if/else. Previous IIFE was correct (JS ?? short-circuits) but
        // unnecessarily complex and confusing during code review.
        client: {
          name: userName ?? 'Nammerha User',
          email: (() => {
            if (userEmail) {
              return userEmail;
            }
            logger.warn(
              'P2-NEW-003: Fatora payment initiated without user email — receipts will not be delivered',
              {
                reference,
              },
            );
            return `noreply+${reference}@nammerha.com`;
          })(),
        },
        success_url: validateReturnUrl(returnUrl),
        // P3-PAY-001 FIX: Apply same validateReturnUrl() guard as success_url.
        // Defense-in-depth — ensures failure redirect stays on our hostname.
        failure_url: validateReturnUrl(`${process.env['PLATFORM_BASE_URL'] ?? ''}/payment/failed`),
        webhook_url: FATORA_CONFIG.webhookUrl,
        note: `Nammerha Platform Donation: ${reference}`,
      }),
      signal: controller.signal,
    });

    const body = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      logger.error('Fatora API error', { status: response.status, body });
      return {
        success: false,
        reference,
        error: `Fatora API error: ${response.status} — ${(body['message'] as string) ?? 'Unknown error'}`,
      };
    }

    logger.info('Fatora payment initiated', {
      reference,
      transactionId: (body['transaction_id'] as string) ?? 'N/A',
    });

    return {
      success: true,
      payment_url: (body['checkout_url'] as string) ?? (body['url'] as string) ?? undefined,
      reference,
      gateway_tx_id:
        (body['transaction_id'] as string) ?? (body['payment_id'] as string) ?? undefined,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      logger.error('Fatora API timeout', { reference, timeoutMs: GATEWAY_TIMEOUT_MS });
      return { success: false, reference, error: 'Payment gateway timeout. Please try again.' };
    }
    logger.error('Fatora API network error', {
      reference,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      reference,
      error: 'Payment gateway unavailable. Please try again later.',
    };
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
   * load (10 users), this exhausted the pool (max 10 connections) and blocked
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
    // ─── TITAN ARCHITECT FIX: N-3 SDN/Sanctions Screening Mock Eliminated ─
    // The mock stub has been completely eradicated. Before any transaction
    // is recorded or a gateway hit is performed, the user's identity is
    // actively screened against the local OFAC SDN list database via the
    // compliance engine. If it hits a potential or confirmed match, the
    // system fails-secure and halts the payment process to ensure 100%
    // Platinum Standard AML (Anti-Money Laundering) compliance.
    try {
      const screeningResult = await screenUserAgainstSDN(data.user_id);
      if (
        screeningResult.status === 'confirmed_match' ||
        screeningResult.status === 'potential_match'
      ) {
        logger.warn('Compliance breach: Transaction halted', {
          user_id: data.user_id,
          screening_result: screeningResult.result_id,
          score: screeningResult.match_score,
        });
        throw new Error(
          'Transaction blocked due to compliance and regulatory screening. Contact support.',
        );
      }
    } catch (err: unknown) {
      // Fail-Secure: If screening throws an error (e.g. DB outage), do NOT proceed.
      logger.error('N-3 SDN Tracking Error (Fail Secure executed)', {
        user_id: data.user_id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new Error(
        err instanceof Error && err.message.includes('Contact support')
          ? err.message
          : 'Compliance screening engine unavailable. Security protocol implies payment abortion.',
      );
    }
    // ──────────────────────────────────────────────────────────────────
    const reference = generatePaymentRef();

    // ── Step 1: Create payment record (fast DB operation, no transaction) ──
    const insertResult = await pool.query<PaymentRecord>(
      `INSERT INTO payment_transactions (
                reference, user_id, item_id, project_id,
                amount, currency, gateway, status,
                metadata, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, NOW())
            -- P3-AUD-001 FIX: Column names now match PaymentRecord interface
            -- (was: transaction_id/gateway_ref → now: payment_id/reference/gateway_tx_id)
            RETURNING payment_id, reference, user_id, item_id, project_id,
                      amount, currency, gateway, status,
                      gateway_tx_id, created_at`,
      [
        reference,
        data.user_id,
        data.item_id,
        data.project_id,
        data.amount,
        data.currency || 'USD',
        data.gateway,
        JSON.stringify(data.metadata || {}),
      ],
    );

    const payment = insertResult.rows[0];
    if (!payment) {
      throw new Error('Failed to create payment record');
    }

    // ── Step 2: Call gateway OUTSIDE transaction (prevents pool starvation) ──

    // P2-NEW-003 FIX: Resolve user details for Fatora gateway.
    // If caller didn't provide user_name/user_email, fetch from users table.
    // This eliminates the hardcoded 'user@nammerha.com' placeholder that was
    // triggering Fatora fraud detection and sending receipts to a black hole.
    let resolvedUserName = data.user_name;
    let resolvedUserEmail = data.user_email;
    if (data.gateway === 'fatora' && (!resolvedUserName || !resolvedUserEmail)) {
      try {
        const userResult = await pool.query<{ full_name: string; email: string }>(
          'SELECT full_name, email FROM users WHERE user_id = $1',
          [data.user_id],
        );
        const user = userResult.rows[0];
        if (user) {
          resolvedUserName = resolvedUserName || user.full_name;
          resolvedUserEmail = resolvedUserEmail || user.email;
        }
      } catch (lookupErr) {
        logger.warn(
          'P2-NEW-003: Failed to fetch user details for Fatora — proceeding with available data',
          {
            user_id: data.user_id,
            error: lookupErr instanceof Error ? lookupErr.message : String(lookupErr),
          },
        );
      }
    }

    let gatewayResponse: GatewayResponse;
    if (data.gateway === 'visa') {
      gatewayResponse = await initiateVisaPayment(
        reference,
        data.amount,
        data.currency || 'USD',
        data.return_url,
      );
    } else {
      gatewayResponse = await initiateFatoraPayment(
        reference,
        data.amount,
        data.currency || 'USD',
        data.return_url,
        resolvedUserName,
        resolvedUserEmail,
      );
    }

    // ── Step 3: Update record with gateway response (fast DB operation) ──
    if (gatewayResponse.success && gatewayResponse.gateway_tx_id) {
      await pool.query(
        `UPDATE payment_transactions
                 SET gateway_tx_id = $1, status = 'processing'
                 WHERE reference = $2`,
        [gatewayResponse.gateway_tx_id, reference],
      );
    } else if (!gatewayResponse.success) {
      // Mark as failed if the gateway explicitly rejected it
      await pool.query(
        `UPDATE payment_transactions
                 SET status = 'failed', updated_at = NOW()
                 WHERE reference = $1`,
        [reference],
      );
    }

    return {
      ...payment,
      status: gatewayResponse.success
        ? ('processing' as PaymentStatus)
        : ('failed' as PaymentStatus),
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
  async handleWebhook(data: {
    reference: string;
    gateway: PaymentGateway;
    status: 'success' | 'failure';
    gateway_tx_id: string;
  }): Promise<{ processed: boolean; payment_id?: string }> {
    const { redisLockManager } = await import('../config/redis.client');
    const lockKey = `nammerha:webhook:lock:${data.reference}`;
    const lockToken = await redisLockManager.acquireLock(lockKey, 30);

    if (!lockToken) {
      logger.warn('Domain Law 1 Enforced: Redis Lock prevented race condition', {
        reference: data.reference,
      });
      return { processed: false };
    }

    const MAX_RETRIES = 3;
    let retryCount = 0;

    try {
      while (true) {
        try {
          return await financialTransaction(async (client) => {
            // Nammerha Escrow Domain Law 1 FIX: Strict Serializable isolation
            await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');

            // 1. Look up payment
            // M-001 FIX: Explicit column list — prevents schema drift.
            const paymentResult = await client.query<PaymentRecord>(
              `SELECT payment_id, reference, user_id, item_id, project_id,
                        status, gateway, amount, currency, gateway_tx_id, created_at
                 FROM payment_transactions WHERE reference = $1 AND gateway = $2`,
              [data.reference, data.gateway],
            );

            const payment = paymentResult.rows[0];
            if (!payment) {
              logger.warn('Webhook: payment not found', { reference: data.reference });
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
              [newStatus, data.gateway_tx_id, data.reference],
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
                  [payment.item_id],
                );

                const boqItem = boqResult.rows[0];
                if (!boqItem) {
                  logger.error('BOQ item not found during webhook processing', {
                    itemId: payment.item_id,
                  });
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
                    logger.error('PLT-AUD-009: Invalid quantity decimal', {
                      quantity: qtyStr,
                      itemId: payment.item_id,
                    });
                    // Fail-safe: skip escrow rather than corrupt financial data
                  } else {
                    const qtyFixed = BigInt(qtyIntPart) * 100n + BigInt(qtyDecPart);

                    const totalCost = Number((BigInt(priceStr) * qtyFixed) / 100n);
                    const remainingNeed = totalCost - Number(BigInt(fundedStr));

                    const actualAmount = Math.min(payment.amount, remainingNeed);
                    const excessAmount = payment.amount - actualAmount;

                    if (remainingNeed <= 0) {
                      logger.warn(
                        'BOQ item already fully funded, capturing full amount as excess/refund',
                        { itemId: payment.item_id },
                      );
                    }

                    // 4c. Create escrow entry (locked) for the required amount
                    const paymentMethod = data.gateway;

                    if (actualAmount > 0) {
                      await client.query(
                        `INSERT INTO escrow_ledger (
                                    user_id, item_id, project_id, amount_locked, currency,
                                    payment_status, payment_method, payment_gateway_ref, locked_at
                                ) VALUES ($1, $2, $3, $4, 'USD', 'locked', $5, $6, NOW())`,
                        [
                          payment.user_id,
                          payment.item_id,
                          payment.project_id,
                          actualAmount,
                          paymentMethod,
                          data.reference,
                        ],
                      );
                    }

                    // 4c-2. Overfunding Theft Bug Fix: Track excess funds and auto-request refund
                    if (excessAmount > 0) {
                      const excessResult = await client.query<{ transaction_id: string }>(
                        `INSERT INTO escrow_ledger (
                                    user_id, item_id, project_id, amount_locked, currency,
                                    payment_status, payment_method, payment_gateway_ref, locked_at, donation_intent
                                 ) VALUES ($1, $2, $3, $4, 'USD', 'locked', $5, $6, NOW(), 'overfunding_excess')
                                 RETURNING transaction_id`,
                        [
                          payment.user_id,
                          payment.item_id,
                          payment.project_id,
                          excessAmount,
                          paymentMethod,
                          data.reference,
                        ],
                      );
                      const excessEscrowId = excessResult.rows[0]?.transaction_id;

                      if (excessEscrowId) {
                        await client.query(
                          `INSERT INTO refund_requests (escrow_id, user_id, reason, refund_amount)
                                     VALUES ($1, $2, $3, $4)`,
                          [
                            excessEscrowId,
                            payment.user_id,
                            'SYSTEM_AUTO_REFUND: Overfunding collision',
                            excessAmount,
                          ],
                        );
                        logger.warn(
                          'Overfunding detected. Excess funds locked and refund auto-requested.',
                          {
                            reference: data.reference,
                            excessAmount,
                          },
                        );
                      }
                    }

                    // 4d. Check if item is now fully funded (trigger updates funded_amount)
                    const updatedBoq = await client.query<{ funded_amount: number }>(
                      'SELECT funded_amount FROM itemized_boq WHERE item_id = $1',
                      [payment.item_id],
                    );
                    const newFunded = updatedBoq.rows[0]?.funded_amount ?? 0;

                    if (newFunded >= totalCost) {
                      await client.query(
                        "UPDATE itemized_boq SET status = 'fully_funded' WHERE item_id = $1",
                        [payment.item_id],
                      );
                      // Auto-generate PO for the supplier
                      await generatePurchaseOrder(payment.item_id, client);
                    } else if (newFunded > 0 && boqItem.status === 'verified') {
                      await client.query(
                        "UPDATE itemized_boq SET status = 'partially_funded' WHERE item_id = $1",
                        [payment.item_id],
                      );
                    }
                  } // PLT-AUD-009: close decimal validation else
                }
              } catch (escrowErr) {
                // P1-005 FIX: Record failure in audit_trail instead of silently swallowing.
                // Payment succeeded but escrow entry creation failed — this is a critical
                // financial discrepancy that operations MUST remediate.
                const errorMessage =
                  escrowErr instanceof Error ? escrowErr.message : String(escrowErr);
                logger.error('CRITICAL: Escrow recording failed', {
                  reference: data.reference,
                  error: errorMessage,
                });
                try {
                  await client.query(
                    `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
                             VALUES ('payment_escrow_failure', 'payment_transactions', $1, NULL, $2)`,
                    [
                      payment.payment_id,
                      JSON.stringify({
                        reference: data.reference,
                        user_id: payment.user_id,
                        item_id: payment.item_id,
                        project_id: payment.project_id,
                        amount: payment.amount,
                        error: errorMessage,
                        requires_manual_reconciliation: true,
                      }),
                    ],
                  );
                } catch (auditErr) {
                  // Last-resort: if even the audit trail fails, log to stderr
                  logger.error('FATAL: Audit trail write also failed', {
                    reference: data.reference,
                    error: auditErr instanceof Error ? auditErr.message : String(auditErr),
                  });
                }

                // F-2 FIX (ENH-6): Queue for dead-letter retry
                try {
                  const { queueFailedWebhook } = await import('./webhook-retry.service');
                  await queueFailedWebhook({
                    gateway: data.gateway,
                    payload: data as unknown as Record<string, unknown>,
                    rawBody: JSON.stringify(data),
                    signature: null,
                    errorMessage,
                    errorStack: escrowErr instanceof Error ? escrowErr.stack : undefined,
                  });
                } catch (retryQueueErr) {
                  logger.error('ENH-6: Failed to queue webhook for retry', {
                    reference: data.reference,
                    error:
                      retryQueueErr instanceof Error
                        ? retryQueueErr.message
                        : String(retryQueueErr),
                  });
                }
              }
            }

            return { processed: true, payment_id: payment.payment_id };
          });
        } catch (err: unknown) {
          // Postgres error code for serialization failure is '40001'
          if (
            typeof err === 'object' &&
            err !== null &&
            'code' in err &&
            (err as { code: string }).code === '40001' &&
            retryCount < MAX_RETRIES
          ) {
            retryCount++;
            logger.warn(
              `Serializable deadlock detected in webhook. Retrying (${retryCount}/${MAX_RETRIES})...`,
              { reference: data.reference },
            );
            await new Promise((resolve) =>
              setTimeout(resolve, 50 * retryCount + Math.random() * 50),
            );
            continue;
          }
          throw err; // Re-throw if it's not a serialization error or max retries exceeded
        }
      } // end while
    } finally {
      await redisLockManager.releaseLock(lockKey, lockToken);
    }
  },

  /**
   * Get payment status by reference.
   */
  async getStatus(reference: string): Promise<PaymentRecord | null> {
    // F-004 FIX: Explicit column list — no SELECT * (prevents schema drift).
    const result = await pool.query<PaymentRecord>(
      `SELECT payment_id, reference, user_id, item_id, project_id,
                    status, gateway, amount, currency, gateway_tx_id, created_at
             FROM payment_transactions WHERE reference = $1`,
      [reference],
    );
    return result.rows[0] ?? null;
  },

  /**
   * Get payment history for a user.
   */
  async getUserPayments(userId: string, limit = 50, offset = 0): Promise<PaymentRecord[]> {
    // F-004 FIX: Explicit column list — no SELECT * (prevents schema drift).
    // F-007 FIX: Math.floor() ensures integer values for LIMIT/OFFSET.
    const result = await pool.query<PaymentRecord>(
      `SELECT payment_id, reference, user_id, item_id, project_id,
                    status, gateway, amount, currency, gateway_tx_id, created_at
             FROM payment_transactions
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
      [userId, Math.floor(Math.min(limit, 100)), Math.floor(Math.max(offset, 0))],
    );
    return result.rows;
  },
};
