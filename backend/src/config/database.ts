// ============================================================================
// Nammerha Backend — PostgreSQL Connection Pool
// ============================================================================
import { Pool, PoolClient, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const poolConfig: PoolConfig = {
    connectionString: process.env['DATABASE_URL'],
    min: parseInt(process.env['DB_POOL_MIN'] ?? '2', 10),
    max: parseInt(process.env['DB_POOL_MAX'] ?? '10', 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
};

const pool = new Pool(poolConfig);

pool.on('error', (err: Error) => {
    console.error('[DB] Unexpected pool error:', err.message);
    process.exit(1);
});

pool.on('connect', () => {
    console.log('[DB] New client connected to pool');
});

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
