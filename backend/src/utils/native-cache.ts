// ============================================================================
// Nammerha Backend — Native In-Memory Cache (Zero-Dependency)
// ============================================================================
// PLATINUM CERTIFICATION IMPLEMENTATION:
// Provides sub-10ms response times for high-traffic, non-transactional GET routes
// without introducing external dependencies (Redis) risking Day-1 infrastructure issues.

interface CacheEntry {
    data: any;
    expiresAt: number;
}

export class NativeCache {
    private cache = new Map<string, CacheEntry>();
    private maxSize: number;
    private sweepIntervalId?: NodeJS.Timeout;

    constructor(maxSize: number = 10000, sweepIntervalMs: number = 60000) {
        this.maxSize = maxSize;
        // P1-AUD-CACHE-001 FIX: Periodic sweep to prevent silent OOM leaks from untouched keys
        this.sweepIntervalId = setInterval(() => {
            this.sweep();
        }, sweepIntervalMs);
        this.sweepIntervalId.unref(); // Ensure timer doesn't block Node process exit
    }

    private sweep(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
            }
        }
    }

    set(key: string, data: any, ttlSeconds: number): void {
        // Enforce max size to prevent memory blowout under investor stress testing
        if (this.cache.size >= this.maxSize) {
            // Evict oldest (Map guarantees insertion order)
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
        }

        const expiresAt = Date.now() + ttlSeconds * 1000;
        this.cache.set(key, { data, expiresAt });
    }

    get(key: string): any | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;

        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return undefined;
        }

        return entry.data;
    }

    invalidate(key: string): void {
        this.cache.delete(key);
    }
    
    invalidatePattern(pattern: RegExp): void {
        for (const key of this.cache.keys()) {
            if (pattern.test(key)) {
                this.cache.delete(key);
            }
        }
    }

    clear(): void {
        this.cache.clear();
    }

}

export const memoryCache = new NativeCache();
