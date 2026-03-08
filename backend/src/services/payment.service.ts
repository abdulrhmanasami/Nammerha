// ============================================================================
// Nammerha — Payment Gateway Service (Visa + Fatora Stubs)
// MVP Phase: Integration stubs with webhook handling
// ============================================================================

import pool, { transaction } from '../config/database';
import { createDonation } from './crowdfunding.service';

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
}

interface PaymentRecord {
    payment_id: string;
    reference: string;
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

// ─── Payment Reference Generator ────────────────────────────────────────────
function generatePaymentRef(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `NMR-PAY-${timestamp}-${random}`;
}

// ─── Visa REST API Stub ─────────────────────────────────────────────────────
// In production: Replace with Visa Checkout / Visa Direct API integration
// Docs: https://developer.visa.com/

async function initiateVisaPayment(
    reference: string,
    amount: number,
    currency: string,
    _returnUrl?: string
): Promise<GatewayResponse> {
    // TODO-PRODUCTION: Implement real Visa API call
    // 1. Create payment session via Visa Checkout API
    // 2. Generate payment_url for cardholder redirect
    // 3. Tokenize card data (PCI DSS compliant)
    //
    // For MVP, we simulate a successful initiation:
    const simulatedTxId = `VISA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(`[Payment] Visa payment initiated: ${reference}, amount: ${amount} ${currency}`);

    return {
        success: true,
        payment_url: `/payment/visa/checkout?ref=${reference}`,
        reference,
        gateway_tx_id: simulatedTxId,
    };
}

// ─── Fatora REST API Stub ───────────────────────────────────────────────────
// In production: Replace with Fatora API integration
// Docs: https://fatora.io/api-docs

async function initiateFatoraPayment(
    reference: string,
    amount: number,
    currency: string,
    _returnUrl?: string
): Promise<GatewayResponse> {
    // TODO-PRODUCTION: Implement real Fatora API call
    // 1. POST /api/v1/payments/checkout
    // 2. Include merchant credentials from environment
    // 3. Handle webhook callback URL
    //
    // For MVP, we simulate a successful initiation:
    const simulatedTxId = `FTR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(`[Payment] Fatora payment initiated: ${reference}, amount: ${amount} ${currency}`);

    return {
        success: true,
        payment_url: `/payment/fatora/checkout?ref=${reference}`,
        reference,
        gateway_tx_id: simulatedTxId,
    };
}

// ─── Service Methods ────────────────────────────────────────────────────────

export const paymentService = {

    /**
     * Initiate a payment for a donation item.
     * Creates a payment record and calls the appropriate gateway stub.
     */
    async initiate(data: PaymentInitiation): Promise<PaymentRecord & { payment_url?: string }> {
        const reference = generatePaymentRef();

        return await transaction(async (client) => {
            // 1. Insert payment record
            const insertResult = await client.query<PaymentRecord>(
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

            // 2. Call gateway
            let gatewayResponse: GatewayResponse;
            if (data.gateway === 'visa') {
                gatewayResponse = await initiateVisaPayment(
                    reference, data.amount, data.currency || 'USD', data.return_url
                );
            } else {
                gatewayResponse = await initiateFatoraPayment(
                    reference, data.amount, data.currency || 'USD', data.return_url
                );
            }

            // 3. Update payment with gateway response
            if (gatewayResponse.success && gatewayResponse.gateway_tx_id) {
                await client.query(
                    `UPDATE payment_transactions
           SET gateway_tx_id = $1, status = 'processing'
           WHERE reference = $2`,
                    [gatewayResponse.gateway_tx_id, reference]
                );
            }

            return {
                ...payment,
                status: 'processing' as PaymentStatus,
                gateway_tx_id: gatewayResponse.gateway_tx_id ?? null,
                payment_url: gatewayResponse.payment_url,
            };
        });
    },

    /**
     * Handle webhook callback from payment gateway.
     * Updates payment status and triggers donation recording if successful.
     */
    async handleWebhook(data: {
        reference: string;
        gateway: PaymentGateway;
        status: 'success' | 'failure';
        gateway_tx_id: string;
        signature?: string;
    }): Promise<{ processed: boolean; payment_id?: string }> {

        // TODO-PRODUCTION: Verify webhook signature
        // Visa: Verify X-Pay-Token header with shared secret
        // Fatora: Verify HMAC-SHA256 signature
        if (data.signature) {
            console.log(`[Payment] Webhook signature received: ${data.signature.substring(0, 12)}...`);
        }

        return await transaction(async (client) => {
            // Look up payment
            const paymentResult = await client.query<PaymentRecord>(
                `SELECT * FROM payment_transactions WHERE reference = $1 AND gateway = $2`,
                [data.reference, data.gateway]
            );

            const payment = paymentResult.rows[0];
            if (!payment) {
                console.warn(`[Payment] Webhook: payment not found: ${data.reference}`);
                return { processed: false };
            }

            // Idempotency: skip if already in terminal state
            if (payment.status === 'completed' || payment.status === 'failed') {
                console.log(`[Payment] Webhook: payment already ${payment.status}: ${data.reference}`);
                return { processed: true, payment_id: payment.payment_id };
            }

            const newStatus: PaymentStatus = data.status === 'success' ? 'completed' : 'failed';

            // Update payment status
            await client.query(
                `UPDATE payment_transactions
         SET status = $1, gateway_tx_id = $2, updated_at = NOW()
         WHERE reference = $3`,
                [newStatus, data.gateway_tx_id, data.reference]
            );

            // If successful, trigger the donation recording
            // (This connects to the crowdfunding.service.ts donate flow)
            if (newStatus === 'completed') {
                // Wire the donation recording into the escrow ledger.
                // Fetch payment details to get donor_id, item_id, project_id.
                const paymentDetails = await client.query<{
                    donor_id: string;
                    item_id: string;
                    project_id: string;
                    amount: number;
                }>(
                    `SELECT donor_id, item_id, project_id, amount
                     FROM payment_transactions WHERE reference = $1`,
                    [data.reference]
                );
                const pd = paymentDetails.rows[0];
                if (pd) {
                    try {
                        await createDonation(pd.donor_id, {
                            items: [{ item_id: pd.item_id, amount: pd.amount }],
                            payment_method: data.gateway === 'visa' ? 'visa' : 'bank_transfer',
                        });
                        console.log(`[Payment] Donation recorded for ${data.reference}: item=${pd.item_id}, amount=${pd.amount}`);
                    } catch (donationErr) {
                        // Log but do not fail the webhook — payment is already recorded
                        console.error(`[Payment] Donation recording failed for ${data.reference}:`, donationErr);
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
