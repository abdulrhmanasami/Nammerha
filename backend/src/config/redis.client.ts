import { Redis } from 'ioredis';
import { logger } from '../utils/logger';

// N-1 FIX: Enforce Distributed Locks for Nammerha Fatora Webhooks
const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';

class RedisLockManager {
    private client: Redis;

    constructor() {
        this.client = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
        });

        this.client.on('error', (err) => {
            logger.error('Redis Client Error in Lock Manager', { error: err.message });
        });
    }

    /**
     * Acquires a distributed lock using SET NX EX
     * @param key Lock key
     * @param ttlSeconds Time-to-live in seconds to automatically release the lock
     * @returns Boolean indicating whether the lock was successfully acquired
     */
    async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
        try {
            const result = await this.client.set(key, 'LOCKED', 'EX', ttlSeconds, 'NX');
            return result === 'OK';
        } catch (err) {
            logger.error('Failed to acquire Redis lock', { key, error: err instanceof Error ? err.message : String(err) });
            // Fail secure mode: if Redis fails, do not allow operation to proceed
            return false;
        }
    }

    /**
     * Releases a lock explicitly
     * @param key Lock key
     */
    async releaseLock(key: string): Promise<void> {
        try {
            await this.client.del(key);
        } catch (err) {
            logger.error('Failed to release Redis lock', { key, error: err instanceof Error ? err.message : String(err) });
        }
    }
}

export const redisLockManager = new RedisLockManager();
