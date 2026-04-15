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

    set(key: string, data: any, ttlSeconds: number): void {
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
