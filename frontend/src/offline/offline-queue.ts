// ============================================================================
// Nammerha — Offline Queue Manager
// ============================================================================
// IndexedDB-backed queue for API mutations that failed due to offline status.
// Provides manual replay capability (SW handles automatic Background Sync).
// ============================================================================

const DB_NAME    = 'nammerha-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending-requests';

interface QueueEntry {
    id?: number;
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
    timestamp: number;
    retries: number;
}

/**
 * Opens (or creates) the IndexedDB database.
 */
function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = (event) => {
            resolve((event.target as IDBOpenDBRequest).result);
        };

        request.onerror = (event) => {
            reject((event.target as IDBOpenDBRequest).error);
        };
    });
}

/**
 * Returns the count of pending (queued) requests.
 */
export async function getPendingCount(): Promise<number> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).count();
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject((e.target as IDBRequest).error);
        });
    } catch {
        return 0;
    }
}

/**
 * Returns all pending entries (for display in UI).
 */
export async function getPendingEntries(): Promise<QueueEntry[]> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).getAll();
            req.onsuccess = () => resolve(req.result as QueueEntry[]);
            req.onerror = (e) => reject((e.target as IDBRequest).error);
        });
    } catch {
        return [];
    }
}

/**
 * Manually replays all queued requests (used when SW Background Sync
 * is not available or as a user-triggered action).
 *
 * Returns: { replayed: number, failed: number }
 */
export async function replayQueue(): Promise<{ replayed: number; failed: number }> {
    const db = await openDB();
    const entries = await new Promise<QueueEntry[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result as QueueEntry[]);
        req.onerror = (e) => reject((e.target as IDBRequest).error);
    });

    let replayed = 0;
    let failed = 0;

    for (const entry of entries) {
        try {
            const response = await fetch(entry.url, {
                method: entry.method,
                headers: entry.headers,
                body: entry.method !== 'GET' ? entry.body : undefined,
                credentials: 'same-origin',
            });

            if (response.ok || response.status < 500) {
                await removeEntry(db, entry.id!);
                replayed++;
            } else {
                failed++;
            }
        } catch {
            // Still offline — stop
            failed += (entries.length - replayed - failed);
            break;
        }
    }

    return { replayed, failed };
}

/**
 * Clears all pending entries (dangerous — use only for user-initiated clear).
 */
export async function clearQueue(): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject((e.target as IDBRequest).error);
    });
}

function removeEntry(db: IDBDatabase, id: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject((e.target as IDBRequest).error);
    });
}
