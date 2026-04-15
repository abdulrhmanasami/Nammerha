// ============================================================================
// Nammerha — Client-Side Image Integrity Hashing (IMP-007)
// ============================================================================
// Computes SHA-256 from raw image binary using Web Crypto API.
// Used by engineer-camera.ts to provide CLIENT-SIDE hash alongside upload,
// enabling dual verification (client hash + server re-hash).
//
// Why client-side hashing matters:
//   - "Absolute Spatial Reality" standard: proof integrity is paramount
//   - Detects man-in-the-middle tampering between upload and storage
//   - Provides independent chain of custody: hash computed BEFORE upload
//   - Verifiable by donor/auditor: client hash vs server hash must match
//
// Performance:
//   Web Crypto API is hardware-accelerated on modern browsers.
//   A 5MB JPEG hashes in <50ms on mid-range devices.
//   On older devices (Syrian field fleet), falls back gracefully.
//
// Standard: SubtleCrypto.digest() — W3C Web Cryptography API
// ============================================================================

/**
 * Compute SHA-256 hash of a Blob (image file) using Web Crypto API.
 * Returns hex-encoded hash string (64 chars).
 *
 * @throws If Web Crypto API is unavailable (insecure context or very old browser)
 */
export async function computeImageHash(blob: Blob): Promise<string> {
    if (!crypto?.subtle?.digest) {
        throw new Error('Web Crypto API unavailable — secure context (HTTPS) required');
    }

    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);

    // Convert ArrayBuffer to hex string
    const hashArray = new Uint8Array(hashBuffer);
    const hashHex = Array.from(hashArray)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

    return hashHex;
}

/**
 * Compute SHA-256 hash from a data URL (base64-encoded image).
 * Converts to Blob first, then hashes.
 *
 * @param dataUrl - e.g. "data:image/jpeg;base64,/9j/4AAQ..."
 */
export async function computeHashFromDataUrl(dataUrl: string): Promise<string> {
    const blob = dataUrlToBlob(dataUrl);
    return computeImageHash(blob);
}

/**
 * Safe wrapper: tries to compute hash, returns null on failure.
 * Never throws — for use in non-critical paths where hash is optional.
 */
export async function tryComputeImageHash(blob: Blob): Promise<string | null> {
    try {
        return await computeImageHash(blob);
    } catch {
        return null;
    }
}

// ─── Internal ───────────────────────────────────────────────────────────────

function dataUrlToBlob(dataUrl: string): Blob {
    const parts = dataUrl.split(',');
    const mime = parts[0]?.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
    const binary = atob(parts[1] ?? '');
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
}
