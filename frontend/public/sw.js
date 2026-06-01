// ============================================================================
// Nammerha — Service Worker (Field-Grade Offline Capabilities)
// ============================================================================
// MEMO 58 FIX: Strategies redesigned to prevent Invisible Fix Pipeline.
// Previous: Cache-First for ALL assets trapped users on stale content forever.
//
// Strategies (current):
//   1. HTML / Documents (Network-First) — always serve latest, cache as fallback
//   2. Vite Hashed Assets (Cache-First) — immutable filenames, safe to cache
//   3. Unhashed Public Files (Network-First) — nav.js, i18n.js etc.
//   4. Images (Cache-First)             — rarely change
//   5. API Read (Network-First)         — GET /api/*
//   6. API Write (Queue)                — POST/PUT/DELETE → queue if offline
//   7. Never Cache                      — /api/auth/*, /api/csrf-token
// ============================================================================

const CACHE_VERSION = 'v1780346284862';
const SHELL_CACHE  = `nammerha-shell-${CACHE_VERSION}`;
const API_CACHE    = `nammerha-api-${CACHE_VERSION}`;
const IMG_CACHE    = `nammerha-img-${CACHE_VERSION}`;

// Network timeout for API requests before falling back to cache (ms)
const API_NETWORK_TIMEOUT_MS = 3000;

// ─── App Shell: Pre-cached on install ───────────────────────────────────────
// I-005 FIX: Only cache UNIVERSAL pages on install. Role-specific pages are cached
// on-demand via cacheFirstWithNetwork when the user actually visits them.
// Previous: cached all 28 pages upfront — wasting ~200KB+ of Syrian mobile data.
// MEMO 58 FIX: Removed ?v=N query params from SHELL_ASSETS.
// Previous: SW cached '/nav.js?v=8' but HTML requested '/nav.js?v=7' —
// different cache keys caused permanent desync.
// Now: Cache by bare path. Nginx + ETag handles freshness for unhashed files.
const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/auth.html',
    '/about.html',
    '/profile.html',
    '/wallet.html',
    '/project-details.html',
    '/contact.html',
    '/pricing.html',
    '/reset-password.html',
    '/verify-email.html',
    '/privacy.html',
    '/terms.html',
    '/refund-policy.html',
    '/nav.js',
    '/i18n.js',
    '/i18n.css',
    '/i18n/wallet.js',
    '/fonts/phosphor/phosphor.css',
    '/theme-boot.js',
];

// Role-specific pages: cached on-demand when visited (NOT pre-cached)
// Donors: donor-basket, donor-portal, donor-proof
// Homeowners: homeowner-portal, homeowner-report
// Professionals: contractor-portal, contractor-dashboard, tradesperson-portal,
//   supplier-dashboard, engineer-boq, engineer-camera
// Admin: admin-dashboard, admin-escrow, admin-oracle, admin-kyc, admin-revenue,
//   admin-fintech, compliance-dashboard

// Paths that must NEVER be cached (authentication, security tokens)
const NEVER_CACHE_PATHS = [
    '/api/auth/',
    '/api/csrf-token',
    '/api/client-errors',
    '/api/csp-report',
];

// P0-FIN-UX-001 FIX: Financial mutations MUST NOT be queued silently offline.
// If a user releases Escrow offline, it should fail immediately rather than 
// executing days later when they reconnect.
const NEVER_QUEUE_PATHS = [
    '/api/escrow/',
    '/api/wallet/',
    '/api/payments/',
    '/api/checkout/',
];

// ─── DB Constants for Offline Queue ─────────────────────────────────────────
const DB_NAME    = 'nammerha-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending-requests';

// ─── Install: Pre-cache App Shell ───────────────────────────────────────────
self.addEventListener('install', (event) => {
    // MEMO 58 FIX: skipWaiting() moved INSIDE waitUntil() to fix race condition.
    // Previous: skipWaiting() fired BEFORE cache was populated, causing the new
    // SW to take over with an empty cache while activate() deleted the old cache.
    // This created blank/broken pages during deployment transitions.
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then((cache) => cache.addAll(SHELL_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ─── Message: Skip Waiting on User Action ───────────────────────────────────
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// ─── Activate: Clean old caches ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    const currentCaches = new Set([SHELL_CACHE, API_CACHE, IMG_CACHE]);
    event.waitUntil(
        caches.keys()
            .then((names) => names.filter((n) => !currentCaches.has(n)))
            .then((old) => Promise.all(old.map((n) => caches.delete(n))))
            .then(() => self.clients.claim())
    );
});

// ─── Fetch: Route to appropriate strategy ───────────────────────────────────
// MEMO 58 FIX: Complete rewrite of fetch routing to fix Invisible Fix Pipeline.
// Previous: ALL assets (HTML, JS, CSS) used Cache-First, trapping users on stale
// content forever. Users had to visit TWICE to see any update.
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip: non-HTTP(S), browser-extension, Chrome DevTools
    if (!url.protocol.startsWith('http')) return;

    // Skip: Never-cache paths
    if (NEVER_CACHE_PATHS.some((p) => url.pathname.startsWith(p))) return;

    // ── API Requests ────────────────────────────────────────────────────
    if (url.pathname.startsWith('/api/')) {
        if (event.request.method === 'GET') {
            event.respondWith(networkFirstWithCache(event.request));
        } else {
            // POST/PUT/DELETE: try network, queue if offline (except financial paths)
            if (NEVER_QUEUE_PATHS.some((p) => url.pathname.startsWith(p))) {
                // Return browser default behavior (will fail immediately if offline)
                return;
            }
            event.respondWith(networkOrQueue(event.request));
        }
        return;
    }

    // ── HTML Documents: ALWAYS Network-First ─────────────────────────────
    // Users MUST see the latest HTML on every visit. Cache only as offline fallback.
    if (event.request.destination === 'document' ||
        url.pathname.endsWith('.html') ||
        url.pathname === '/') {
        event.respondWith(networkFirstWithCache(event.request));
        return;
    }

    // ── Image / Media Assets: Cache-First (rarely change) ───────────────
    if (isImageRequest(url.pathname)) {
        event.respondWith(cacheFirstWithNetwork(event.request, IMG_CACHE));
        return;
    }

    // ── Vite Hashed Assets: Cache-First (safe — filename changes on edit) ─
    // Vite outputs: /assets/main-wWnZ_oe8.js, /assets/auth-CC5Yhh1v.js
    // These have content hashes in filenames — Cache-First is correct and safe.
    if (isHashedAsset(url.pathname)) {
        event.respondWith(cacheFirstWithNetwork(event.request, SHELL_CACHE));
        return;
    }

    // ── Unhashed Public Files: Network-First ────────────────────────────
    // nav.js, i18n.js, i18n.css, theme-boot.js, etc. — no content hash,
    // so Cache-First would trap users on stale versions permanently.
    event.respondWith(networkFirstWithCache(event.request));
});

// ─── Helpers: Asset Classification ──────────────────────────────────────────

/**
 * Detects Vite-hashed assets by their filename pattern.
 * Vite outputs: /assets/{name}-{8+charHash}.{ext}
 * e.g., /assets/main-wWnZ_oe8.js, /assets/index-BAYU08n-.css
 */
function isHashedAsset(pathname) {
    return /\/assets\/[^/]+-[A-Za-z0-9_-]{7,}\.(js|css)$/.test(pathname);
}

// ─── Strategy: Network-First (API reads) ────────────────────────────────────
// Try network with a short timeout. If offline or slow, serve from cache.
// Always update cache with fresh response when network succeeds.
function networkFirstWithCache(request) {
    return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
            // Timeout — try cache
            caches.match(request).then((cached) => {
                if (cached) resolve(cached);
            });
        }, API_NETWORK_TIMEOUT_MS);

        fetch(request)
            .then((response) => {
                clearTimeout(timeoutId);
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(API_CACHE).then((cache) => cache.put(request, clone));
                }
                resolve(response);
            })
            .catch(() => {
                clearTimeout(timeoutId);
                caches.match(request).then((cached) => {
                    resolve(cached || offlineResponse('Unable to fetch data — you are offline'));
                });
            });
    });
}

// ─── Strategy: Cache-First (App Shell + Images) ─────────────────────────────
// Serve from cache immediately. Update cache in background for next visit.
function cacheFirstWithNetwork(request, cacheName) {
    return caches.match(request).then((cached) => {
        // Background update: fetch from network and update cache
        const networkUpdate = fetch(request)
            .then((response) => {
                if (response.ok) {
                    caches.open(cacheName).then((cache) => cache.put(request, response));
                }
                return response.clone();
            })
            .catch(() => null);

        // Return cached immediately, or wait for network
        if (cached) return cached;
        return networkUpdate.then((res) => res || offlineResponse('Resource unavailable offline'));
    });
}

// ─── Strategy: Network or Queue (API writes) ────────────────────────────────
// Try to send the request. If offline, save to IndexedDB for later replay.
function networkOrQueue(request) {
    return fetch(request.clone())
        .catch(() => {
            // Offline — queue the request for Background Sync
            return saveToQueue(request).then(() => {
                return new Response(
                    JSON.stringify({
                        success: true,
                        offline: true,
                        message: 'Saved offline — will sync when connection returns',
                        message_ar: 'تم الحفظ بدون اتصال — ستتم المزامنة عند عودة الاتصال',
                    }),
                    {
                        status: 202,
                        headers: { 'Content-Type': 'application/json' },
                    }
                );
            });
        });
}

// ─── IndexedDB: Save request to offline queue ───────────────────────────────
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

async function saveToQueue(request) {
    // PLATINUM FIX: Use blob() to preserve Binary Integrity for FormData (Photos/Attachments)
    const bodyBlob = await request.blob();
    const entry = {
        url: request.url,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        body: bodyBlob,
        timestamp: Date.now(),
        retries: 0,
    };

    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).add(entry);
        tx.oncomplete = () => {
            // Request Background Sync if available
            if (self.registration && self.registration.sync) {
                self.registration.sync.register('replay-queue').catch(() => {});
            }
            resolve();
        };
        tx.onerror = (e) => reject(e.target.error);
    });
}

// ─── Background Sync: Replay queued requests ────────────────────────────────
self.addEventListener('sync', (event) => {
    if (event.tag === 'replay-queue') {
        event.waitUntil(replayQueue());
    }
});

async function replayQueue() {
    const db = await openDB();

    const entries = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
    });

    for (const entry of entries) {
        try {
            // PLATINUM FIX: Dynamic CSRF Injection
            // The CSRF token in entry.headers might be stale (e.g. session expired while offline).
            // Fetch a fresh token using the current HttpOnly cookie before replaying.
            if (entry.method !== 'GET') {
                try {
                    const csrfRes = await fetch('/api/csrf-token', { credentials: 'same-origin' });
                    if (csrfRes.ok) {
                        const data = await csrfRes.json();
                        if (data.csrfToken) {
                            entry.headers['X-CSRF-Token'] = data.csrfToken;
                        }
                    }
                } catch (e) {
                    /* Non-fatal: if offline, the main fetch will fail anyway */
                }
            }

            const response = await fetch(entry.url, {
                method: entry.method,
                headers: entry.headers,
                body: entry.method !== 'GET' ? entry.body : undefined,
                credentials: 'same-origin',
            });

            if (response.ok || (response.status < 500 && ![401, 403, 419].includes(response.status))) {
                // Success or client validation error (except Auth/CSRF errors) — remove from queue
                await removeFromQueue(db, entry.id);
                notifyClients('sync-success', { url: entry.url, method: entry.method });
            } else if ([401, 403, 419].includes(response.status)) {
                // PLATINUM FIX: Auth/CSRF Error Guard
                // DO NOT DELETE the data! The session expired while offline.
                // Freeze the sync process for this entry and notify the client to re-auth.
                notifyClients('sync-auth-required', { url: entry.url });
                break; // Stop replaying queue until client re-authenticates
            } else if (entry.retries < 3) {
                // Server error — increment retry count
                await updateRetryCount(db, entry.id, entry.retries + 1);
            } else {
                // Max retries — remove and notify failure
                await removeFromQueue(db, entry.id);
                notifyClients('sync-failed', { url: entry.url, method: entry.method });
            }
        } catch {
            // Still offline — stop replaying, will retry on next sync
            break;
        }
    }
}

function removeFromQueue(db, id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}

function updateRetryCount(db, id, retries) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => {
            const entry = req.result;
            if (entry) {
                entry.retries = retries;
                store.put(entry);
            }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}

// ─── Client Notifications ───────────────────────────────────────────────────
function notifyClients(type, data) {
    self.clients.matchAll({ type: 'window' }).then((clients) => {
        for (const client of clients) {
            client.postMessage({ type, ...data });
        }
    });
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function isImageRequest(pathname) {
    return /\.(png|jpg|jpeg|gif|svg|webp|ico|avif)$/i.test(pathname);
}

function offlineResponse(message) {
    return new Response(
        JSON.stringify({
            success: false,
            offline: true,
            error: message,
            error_ar: 'أنت غير متصل بالإنترنت',
        }),
        {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
        }
    );
}
