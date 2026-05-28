// ============================================================================
// Nammerha — Crypto Worker Bridge (GAP-P5 PLATINUM)
// ============================================================================
// Type-safe bridge between main thread and Crypto Web Worker.
//
// Features:
//   - Lazy singleton: Worker is created on first use (not at page load)
//   - Promise-based API: converts postMessage/onmessage to async/await
//   - Concurrent request support: correlates responses by unique ID
//   - Graceful fallback: if Worker fails to spawn, falls back to main thread
//   - Transferable ArrayBuffers: zero-copy for large image blobs
//
// Usage:
//   import { hashBlob, hashDataUrl } from '../workers/crypto-bridge';
//   const hash = await hashBlob(imageBlob);  // runs in Worker thread
// ============================================================================

import { reportWarning } from '../error-reporter';
import { addTrackedTimer } from '../utils/tracked-timers';


// ─── Response Types ─────────────────────────────────────────────────────────

interface WorkerSuccessResponse {
    id: string;
    type: string;
    result: string;
}

interface WorkerErrorResponse {
    id: string;
    error: string;
}

type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse;

// ─── Worker Singleton ───────────────────────────────────────────────────────

let _worker: Worker | null = null;
let _workerFailed = false;

// Pending request registry: maps request IDs to resolve/reject handlers
const _pending = new Map<string, {
    resolve: (value: string) => void;
    reject: (reason: Error) => void;
}>();

function getWorker(): Worker | null {
    if (_workerFailed) { return null; }
    if (_worker) { return _worker; }

    try {
        // Vite-native Worker import pattern:
        // At build time, Vite bundles the worker as a separate chunk and
        // replaces the `new URL(...)` with the correct hashed asset path.
        _worker = new Worker(
            new URL('./crypto.worker.ts', import.meta.url),
            { type: 'module' }
        );

        _worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
            const { id } = e.data;
            const handler = _pending.get(id);
            if (!handler) { return; }
            _pending.delete(id);

            if ('error' in e.data) {
                handler.reject(new Error(e.data.error));
            } else {
                handler.resolve(e.data.result);
            }
        };

        _worker.onerror = (err) => {
            reportWarning('[CryptoBridge] Worker error — falling back to main thread', {
                component: 'crypto_worker',
                error: err.message,
            });
            // Reject all pending requests so they can retry on main thread
            for (const [id, handler] of _pending.entries()) {
                handler.reject(new Error('Worker crashed'));
                _pending.delete(id);
            }
            _worker = null;
            _workerFailed = true;
        };

        return _worker;
    } catch (err) {
        reportWarning('[CryptoBridge] Worker creation failed — falling back to main thread', {
            component: 'crypto_worker',
            error: err instanceof Error ? err.message : String(err),
        });
        _workerFailed = true;
        return null;
    }
}

// ─── Request ID Generator ───────────────────────────────────────────────────

let _counter = 0;
function nextId(): string {
    return `crypto_${++_counter}_${Date.now()}`;
}

// ─── Main-Thread Fallback ───────────────────────────────────────────────────

async function mainThreadSHA256(buffer: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = new Uint8Array(hashBuffer);
    let hex = '';
    for (let i = 0; i < hashArray.length; i++) {
        const byte = hashArray[i]!;
        hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of a Blob (image file).
 * Runs in Web Worker if available, falls back to main thread.
 * Returns hex-encoded hash string (64 chars).
 */
export async function hashBlob(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const worker = getWorker();

    if (!worker) {
        // Fallback: compute on main thread
        return mainThreadSHA256(buffer);
    }

    const id = nextId();
    return new Promise<string>((resolve, reject) => {
        _pending.set(id, { resolve, reject });

        // TRANSFER the ArrayBuffer — zero-copy, ~0ms overhead.
        // After transfer, `buffer` becomes detached (unusable) on the main thread.
        worker.postMessage(
            { id, type: 'sha256', payload: buffer },
            [buffer] // Transferable list
        );

        // Safety timeout: 30s — if Worker hangs, reject and fallback
        addTrackedTimer(setTimeout(() => {
            if (_pending.has(id)) {
                _pending.delete(id);
                reject(new Error('Worker SHA-256 timeout (30s)'));
            }
        }, 30_000));
    });
}

/**
 * Compute SHA-256 hash from a data URL (base64-encoded image).
 * The base64 → binary → hash pipeline runs entirely in the Worker.
 */
export async function hashDataUrl(dataUrl: string): Promise<string> {
    const worker = getWorker();

    if (!worker) {
        // Fallback: convert and hash on main thread
        const parts = dataUrl.split(',');
        const binary = atob(parts[1] ?? '');
        const buffer = new ArrayBuffer(binary.length);
        const view = new Uint8Array(buffer);
        for (let i = 0; i < binary.length; i++) {
            view[i] = binary.charCodeAt(i);
        }
        return mainThreadSHA256(buffer);
    }

    const id = nextId();
    return new Promise<string>((resolve, reject) => {
        _pending.set(id, { resolve, reject });

        worker.postMessage({ id, type: 'dataurl-to-hash', payload: dataUrl });

        addTrackedTimer(setTimeout(() => {
            if (_pending.has(id)) {
                _pending.delete(id);
                reject(new Error('Worker dataurl-to-hash timeout (30s)'));
            }
        }, 30_000));
    });
}

/**
 * Safe wrapper: tries to compute hash, returns null on failure.
 * Never throws — for use in non-critical paths where hash is optional.
 */
export async function tryHashBlob(blob: Blob): Promise<string | null> {
    try {
        return await hashBlob(blob);
    } catch {
        return null;
    }
}

/**
 * Terminate the worker and release resources.
 * Call on page unload or when the worker is no longer needed.
 */
export function terminateWorker(): void {
    if (_worker) {
        _worker.terminate();
        _worker = null;
    }
    _pending.clear();
}
