// ============================================================================
// Nammerha — Client-Side Image Integrity Hashing (IMP-007)
// ============================================================================
// GAP-P5 PLATINUM FIX: Now delegates to the Crypto Web Worker via the bridge.
//
// Previous: SHA-256 computed on main thread — blocked UI for 200-500ms per
// image on older Syrian field devices. With 8 captures per session, total
// main-thread blocking was up to 4 seconds of jank.
//
// Now: SHA-256 runs in a dedicated Web Worker thread with zero main-thread
// blocking. ArrayBuffers are TRANSFERRED (not copied) to avoid double
// memory allocation. Falls back to main thread if Worker is unavailable.
//
// Why client-side hashing matters:
//   - "Absolute Spatial Reality" standard: proof integrity is paramount
//   - Detects man-in-the-middle tampering between upload and storage
//   - Provides independent chain of custody: hash computed BEFORE upload
//   - Verifiable by donor/auditor: client hash vs server hash must match
//
// Standard: SubtleCrypto.digest() — W3C Web Cryptography API
// ============================================================================

import { hashBlob, hashDataUrl, tryHashBlob } from '../workers/crypto-bridge';

/**
 * Compute SHA-256 hash of a Blob (image file).
 * Runs in Web Worker if available, falls back to main thread.
 * Returns hex-encoded hash string (64 chars).
 *
 * @throws If Web Crypto API is unavailable (insecure context or very old browser)
 */
export async function computeImageHash(blob: Blob): Promise<string> {
    return hashBlob(blob);
}

/**
 * Compute SHA-256 hash from a data URL (base64-encoded image).
 * The entire base64 → binary → hash pipeline runs in the Worker thread.
 *
 * @param dataUrl - e.g. "data:image/jpeg;base64,/9j/4AAQ..."
 */
export async function computeHashFromDataUrl(dataUrl: string): Promise<string> {
    return hashDataUrl(dataUrl);
}

/**
 * Safe wrapper: tries to compute hash, returns null on failure.
 * Never throws — for use in non-critical paths where hash is optional.
 */
export async function tryComputeImageHash(blob: Blob): Promise<string | null> {
    return tryHashBlob(blob);
}
