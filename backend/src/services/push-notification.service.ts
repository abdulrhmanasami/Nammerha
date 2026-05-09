// ============================================================================
// Nammerha Backend — Push Notification Service (Platinum Standard)
// ============================================================================
// Dispatches push notifications to mobile devices via Firebase Cloud Messaging
// (FCM HTTP v1 API). Uses google-auth-library for automatic OAuth2 token
// generation and refresh — no static tokens, no manual rotation.
//
// IMPLEMENTS:
//   - Automatic OAuth2 access token via GCP Service Account (GoogleAuth)
//   - Token caching + auto-refresh (handled by google-auth-library internally)
//   - Token registry fetching (only active tokens)
//   - Silent unregistration for stale/revoked tokens
//   - Android notification channel targeting (nammerha_high_importance)
//   - APNs sound configuration for iOS
//   - Batch delivery with individual error handling
//
// AUTH MODES (in priority order):
//   1. FCM_SERVICE_ACCOUNT_JSON env var (inline JSON — Docker/K8s secrets)
//   2. GOOGLE_APPLICATION_CREDENTIALS env var (file path — GCP standard)
//   3. Application Default Credentials (GCE/Cloud Run auto-discovery)
//
// DEPENDS: Migration 040 (push_tokens table), google-auth-library
// ============================================================================

import { GoogleAuth } from 'google-auth-library';
import { query } from '../config/database';
import { logger } from '../utils/logger';

// ─── FCM Configuration ─────────────────────────────────────────────────────

const FCM_BASE_URL = 'https://fcm.googleapis.com/v1/projects/';
const FCM_MESSAGING_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

// Lazily initialized GoogleAuth client (singleton for the process lifetime)
let _authClient: GoogleAuth | null = null;

/**
 * Initialize the GoogleAuth client for FCM token generation.
 * Supports three authentication modes:
 *   1. Inline JSON via FCM_SERVICE_ACCOUNT_JSON (Docker secrets / K8s)
 *   2. File path via GOOGLE_APPLICATION_CREDENTIALS (GCP standard)
 *   3. Application Default Credentials (GCE auto-discovery)
 */
function getAuthClient(): GoogleAuth {
    if (_authClient) {return _authClient;}

    const inlineJson = process.env['FCM_SERVICE_ACCOUNT_JSON'];

    if (inlineJson) {
        // Mode 1: Inline JSON (Docker/K8s secrets — no file on disk)
        try {
            const credentials = JSON.parse(inlineJson) as Record<string, unknown>;
            _authClient = new GoogleAuth({
                credentials,
                scopes: [FCM_MESSAGING_SCOPE],
            });
            logger.info('FCM Auth: Initialized from inline service account JSON');
        } catch (err) {
            logger.error('FCM Auth: Failed to parse FCM_SERVICE_ACCOUNT_JSON', {
                error: err instanceof Error ? err.message : String(err),
            });
            throw new Error('Invalid FCM_SERVICE_ACCOUNT_JSON — must be valid JSON');
        }
    } else {
        // Mode 2/3: File path (GOOGLE_APPLICATION_CREDENTIALS) or ADC auto-discovery
        _authClient = new GoogleAuth({
            scopes: [FCM_MESSAGING_SCOPE],
        });

        const credsPath = process.env['GOOGLE_APPLICATION_CREDENTIALS'];
        if (credsPath) {
            logger.info('FCM Auth: Using service account from file', { path: credsPath });
        } else {
            logger.info('FCM Auth: Using Application Default Credentials (ADC)');
        }
    }

    return _authClient;
}

/**
 * Get a valid OAuth2 access token for the FCM v1 API.
 * google-auth-library handles caching and auto-refresh internally.
 * Returns null if authentication is not configured.
 */
async function getFcmAccessToken(): Promise<string | null> {
    try {
        const auth = getAuthClient();
        const client = await auth.getClient();
        const tokenResponse = await client.getAccessToken();
        return tokenResponse?.token ?? null;
    } catch (err) {
        logger.error('FCM Auth: Failed to obtain access token', {
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}

// ─── Notification Type Classification ──────────────────────────────────────

/**
 * Notification types for deep link routing on mobile.
 * Maps to the PushNotificationService.onNotificationTapped handler.
 */
export type NotificationType =
    | 'escrow_locked'
    | 'escrow_released'
    | 'donation_received'
    | 'bid_accepted'
    | 'bid_received'
    | 'proof_submitted'
    | 'proof_verified'
    | 'po_created'
    | 'po_shipped'
    | 'po_delivered'
    | 'project_update'
    | 'system'
    | 'general';

// ─── Main Push Dispatch ────────────────────────────────────────────────────

/**
 * Dispatch a push notification to all active devices of a user.
 *
 * @param userId - Target user's ID
 * @param title - Notification title (Arabic)
 * @param body - Notification body text
 * @param data - Optional structured data payload for deep linking
 */
export async function sendPushNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>
): Promise<void> {

    const projectId = process.env['FCM_PROJECT_ID'];
    if (!projectId) {
        logger.warn('Push notification skipped: FCM_PROJECT_ID not configured.', { userId });
        return;
    }

    const accessToken = await getFcmAccessToken();
    if (!accessToken) {
        logger.warn('Push notification skipped: Could not obtain FCM access token.', { userId });
        return;
    }

    // 1. Fetch active push tokens for the user
    const tokensResult = await query<{ token_id: string; device_token: string; platform: string }>(
        `SELECT token_id, device_token, platform FROM push_tokens
         WHERE user_id = $1 AND is_active = TRUE`,
        [userId]
    );

    if (tokensResult.rows.length === 0) {
        // Normal state: user has no mobile devices, skip push.
        return;
    }

    // 2. Dispatch to all active devices
    const fcmEndpoint = `${FCM_BASE_URL}${projectId}/messages:send`;
    const notificationType = (data?.['type'] as string) ?? 'general';

    // Serialize data values to strings (FCM requirement)
    const stringData: Record<string, string> = {
        type: notificationType,
    };
    if (data) {
        stringData['payload'] = JSON.stringify(data);
    }

    let successCount = 0;
    let failureCount = 0;

    for (const record of tokensResult.rows) {
        try {
            const payload = {
                message: {
                    token: record.device_token,
                    notification: {
                        title,
                        body,
                    },
                    data: stringData,
                    // Android-specific config
                    android: {
                        notification: {
                            // Target the high-importance channel (matches mobile PushNotificationService)
                            channel_id: 'nammerha_high_importance',
                            // Trust Blue accent color
                            color: '#0D47A1',
                            sound: 'default',
                            default_vibrate_timings: true,
                        },
                        priority: 'high' as const,
                    },
                    // iOS APNs config
                    apns: {
                        payload: {
                            aps: {
                                sound: 'default',
                                badge: 1,
                            },
                        },
                    },
                },
            };

            const response = await fetch(fcmEndpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json() as { error?: { status?: string; message?: string } };

                // 3. Stale Token Handling: Mark dead tokens as inactive
                // UNREGISTERED = user uninstalled app or revoked permissions.
                // INVALID_ARGUMENT = malformed or expired token.
                if (
                    response.status === 404 ||
                    errorData.error?.status === 'UNREGISTERED' ||
                    errorData.error?.status === 'INVALID_ARGUMENT'
                ) {
                    await query(
                        'UPDATE push_tokens SET is_active = FALSE WHERE token_id = $1',
                        [record.token_id]
                    );
                    logger.info('Deactivated stale push token', {
                        userId,
                        token_id: record.token_id,
                        reason: errorData.error?.status ?? 'HTTP 404',
                    });
                } else {
                    logger.error('FCM Push Delivery Failed', {
                        userId,
                        token_id: record.token_id,
                        status: response.status,
                        error: errorData.error?.message ?? JSON.stringify(errorData),
                    });
                }
                failureCount++;
            } else {
                successCount++;
            }

        } catch (err) {
            failureCount++;
            logger.error('FCM HTTP Request Failed', {
                userId,
                token_id: record.token_id,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    if (successCount > 0 || failureCount > 0) {
        logger.info('Push notification batch complete', {
            userId,
            total: tokensResult.rows.length,
            success: successCount,
            failed: failureCount,
        });
    }
}

