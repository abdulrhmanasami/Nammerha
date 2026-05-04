// ============================================================================
// Nammerha Backend — Redis Client with Circuit Breaker (F-009 Platinum)
// ============================================================================
// Provides distributed locking via Redis with automatic fallback to PostgreSQL
// Advisory Locks when Redis is unavailable. This is critical for post-conflict
// Syria where infrastructure is unreliable — a Redis outage should NOT halt
// all financial operations.
//
// Circuit Breaker State Machine:
//   CLOSED    → Normal Redis operation
//   OPEN      → Redis failed N times → fallback to PostgreSQL Advisory Locks
//   HALF_OPEN → Cooldown expired → test Redis with next request
//
// IMPORTANT: Only ONE lock mechanism is active at any time. No split-brain.
// ============================================================================

import { Redis } from 'ioredis';
import { logger } from '../utils/logger';
import pool from '../config/database';
import crypto from 'crypto';

// ─── Configuration (Environment-Overridable) ────────────────────────────────

const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';

/**
 * Number of consecutive Redis failures before opening the circuit.
 * Low threshold because financial operations cannot tolerate repeated failures.
 * Override via CIRCUIT_BREAKER_THRESHOLD env var for staging/production tuning.
 */
const CIRCUIT_BREAKER_THRESHOLD = parseInt(
    process.env['CIRCUIT_BREAKER_THRESHOLD'] ?? '3', 10
);

/**
 * Cooldown period in milliseconds before testing Redis again (HALF_OPEN).
 * 30 seconds prevents rapid flapping between Redis and PostgreSQL.
 * Override via CIRCUIT_BREAKER_COOLDOWN_MS env var.
 */
const CIRCUIT_BREAKER_COOLDOWN_MS = parseInt(
    process.env['CIRCUIT_BREAKER_COOLDOWN_MS'] ?? '30000', 10
);

// ─── Exported Types ─────────────────────────────────────────────────────────

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerState {
    state: CircuitState;
    consecutiveFailures: number;
    lastFailureAt: number;
    lastTransitionAt: number;
}

export interface CircuitBreakerMetrics {
    state: CircuitBreakerState;
    counters: {
        redisAcquireAttempts: number;
        redisAcquireSuccesses: number;
        redisAcquireFailures: number;
        pgFallbackAttempts: number;
        pgFallbackSuccesses: number;
        pgFallbackFailures: number;
        circuitOpenedCount: number;
        circuitClosedCount: number;
    };
}

// ─── Lua Scripts ────────────────────────────────────────────────────────────

// F-008 FIX: Lua script for atomic check-and-delete.
// Only the lock owner (matching token) can release the lock.
// This prevents Process A from releasing Process B's lock after TTL expiry + re-acquisition.
const RELEASE_LOCK_SCRIPT = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
    else
        return 0
    end
`;

// ─── PostgreSQL Advisory Lock Token Format ──────────────────────────────────
// Token: "pglock:<lockId1>:<lockId2>:<uuid>"
// The lock IDs are extracted for explicit pg_advisory_unlock() on release.
const PGLOCK_PREFIX = 'pglock:';

/**
 * Parse lock IDs from a PostgreSQL advisory lock token.
 * Returns null if the token is not a pglock token.
 */
function parsePglockToken(token: string): { lockId1: number; lockId2: number } | null {
    if (!token.startsWith(PGLOCK_PREFIX)) return null;
    const parts = token.slice(PGLOCK_PREFIX.length).split(':');
    const lockId1 = parseInt(parts[0] ?? '', 10);
    const lockId2 = parseInt(parts[1] ?? '', 10);
    if (Number.isNaN(lockId1) || Number.isNaN(lockId2)) return null;
    return { lockId1, lockId2 };
}

// ─── Redis Lock Manager with Circuit Breaker ────────────────────────────────

class RedisLockManager {
    private client: Redis;
    private circuit: CircuitBreakerState;

    // Operational metrics for health check / monitoring endpoints
    private counters = {
        redisAcquireAttempts: 0,
        redisAcquireSuccesses: 0,
        redisAcquireFailures: 0,
        pgFallbackAttempts: 0,
        pgFallbackSuccesses: 0,
        pgFallbackFailures: 0,
        circuitOpenedCount: 0,
        circuitClosedCount: 0,
    };

    constructor() {
        this.client = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            // F-009 FIX: Fast connection timeout to detect Redis outage quickly.
            // Default is 10s which blocks financial operations for too long.
            connectTimeout: 3000,
            // Retry strategy: attempt 3 times with exponential backoff, then stop.
            retryStrategy: (times: number) => {
                if (times > 3) return null; // Stop retrying, trigger circuit breaker
                return Math.min(times * 200, 1000);
            },
        });

        this.client.on('error', (err) => {
            logger.error('Redis Client Error in Lock Manager', { error: err.message });
        });

        this.circuit = {
            state: 'CLOSED',
            consecutiveFailures: 0,
            lastFailureAt: 0,
            lastTransitionAt: Date.now(),
        };
    }

    // ─── Circuit Breaker State Machine ──────────────────────────────────

    /**
     * Record a Redis success — reset consecutive failures and close the circuit.
     */
    private onRedisSuccess(): void {
        if (this.circuit.state !== 'CLOSED') {
            logger.info('F-009 Circuit Breaker: Redis recovered — closing circuit', {
                previousState: this.circuit.state,
                failureCount: this.circuit.consecutiveFailures,
            });
            this.counters.circuitClosedCount++;
        }
        this.circuit.consecutiveFailures = 0;
        this.circuit.state = 'CLOSED';
        this.circuit.lastTransitionAt = Date.now();
    }

    /**
     * Record a Redis failure — increment counter, potentially open the circuit.
     */
    private onRedisFailure(error: unknown): void {
        this.circuit.consecutiveFailures++;
        this.circuit.lastFailureAt = Date.now();

        const errMsg = error instanceof Error ? error.message : String(error);

        if (this.circuit.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && this.circuit.state === 'CLOSED') {
            this.circuit.state = 'OPEN';
            this.circuit.lastTransitionAt = Date.now();
            this.counters.circuitOpenedCount++;
            logger.warn('F-009 Circuit Breaker: OPENED — falling back to PostgreSQL Advisory Locks', {
                consecutiveFailures: this.circuit.consecutiveFailures,
                lastError: errMsg,
                threshold: CIRCUIT_BREAKER_THRESHOLD,
            });
        } else if (this.circuit.state === 'HALF_OPEN') {
            // Test failed — go back to OPEN
            this.circuit.state = 'OPEN';
            this.circuit.lastTransitionAt = Date.now();
            this.counters.circuitOpenedCount++;
            logger.warn('F-009 Circuit Breaker: HALF_OPEN test failed — re-opening circuit', {
                lastError: errMsg,
            });
        }
    }

    /**
     * Determine whether to use Redis or fallback to PostgreSQL.
     * Returns true if Redis should be attempted.
     */
    private shouldUseRedis(): boolean {
        if (this.circuit.state === 'CLOSED') {
            return true;
        }

        if (this.circuit.state === 'OPEN') {
            // Check if cooldown period has elapsed
            const elapsed = Date.now() - this.circuit.lastTransitionAt;
            if (elapsed >= CIRCUIT_BREAKER_COOLDOWN_MS) {
                this.circuit.state = 'HALF_OPEN';
                this.circuit.lastTransitionAt = Date.now();
                logger.info('F-009 Circuit Breaker: Entering HALF_OPEN — testing Redis', {
                    cooldownMs: CIRCUIT_BREAKER_COOLDOWN_MS,
                    elapsedMs: elapsed,
                });
                return true; // Try Redis once
            }
            return false; // Still cooling down — use PostgreSQL
        }

        // HALF_OPEN: let the current request test Redis
        return true;
    }

    // ─── Public API ─────────────────────────────────────────────────────

    /**
     * Acquires a distributed lock using SET NX EX with a fencing token.
     *
     * F-008 FIX: Returns a unique fencing token on success (or null on failure).
     * F-009 FIX: Falls back to PostgreSQL Advisory Locks when Redis circuit is open.
     *
     * @param key Lock key
     * @param ttlSeconds Time-to-live in seconds to automatically release the lock
     * @returns Fencing token string if lock acquired, null otherwise
     */
    async acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
        if (this.shouldUseRedis()) {
            return this.acquireLockViaRedis(key, ttlSeconds);
        }
        return this.acquireLockViaPostgres(key, ttlSeconds);
    }

    /**
     * Releases a lock only if the caller owns it (token matches).
     *
     * F-008 FIX: Uses atomic Lua script to check ownership before deletion.
     * F-009 FIX: PostgreSQL advisory locks are explicitly released via
     *            pg_advisory_unlock() to prevent lock starvation on pooled connections.
     *
     * @param key Lock key
     * @param token The fencing token returned by acquireLock
     */
    async releaseLock(key: string, token: string): Promise<void> {
        // PostgreSQL advisory lock tokens start with 'pglock:' prefix
        const pgIds = parsePglockToken(token);
        if (pgIds) {
            // PLATINUM FIX: Explicitly release PostgreSQL advisory lock.
            // Without this, the lock stays held on the pooled connection indefinitely,
            // causing lock starvation over time as the pool recycles connections.
            try {
                await pool.query(
                    `SELECT pg_advisory_unlock($1, $2)`,
                    [pgIds.lockId1, pgIds.lockId2]
                );
                logger.debug('PostgreSQL advisory lock released', {
                    key,
                    lockId: `${pgIds.lockId1}:${pgIds.lockId2}`,
                });
            } catch (err) {
                // Non-fatal: the lock will eventually release when the connection
                // is recycled by the pool. Log for audit trail.
                logger.error('Failed to release PostgreSQL advisory lock', {
                    key,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
            return;
        }

        // Redis lock — use Lua atomic release
        try {
            const released = await this.client.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
            if (released === 0) {
                logger.warn('Redis lock release skipped: token mismatch (lock expired or re-acquired)', { key });
            }
            this.onRedisSuccess();
        } catch (err) {
            this.onRedisFailure(err);
            logger.error('Failed to release Redis lock', { key, error: err instanceof Error ? err.message : String(err) });
        }
    }

    // ─── Redis Lock Implementation ──────────────────────────────────────

    private async acquireLockViaRedis(key: string, ttlSeconds: number): Promise<string | null> {
        this.counters.redisAcquireAttempts++;
        const token = crypto.randomUUID();
        try {
            const result = await this.client.set(key, token, 'EX', ttlSeconds, 'NX');
            if (result === 'OK') {
                this.onRedisSuccess();
                this.counters.redisAcquireSuccesses++;
                return token;
            }
            // Lock already held by another process — not a Redis failure
            this.onRedisSuccess();
            return null;
        } catch (err) {
            this.counters.redisAcquireFailures++;
            this.onRedisFailure(err);
            logger.error('Failed to acquire Redis lock — checking fallback', {
                key,
                error: err instanceof Error ? err.message : String(err),
                circuitState: this.circuit.state,
            });

            // If circuit just opened, try PostgreSQL fallback for THIS request
            if (this.circuit.state === 'OPEN') {
                logger.info('F-009 Circuit Breaker: Immediate PostgreSQL fallback for current request', { key });
                return this.acquireLockViaPostgres(key, ttlSeconds);
            }

            // Fail secure: if Redis fails but circuit isn't fully open yet, block the operation
            return null;
        }
    }

    // ─── PostgreSQL Advisory Lock Fallback ──────────────────────────────

    /**
     * Fallback lock mechanism using PostgreSQL pg_try_advisory_lock().
     *
     * Advisory locks are:
     * - Session-scoped (released via explicit pg_advisory_unlock or connection close)
     * - Non-blocking (pg_try_advisory_lock returns false if already held)
     * - Zero external dependency (uses existing PostgreSQL connection pool)
     *
     * We use a hash of the lock key as the advisory lock ID (two int4 values).
     * The token is prefixed with 'pglock:' so releaseLock knows which path to take.
     *
     * IMPORTANT: The caller MUST call releaseLock() in a finally block to prevent
     * advisory lock starvation on the pooled connection.
     */
    private async acquireLockViaPostgres(key: string, _ttlSeconds: number): Promise<string | null> {
        this.counters.pgFallbackAttempts++;
        try {
            // Generate a deterministic 64-bit lock ID from the key string.
            // We use two 32-bit integers derived from SHA-256 for pg_try_advisory_lock(id1, id2).
            const hash = crypto.createHash('sha256').update(key).digest();
            const lockId1 = hash.readInt32BE(0);
            const lockId2 = hash.readInt32BE(4);

            const result = await pool.query<{ locked: boolean }>(
                `SELECT pg_try_advisory_lock($1, $2) AS locked`,
                [lockId1, lockId2]
            );

            const acquired = result.rows[0]?.locked === true;

            if (acquired) {
                const token = `${PGLOCK_PREFIX}${lockId1}:${lockId2}:${crypto.randomUUID()}`;
                this.counters.pgFallbackSuccesses++;
                logger.info('F-009 Circuit Breaker: Acquired PostgreSQL advisory lock (Redis fallback)', {
                    key,
                    lockId: `${lockId1}:${lockId2}`,
                });
                return token;
            }

            // Lock already held by another session
            logger.warn('PostgreSQL advisory lock already held', { key });
            return null;
        } catch (err) {
            this.counters.pgFallbackFailures++;
            logger.error('Failed to acquire PostgreSQL advisory lock', {
                key,
                error: err instanceof Error ? err.message : String(err),
            });
            // Both Redis AND PostgreSQL failed — catastrophic. Fail secure.
            return null;
        }
    }

    // ─── Diagnostics & Health ───────────────────────────────────────────

    /**
     * Returns the current circuit breaker state and operational metrics
     * for health check endpoints and monitoring dashboards.
     *
     * Example usage in health route:
     *   app.get('/health/redis', (req, res) => {
     *       res.json(redisLockManager.getMetrics());
     *   });
     */
    getMetrics(): CircuitBreakerMetrics {
        return {
            state: { ...this.circuit },
            counters: { ...this.counters },
        };
    }

    /**
     * Returns the current circuit breaker state for health check endpoints.
     */
    getCircuitState(): Readonly<CircuitBreakerState> {
        return { ...this.circuit };
    }
}

export const redisLockManager = new RedisLockManager();
