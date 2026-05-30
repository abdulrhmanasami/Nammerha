// ============================================================================
// Nammerha Backend — Contract Payment Service
// ============================================================================
// Business logic for service contracts, milestones, and payments.
//
// Security:
//   - All monetary mutations use financialTransaction (SERIALIZABLE isolation)
//   - Anti-self-dealing enforced at DB level (CHECK constraint) + service level
//   - Idempotency via idempotency_key on all payment creation
//   - Dual-party confirmation for Cash/Bank Transfer payments
//
// Standard: Nammerha Domain Law §1 (Zero-Trust Financial Operations)
// ============================================================================

import { query, financialTransaction } from '../config/database';
import { logger } from '../utils/logger';
import type { PoolClient } from 'pg';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ContractRow {
    contract_id: string;
    project_id: string;
    homeowner_id: string;
    provider_id: string;
    provider_type: string;
    total_agreed_amount: string; // BIGINT cents — pg returns as string (MEMO 53)
    bid_id: string | null;
    notes: string | null;
    status: string;
    currency: string;
    created_at: Date;
    updated_at: Date;
    project_title?: string;
    homeowner_name?: string;
    provider_name?: string;
    total_paid?: string;
    milestone_count?: number;
    completed_milestones?: number;
}

interface MilestoneRow {
    milestone_id: string;
    contract_id: string;
    title: string;
    description: string | null;
    milestone_order: number;
    amount: string; // BIGINT cents — pg returns as string (MEMO 53)
    percentage: number;
    status: string;
    completed_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

interface PaymentRow {
    payment_id: string;
    contract_id: string;
    payer_id: string;
    payee_id: string;
    milestone_id: string | null;
    amount: string; // BIGINT cents — pg returns as string (MEMO 53)
    currency: string;
    payment_method: string;
    status: string;
    idempotency_key: string;
    confirmation_note: string | null;
    transfer_receipt_url: string | null;
    confirmed_by_payer: boolean;
    confirmed_by_payee: boolean;
    gateway_ref: string | null;
    payer_confirmed_at: Date | null;
    payee_confirmed_at: Date | null;
    completed_at: Date | null;
    created_at: Date;
    updated_at: Date;
    payer_name?: string;
    payee_name?: string;
}

interface ContractWithDetails extends ContractRow {
    milestones: MilestoneRow[];
    payments: PaymentRow[];
}

interface CreateContractInput {
    project_id: string;
    provider_id: string;
    provider_type: 'contractor' | 'engineer' | 'tradesperson' | 'supplier';
    total_agreed_amount: number;
    bid_id?: string;
    notes?: string;
    milestones?: Array<{
        title: string;
        description?: string;
        milestone_order: number;
        amount: number;
        percentage: number;
    }>;
}

interface CreatePaymentInput {
    amount: number;
    payment_method: 'fatora' | 'cash' | 'bank_transfer';
    milestone_id?: string;
    confirmation_note?: string;
    transfer_receipt_url?: string;
}

const MAX_CONTRACTS_LIMIT = 100;

// ─── Contracts ──────────────────────────────────────────────────────────────

/**
 * Get all contracts where user is either homeowner or provider.
 */
export async function getMyContracts(
    userId: string,
    status?: string,
    limit = 20,
    offset = 0,
): Promise<ContractRow[]> {
    const clampedLimit = Math.min(limit, MAX_CONTRACTS_LIMIT);
    const clampedOffset = Math.max(offset, 0);

    let sql = `
        SELECT
            sc.contract_id, sc.project_id, sc.homeowner_id, sc.provider_id,
            sc.provider_type, sc.total_agreed_amount, sc.bid_id, sc.notes,
            sc.status, sc.created_at, sc.updated_at,
            p.title AS project_title,
            ho.full_name AS homeowner_name,
            pv.full_name AS provider_name,
            COALESCE(
                (SELECT SUM(cp.amount) FROM contract_payments cp
                 WHERE cp.contract_id = sc.contract_id AND cp.status = 'completed'),
                0
            )::bigint AS total_paid,
            (SELECT COUNT(*)::int FROM contract_milestones cm
             WHERE cm.contract_id = sc.contract_id) AS milestone_count,
            (SELECT COUNT(*)::int FROM contract_milestones cm
             WHERE cm.contract_id = sc.contract_id AND cm.status = 'completed') AS completed_milestones
        FROM service_contracts sc
        LEFT JOIN projects p ON p.project_id = sc.project_id
        LEFT JOIN users ho ON ho.user_id = sc.homeowner_id
        LEFT JOIN users pv ON pv.user_id = sc.provider_id
        WHERE (sc.homeowner_id = $1 OR sc.provider_id = $1)
    `;
    const params: unknown[] = [userId];
    let paramIdx = 2;

    if (status) {
        sql += ` AND sc.status = $${paramIdx}`;
        params.push(status);
        paramIdx++;
    }

    sql += ` ORDER BY sc.updated_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(clampedLimit, clampedOffset);

    const result = await query<ContractRow>(sql, params);
    return result.rows.map((row) => ({
        ...row,
        total_paid: String(Number(row.total_paid ?? '0')),
        total_agreed_amount: String(Number(row.total_agreed_amount))
    }));
}

/**
 * Get full contract details including milestones and payments.
 */
export async function getContractDetails(
    contractId: string,
    userId: string,
): Promise<ContractWithDetails> {
    // Verify user has access (is homeowner or provider)
    const contractResult = await query<ContractRow>(
        `SELECT
            sc.contract_id, sc.project_id, sc.homeowner_id, sc.provider_id,
            sc.provider_type, sc.total_agreed_amount, sc.bid_id, sc.notes,
            sc.status, sc.created_at, sc.updated_at,
            p.title AS project_title,
            ho.full_name AS homeowner_name,
            pv.full_name AS provider_name
        FROM service_contracts sc
        LEFT JOIN projects p ON p.project_id = sc.project_id
        LEFT JOIN users ho ON ho.user_id = sc.homeowner_id
        LEFT JOIN users pv ON pv.user_id = sc.provider_id
        WHERE sc.contract_id = $1
            AND (sc.homeowner_id = $2 OR sc.provider_id = $2)`,
        [contractId, userId],
    );

    if (contractResult.rows.length === 0) {
        throw new Error('Contract not found or access denied');
    }

    const contract = contractResult.rows[0];
    if (!contract) {
        throw new Error('Contract not found or access denied');
    }

    // Load milestones
    const milestonesResult = await query<MilestoneRow>(
        `SELECT milestone_id, contract_id, title, description, milestone_order,
                amount, percentage, status, completed_at, created_at, updated_at
         FROM contract_milestones
         WHERE contract_id = $1
         ORDER BY milestone_order ASC`,
        [contractId],
    );

    // Load payments
    const paymentsResult = await query<PaymentRow>(
        `SELECT
            cp.payment_id, cp.contract_id, cp.payer_id, cp.payee_id,
            cp.milestone_id, cp.amount, cp.currency, cp.payment_method,
            cp.status, cp.idempotency_key, cp.confirmation_note,
            cp.transfer_receipt_url, cp.confirmed_by_payer, cp.confirmed_by_payee,
            cp.gateway_ref, cp.payer_confirmed_at, cp.payee_confirmed_at,
            cp.completed_at, cp.created_at, cp.updated_at,
            payer.full_name AS payer_name,
            payee.full_name AS payee_name
        FROM contract_payments cp
        LEFT JOIN users payer ON payer.user_id = cp.payer_id
        LEFT JOIN users payee ON payee.user_id = cp.payee_id
        WHERE cp.contract_id = $1
        ORDER BY cp.created_at DESC`,
        [contractId],
    );

    return {
        ...contract,
        milestones: milestonesResult.rows,
        payments: paymentsResult.rows,
    } as ContractWithDetails;
}

/**
 * Create a new service contract with optional milestones.
 * Uses financialTransaction for atomicity.
 */
export async function createContract(
    homeownerId: string,
    input: CreateContractInput,
): Promise<ContractWithDetails> {
    // Anti-self-dealing: homeowner cannot be their own provider
    if (homeownerId === input.provider_id) {
        throw new Error('Cannot create a contract with yourself as provider');
    }

    return financialTransaction(async (client: PoolClient) => {
        // Create contract
        const contractResult = await client.query<ContractRow>(
            `INSERT INTO service_contracts
                (project_id, homeowner_id, provider_id, provider_type,
                 total_agreed_amount, bid_id, notes, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
            RETURNING contract_id, project_id, homeowner_id, provider_id, provider_type,
                      total_agreed_amount, bid_id, notes, status, created_at, updated_at`,
            [
                input.project_id,
                homeownerId,
                input.provider_id,
                input.provider_type,
                input.total_agreed_amount,
                input.bid_id ?? null,
                input.notes ?? null,
            ],
        );

        const contract = contractResult.rows[0];
        if (!contract) {
            throw new Error('Failed to create contract');
        }

        // Create milestones if provided
        if (input.milestones && input.milestones.length > 0) {
            // Validate: milestone amounts must sum to total_agreed_amount
            // MEMO 53 FIX: Explicit Number() cast to prevent String Concatenation Trap
            const milestoneSum = input.milestones.reduce((s, m) => s + Number(m.amount), 0);
            if (milestoneSum !== Number(input.total_agreed_amount)) {
                throw new Error(
                    `Milestone amounts (${milestoneSum}) must equal total contract amount (${input.total_agreed_amount})`,
                );
            }

            for (const m of input.milestones) {
                await client.query(
                    `INSERT INTO contract_milestones
                        (contract_id, title, description, milestone_order, amount, percentage)
                    VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        contract.contract_id,
                        m.title,
                        m.description ?? null,
                        m.milestone_order,
                        m.amount,
                        m.percentage,
                    ],
                );
            }
        }

        logger.info('Contract created', {
            contractId: contract.contract_id,
            homeowner: homeownerId,
            provider: input.provider_id,
            providerType: input.provider_type,
            amount: input.total_agreed_amount,
            milestones: input.milestones?.length ?? 0,
        });

        // Return full contract with milestones
        const milestonesResult = await client.query<MilestoneRow>(
            `SELECT milestone_id, contract_id, title, description, milestone_order,
                    amount, percentage, status, completed_at, created_at, updated_at
             FROM contract_milestones
             WHERE contract_id = $1 ORDER BY milestone_order ASC`,
            [contract.contract_id],
        );

        return {
            ...contract,
            milestones: milestonesResult.rows,
            payments: [],
        } as ContractWithDetails;
    });
}

// ─── Milestones ─────────────────────────────────────────────────────────────

/**
 * Get milestones for a contract (public for contract participants).
 */
export async function getMilestones(
    contractId: string,
    userId: string,
): Promise<MilestoneRow[]> {
    // Verify access
    const accessCheck = await query(
        `SELECT 1 FROM service_contracts
         WHERE contract_id = $1 AND (homeowner_id = $2 OR provider_id = $2)`,
        [contractId, userId],
    );
    if (accessCheck.rows.length === 0) {
        throw new Error('Contract not found or access denied');
    }

    const result = await query<MilestoneRow>(
        `SELECT milestone_id, contract_id, title, description, milestone_order,
                amount, percentage, status, completed_at, created_at, updated_at
         FROM contract_milestones
         WHERE contract_id = $1 ORDER BY milestone_order ASC`,
        [contractId],
    );
    return result.rows;
}

// ─── Payments ───────────────────────────────────────────────────────────────

/**
 * Get payment history for a contract.
 */
export async function getContractPayments(
    contractId: string,
    userId: string,
): Promise<PaymentRow[]> {
    // Verify access
    const accessCheck = await query(
        `SELECT 1 FROM service_contracts
         WHERE contract_id = $1 AND (homeowner_id = $2 OR provider_id = $2)`,
        [contractId, userId],
    );
    if (accessCheck.rows.length === 0) {
        throw new Error('Contract not found or access denied');
    }

    const result = await query<PaymentRow>(
        `SELECT
            cp.payment_id, cp.contract_id, cp.payer_id, cp.payee_id,
            cp.milestone_id, cp.amount, cp.currency, cp.payment_method,
            cp.status, cp.idempotency_key, cp.confirmation_note,
            cp.transfer_receipt_url, cp.confirmed_by_payer, cp.confirmed_by_payee,
            cp.gateway_ref, cp.payer_confirmed_at, cp.payee_confirmed_at,
            cp.completed_at, cp.created_at, cp.updated_at,
            payer.full_name AS payer_name,
            payee.full_name AS payee_name
        FROM contract_payments cp
        LEFT JOIN users payer ON payer.user_id = cp.payer_id
        LEFT JOIN users payee ON payee.user_id = cp.payee_id
        WHERE cp.contract_id = $1
        ORDER BY cp.created_at DESC`,
        [contractId],
    );
    return result.rows;
}

/**
 * Create a payment record on a contract.
 * Uses financialTransaction to prevent double-spending.
 *
 * For Fatora: would integrate with Fatora gateway (not implemented yet).
 * For Cash/Transfer: creates pending record for dual-party confirmation.
 */
export async function createPayment(
    contractId: string,
    userId: string,
    input: CreatePaymentInput,
    idempotencyKey: string,
): Promise<PaymentRow> {
    return financialTransaction(async (client: PoolClient) => {
        // 1. Load contract and verify access
        const contractResult = await client.query<ContractRow>(
            `SELECT contract_id, project_id, homeowner_id, provider_id, provider_type,
                    total_agreed_amount, bid_id, notes, status, created_at, updated_at
             FROM service_contracts
             WHERE contract_id = $1
             AND (homeowner_id = $2 OR provider_id = $2)
             AND status = 'active'
             FOR UPDATE`,
            [contractId, userId],
        );

        if (contractResult.rows.length === 0) {
            throw new Error('Contract not found, not active, or access denied');
        }

        const contract = contractResult.rows[0];
        if (!contract) {
            throw new Error('Contract not found, not active, or access denied');
        }

        // 2. Idempotency check (mandatory — Domain Law §1)
        const existing = await client.query<PaymentRow>(
            `SELECT payment_id, contract_id, payer_id, payee_id, milestone_id,
                    amount, currency, payment_method, status, idempotency_key,
                    confirmation_note, transfer_receipt_url, confirmed_by_payer,
                    confirmed_by_payee, gateway_ref, payer_confirmed_at,
                    payee_confirmed_at, completed_at, created_at, updated_at
             FROM contract_payments WHERE idempotency_key = $1`,
            [idempotencyKey],
        );
        if (existing.rows.length > 0) {
            return existing.rows[0]!; // Return existing payment (idempotent)
        }

        // 3. Determine payer/payee based on who initiated
        // Homeowner pays provider (standard flow)
        const isHomeowner = userId === contract.homeowner_id;
        const payerId = isHomeowner ? contract.homeowner_id : contract.provider_id;
        const payeeId = isHomeowner ? contract.provider_id : contract.homeowner_id;

        // 4. Validate amount doesn't exceed remaining balance
        const paidResult = await client.query(
            `SELECT COALESCE(SUM(amount), 0)::bigint AS total_paid
             FROM contract_payments
             WHERE contract_id = $1 AND status IN ('completed', 'pending', 'payer_confirmed', 'payee_confirmed')`,
            [contractId],
        );
        const totalPaid = Number(paidResult.rows[0]?.total_paid ?? 0);
        const agreedAmount = Number(contract.total_agreed_amount);
        const remaining = agreedAmount - totalPaid;

        if (input.amount > remaining) {
            throw new Error(
                `Payment amount (${input.amount}) exceeds remaining balance (${remaining})`,
            );
        }

        // 5. If milestone specified, verify it exists and belongs to this contract
        if (input.milestone_id) {
            const milestoneCheck = await client.query(
                `SELECT 1 FROM contract_milestones
                 WHERE milestone_id = $1 AND contract_id = $2`,
                [input.milestone_id, contractId],
            );
            if (milestoneCheck.rows.length === 0) {
                throw new Error('Milestone not found or does not belong to this contract');
            }
        }

        // 6. Create the payment record
        const paymentResult = await client.query<PaymentRow>(
            `INSERT INTO contract_payments
                (contract_id, milestone_id, payer_id, payee_id, amount, currency,
                 payment_method, status, confirmation_note, transfer_receipt_url,
                 idempotency_key)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING payment_id, contract_id, payer_id, payee_id, milestone_id,
                      amount, currency, payment_method, status, idempotency_key,
                      confirmation_note, transfer_receipt_url, confirmed_by_payer,
                      confirmed_by_payee, gateway_ref, payer_confirmed_at,
                      payee_confirmed_at, completed_at, created_at, updated_at`,
            [
                contractId,
                input.milestone_id ?? null,
                payerId,
                payeeId,
                input.amount,
                contract.currency,
                input.payment_method,
                'pending',
                input.confirmation_note ?? null,
                input.transfer_receipt_url ?? null,
                idempotencyKey,
            ],
        );

        const payment = paymentResult.rows[0];
        if (!payment) {
            throw new Error('Failed to create payment record');
        }

        logger.info('Contract payment created', {
            paymentId: payment.payment_id,
            contractId,
            method: input.payment_method,
            amount: input.amount,
            payerId,
            payeeId,
        });

        return payment;
    });
}

/**
 * Confirm receipt of a cash/bank transfer payment.
 * This is the counterparty confirmation step.
 *
 * Flow:
 *   pending → payer_confirmed (when payer confirms they paid)
 *   pending → payee_confirmed (when payee confirms they received)
 *   payer_confirmed + payee confirms → completed
 *   payee_confirmed + payer confirms → completed
 */
export async function confirmPayment(
    paymentId: string,
    userId: string,
    note?: string,
): Promise<PaymentRow> {
    return financialTransaction(async (client: PoolClient) => {
        // Load payment with lock
        const paymentResult = await client.query<PaymentRow & { homeowner_id: string; provider_id: string }>(
            `SELECT cp.payment_id, cp.contract_id, cp.payer_id, cp.payee_id,
                    cp.milestone_id, cp.amount, cp.currency, cp.payment_method,
                    cp.status, cp.idempotency_key, cp.confirmation_note,
                    cp.transfer_receipt_url, cp.confirmed_by_payer, cp.confirmed_by_payee,
                    cp.gateway_ref, cp.payer_confirmed_at, cp.payee_confirmed_at,
                    cp.completed_at, cp.created_at, cp.updated_at,
                    sc.homeowner_id, sc.provider_id
             FROM contract_payments cp
             JOIN service_contracts sc ON sc.contract_id = cp.contract_id
             WHERE cp.payment_id = $1
             FOR UPDATE OF cp`,
            [paymentId],
        );

        if (paymentResult.rows.length === 0) {
            throw new Error('Payment not found');
        }

        const payment = paymentResult.rows[0];
        if (!payment) {
            throw new Error('Payment not found');
        }

        // Verify user is payer or payee
        const isPayer = userId === payment.payer_id;
        const isPayee = userId === payment.payee_id;

        if (!isPayer && !isPayee) {
            throw new Error('Only payer or payee can confirm this payment');
        }

        // Determine new status based on current status and who is confirming
        let newStatus: string;
        let completedAt: string | null = null;

        if (payment.status === 'pending') {
            // First confirmation
            newStatus = isPayer ? 'payer_confirmed' : 'payee_confirmed';
        } else if (payment.status === 'payer_confirmed' && isPayee) {
            // Payee confirming after payer → completed
            newStatus = 'completed';
            completedAt = 'NOW()';
        } else if (payment.status === 'payee_confirmed' && isPayer) {
            // Payer confirming after payee → completed
            newStatus = 'completed';
            completedAt = 'NOW()';
        } else {
            throw new Error('Payment cannot be confirmed in its current state');
        }

        // Update payment
        const confirmCol = isPayer ? 'payer_confirmed_at' : 'payee_confirmed_at';

        const updateResult = await client.query<PaymentRow>(
            `UPDATE contract_payments
             SET status = $1,
                 ${confirmCol} = NOW(),
                 ${completedAt ? 'completed_at = NOW(),' : ''}
                 confirmation_note = COALESCE($3, confirmation_note)
             WHERE payment_id = $2
             RETURNING payment_id, contract_id, payer_id, payee_id, milestone_id,
                       amount, currency, payment_method, status, idempotency_key,
                       confirmation_note, transfer_receipt_url, confirmed_by_payer,
                       confirmed_by_payee, gateway_ref, payer_confirmed_at,
                       payee_confirmed_at, completed_at, created_at, updated_at`,
            [newStatus, paymentId, note ?? null],
        );

        logger.info('Contract payment confirmed', {
            paymentId,
            confirmedBy: userId,
            role: isPayer ? 'payer' : 'payee',
            newStatus,
        });

        const updatedPayment = updateResult.rows[0];
        if (!updatedPayment) {
            throw new Error('Failed to update payment record');
        }

        return updatedPayment;
    });
}
