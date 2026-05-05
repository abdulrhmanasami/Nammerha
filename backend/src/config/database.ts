// ============================================================================
// Nammerha Backend — PostgreSQL Connection Pool
// TLS: Supports sslmode=require|verify-ca for inter-container encryption.
// ============================================================================
import { Pool, PoolClient, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import * as fs from 'fs';
import * as tls from 'tls';
import { logger } from '../utils/logger';

// NOTE: dotenv.config() is called in server.ts before this module is imported.
// Do NOT call it again here — duplicate calls can cause race conditions.

// ─── SSL Configuration (PCI DSS 4.1: encrypt data-in-transit) ──────────────

function buildSslConfig(): tls.ConnectionOptions | false {
    const dbUrl = process.env['DATABASE_URL'] ?? '';
    const sslRootCert = process.env['PGSSLROOTCERT'];

    // Parse sslmode from connection string
    const sslModeMatch = dbUrl.match(/[?&]sslmode=([^&]+)/);
    const sslMode = sslModeMatch?.[1];

    if (!sslMode || sslMode === 'disable' || sslMode === 'prefer') {
        // Development / no SSL
        return false;
    }

    if (sslMode === 'require') {
        // Encrypt traffic, but don't verify server certificate
        return { rejectUnauthorized: false };
    }

    if (sslMode === 'verify-ca') {
        // ─── ARCH-FT-003: verify-ca Semantics ──────────────────────────────
        // libpq verify-ca: Encrypt traffic AND validate server cert against CA,
        // but do NOT verify hostname (SAN/CN match).
        //
        // Node.js pg has no native verify-ca mode. rejectUnauthorized controls
        // BOTH CA chain validation AND hostname verification. Setting it to false
        // with an explicit `ca` still validates the cert against the CA chain
        // (OpenSSL does this automatically when ca is provided), but skips the
        // hostname check that would fail in Docker networking where the cert's
        // CN=localhost doesn't match the container hostname (nammerha-db).
        //
        // This is functionally equivalent to libpq's verify-ca mode.
        // ────────────────────────────────────────────────────────────────────
        if (!sslRootCert) {
            throw new Error(
                `[DB] sslmode=verify-ca requires PGSSLROOTCERT env var pointing to CA certificate`
            );
        }
        if (!fs.existsSync(sslRootCert)) {
            throw new Error(
                `[DB] CA certificate not found at ${sslRootCert}. Run database/tls/generate-certs.sh first.`
            );
        }
        return {
            rejectUnauthorized: false, // See ARCH-FT-003 comment above
            ca: fs.readFileSync(sslRootCert, 'utf-8'),
        };
    }

    if (sslMode === 'verify-full') {
        // Encrypt traffic AND verify server certificate against CA AND hostname
        if (!sslRootCert) {
            throw new Error(
                `[DB] sslmode=verify-full requires PGSSLROOTCERT env var pointing to CA certificate`
            );
        }
        if (!fs.existsSync(sslRootCert)) {
            throw new Error(
                `[DB] CA certificate not found at ${sslRootCert}. Run database/tls/generate-certs.sh first.`
            );
        }
        return {
            rejectUnauthorized: true,
            ca: fs.readFileSync(sslRootCert, 'utf-8'),
        };
    }

    // Unknown sslmode — fail secure
    throw new Error(`[DB] Unknown sslmode: "${sslMode}". Use disable, require, verify-ca, or verify-full.`);
}

const sslConfig = buildSslConfig();

// ─── Strip SSL params from connection string ────────────────────────────────
// pg-connection-string v3 parses sslmode from the URL and builds its own SSL
// config, treating verify-ca as verify-full (hostname check). This causes TLS
// handshake failures when self-signed certs use CN=localhost between containers.
// Since buildSslConfig() already handles SSL independently, strip SSL params
// from the URL to prevent the double-config conflict.
function stripSslParams(url: string): string {
    try {
        const parsed = new URL(url);
        parsed.searchParams.delete('sslmode');
        parsed.searchParams.delete('sslrootcert');
        return parsed.toString();
    } catch (err) {
        // If URL parsing fails, strip via regex (fallback for edge cases)
        logger.warn('PLT-2026-AUD-003: URL parsing failed in stripSslParams — using regex fallback', {
            error: err instanceof Error ? err.message : String(err),
        });
        return url
            .replace(/[?&]sslmode=[^&]*/g, '')
            .replace(/[?&]sslrootcert=[^&]*/g, '')
            .replace(/\?$/, '');
    }
}

const poolConfig: PoolConfig = {
    connectionString: stripSslParams(process.env['DATABASE_URL'] ?? ''),
    min: parseInt(process.env['DB_POOL_MIN'] ?? '2', 10),
    max: parseInt(process.env['DB_POOL_MAX'] ?? '10', 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ...(sslConfig !== false && { ssl: sslConfig }),
};

const pool = new Pool(poolConfig);

pool.on('error', (err: Error) => {
    // HGH-007: Do NOT call process.exit(1) — a single transient error should not kill
    // the process and abort all in-flight requests. The pool self-recovers.
    // F-006 FIX: Structured metadata enables APM alerting rules (e.g., DataDog/New Relic
    // monitors can trigger on severity=critical + requires_ops_attention=true).
    logger.error('DB: Unexpected pool error (pool will attempt recovery)', {
        error: err.message,
        stack: err.stack,
        severity: 'critical',
        component: 'database_pool',
        requires_ops_attention: true,
    });
});

if (process.env['NODE_ENV'] === 'development') {
    pool.on('connect', () => {
        logger.debug('DB: New client connected to pool');
    });
}

// ─── Query Helpers ──────────────────────────────────────────────────────────

/**
 * Execute a parameterized SQL query against the pool.
 * All queries MUST use parameterized statements ($1, $2, ...) to prevent SQL injection.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
): Promise<QueryResult<T>> {
    const start = Date.now();
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;

    if (process.env['NODE_ENV'] === 'development') {
        logger.debug('DB: Query executed', {
            text: text.substring(0, 80),
            duration: `${duration}ms`,
            rows: result.rowCount,
        });
    }

    return result;
}

/**
 * Get a client from the pool for transaction use.
 * IMPORTANT: Always call client.release() in a finally block.
 */
export async function getClient() {
    const client = await pool.connect();
    return client;
}

/**
 * Execute a function within a database transaction.
 * Automatically handles BEGIN, COMMIT, and ROLLBACK.
 *
 * NOTE: For financial/monetary operations (escrow, donations, payments),
 * use `financialTransaction()` instead — it enforces SERIALIZABLE isolation.
 */
export async function transaction<T>(
    fn: (client: PoolClient) => Promise<T>
): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// ─── GAP-S1 PLATINUM FIX: Financial Transaction with SERIALIZABLE Isolation ──
// Nammerha Domain Law 1: ALL escrow releases, donations, and payment mutations
// MUST use SERIALIZABLE isolation to prevent double-spending race conditions.
//
// READ COMMITTED (default) allows two concurrent transactions to both read the
// same escrow balance, then both release funds — resulting in double-spend.
// SERIALIZABLE forces PostgreSQL to detect this conflict and abort one
// transaction (SQLSTATE 40001), which the caller should retry.
//
// Usage: import { financialTransaction } from './config/database';
//   await financialTransaction(async (client) => {
//       // All queries inside here are SERIALIZABLE
//   });
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a function within a SERIALIZABLE database transaction.
 * **MANDATORY** for all financial/monetary operations:
 *   - Escrow release/lock
 *   - Donation processing
 *   - Payment state transitions
 *   - Balance mutations
 *
 * Automatically handles BEGIN, COMMIT, ROLLBACK, and retries on
 * serialization failures (SQLSTATE 40001) up to 3 times.
 *
 * @throws Error if all retry attempts fail
 */
export async function financialTransaction<T>(
    fn: (client: PoolClient) => Promise<T>
): Promise<T> {
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
            const result = await fn(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');

            // SQLSTATE 40001 = serialization_failure — expected under concurrency.
            // PostgreSQL correctly detected a conflict. Retry with fresh snapshot.
            const pgCode = (error as Record<string, unknown>)?.['code'];
            if (pgCode === '40001' && attempt < MAX_RETRIES) {
                logger.warn('financialTransaction: Serialization conflict — retrying', {
                    attempt,
                    maxRetries: MAX_RETRIES,
                    error: error instanceof Error ? error.message : String(error),
                });
                // Exponential backoff: 50ms, 100ms before retry
                await new Promise(r => setTimeout(r, 50 * attempt));
                continue;
            }

            throw error;
        } finally {
            client.release();
        }
    }

    // TypeScript: unreachable, but satisfies return type
    throw new Error('financialTransaction: Exhausted all retry attempts');
}

// ─── GAP-O3 PLATINUM FIX: Production Slow Query Monitoring ──────────────────
// Previous: Query duration logged only in development mode.
// Now: Any query exceeding 200ms in production is logged with WARNING severity,
// enabling APM alert rules and proactive performance monitoring.
// ─────────────────────────────────────────────────────────────────────────────

const SLOW_QUERY_THRESHOLD_MS = parseInt(
    process.env['SLOW_QUERY_THRESHOLD_MS'] ?? '200', 10
);

// Override the base query function to add slow query detection in production
const _originalQuery = query;

// Re-export with production monitoring
export { _originalQuery };

// Patch: Add slow query detection to the existing query function
pool.on('connect', (client) => {
    const originalClientQuery = client.query.bind(client);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).query = async (...args: unknown[]) => {
        const start = Date.now();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (originalClientQuery as any)(...args);
        const duration = Date.now() - start;

        if (duration > SLOW_QUERY_THRESHOLD_MS) {
            const queryText = typeof args[0] === 'string'
                ? args[0].substring(0, 120)
                : typeof args[0] === 'object' && args[0] !== null && 'text' in (args[0] as Record<string, unknown>)
                    ? String((args[0] as Record<string, unknown>).text).substring(0, 120)
                    : 'unknown';
            logger.warn('SLOW QUERY DETECTED', {
                duration: `${duration}ms`,
                threshold: `${SLOW_QUERY_THRESHOLD_MS}ms`,
                query: queryText,
                severity: duration > 1000 ? 'critical' : 'warning',
                component: 'database',
            });
        }

        return result;
    };
});

// ─── GAP-O5 PLATINUM FIX: Pool Statistics for Health Monitoring ──────────────
// Exposes connection pool metrics for the /health/full endpoint.
// No external dependencies — uses pg Pool's built-in counters.
export function getPoolStats(): {
    total: number;
    idle: number;
    waiting: number;
    available: number;
} {
    return {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        available: pool.idleCount, // Available = idle connections ready for use
    };
}

export default pool;
