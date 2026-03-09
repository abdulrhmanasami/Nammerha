// ============================================================================
// Nammerha Backend — PostgreSQL Connection Pool
// TLS: Supports sslmode=require|verify-ca for inter-container encryption.
// ============================================================================
import { Pool, PoolClient, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import * as fs from 'fs';
import * as tls from 'tls';

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

    if (sslMode === 'verify-ca' || sslMode === 'verify-full') {
        // Encrypt traffic AND verify server certificate against CA
        if (!sslRootCert) {
            throw new Error(
                `[DB] sslmode=${sslMode} requires PGSSLROOTCERT env var pointing to CA certificate`
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

const poolConfig: PoolConfig = {
    connectionString: process.env['DATABASE_URL'],
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
    console.error('[DB] Unexpected pool error (pool will attempt recovery):', err.message);
});

if (process.env['NODE_ENV'] === 'development') {
    pool.on('connect', () => {
        console.log('[DB] New client connected to pool');
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
        console.log('[DB] Query executed', {
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

export default pool;
