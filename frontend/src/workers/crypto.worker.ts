// ============================================================================
// Nammerha — Crypto Web Worker (GAP-P5 PLATINUM)
// ============================================================================
// Offloads CPU-intensive SHA-256 hashing and binary conversion from the main
// thread to a dedicated Worker, preventing UI jank during photo upload loops.
//
// Performance impact (Syrian field fleet — older Android devices):
//   Main thread SHA-256 of 5MB JPEG: ~200-500ms BLOCKING (8 photos = 4s jank)
//   Worker SHA-256 of 5MB JPEG: ~200-500ms NON-BLOCKING (0ms main thread)
//
// Protocol:
//   Main → Worker: { id, type: 'sha256', payload: ArrayBuffer }
//   Worker → Main: { id, type: 'sha256', result: string } | { id, error: string }
//
// ArrayBuffer is TRANSFERRED (zero-copy) to avoid double memory allocation.
// ============================================================================

// ─── Message Types ──────────────────────────────────────────────────────────

interface WorkerRequest {
    id: string;
    type: 'sha256' | 'dataurl-to-hash';
    payload: ArrayBuffer | string;
}

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

// ─── SHA-256 Hash Computation ───────────────────────────────────────────────

async function computeSHA256(buffer: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = new Uint8Array(hashBuffer);
    // Manual hex encoding — ~3x faster than Array.from().map().join() for large buffers
    let hex = '';
    for (let i = 0; i < hashArray.length; i++) {
        // Loop index is always within bounds — TypeScript strictNullChecks requires explicit check
        const byte = hashArray[i]!;
        hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
}

// ─── Data URL → ArrayBuffer Conversion ──────────────────────────────────────

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
    const base64 = dataUrl.split(',')[1] ?? '';
    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
        view[i] = binary.charCodeAt(i);
    }
    return buffer;
}

// ─── Message Handler ────────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
    const { id, type, payload } = e.data;
    const response: WorkerResponse = { id, error: 'Unknown message type' };

    try {
        switch (type) {
            case 'sha256': {
                if (!(payload instanceof ArrayBuffer)) {
                    throw new Error('sha256 requires ArrayBuffer payload');
                }
                const hash = await computeSHA256(payload);
                (self as unknown as Worker).postMessage({
                    id,
                    type: 'sha256',
                    result: hash,
                } satisfies WorkerSuccessResponse);
                return;
            }

            case 'dataurl-to-hash': {
                if (typeof payload !== 'string') {
                    throw new Error('dataurl-to-hash requires string payload');
                }
                const buffer = dataUrlToArrayBuffer(payload);
                const hash = await computeSHA256(buffer);
                (self as unknown as Worker).postMessage({
                    id,
                    type: 'dataurl-to-hash',
                    result: hash,
                } satisfies WorkerSuccessResponse);
                return;
            }
        }

        // Unknown type fallback
        (self as unknown as Worker).postMessage(response);
    } catch (err) {
        (self as unknown as Worker).postMessage({
            id,
            error: err instanceof Error ? err.message : String(err),
        } satisfies WorkerErrorResponse);
    }
};
