// ============================================================================
// Nammerha Backend — Push Notification Service (Phase 1.4)
// ============================================================================
// Dispatches push notifications to mobile devices via Firebase Cloud Messaging (FCM).
// Required for real-time mobile updates (e.g., Engineer PO creation, Donor match).
//
// IMPLEMENTS:
//   - Token registry fetching (only active tokens)
//   - FCM HTTP v1 API integration
//   - Silent unregistration for invalid/revoked tokens
//
// DEPENDS: Migration 040 (push_tokens table)
// ============================================================================

import { query } from '../config/database';
import { logger } from '../utils/logger';

// Default config: uses REST API over older SDK for minimal footprint
const FCM_URL = 'https://fcm.googleapis.com/v1/projects/';

/**
 * Returns a valid OAuth2 access token for the FCM v1 API.
 * In a full production setup, this would use google-auth-library.
 * For this phase, we securely resolve it from environment or return a placeholder.
 */
async function getFcmAccessToken(): Promise<string | null> {
    const rawToken = process.env['FCM_ACCESS_TOKEN'];
    if (rawToken) return rawToken;

    // Placeholder until GCP Service Account is injected
    return null;
}

/**
 * Dispatch a push notification to all active devices of a user.
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
        logger.warn('Push notification skipped: FCM_ACCESS_TOKEN not available.', { userId });
        return;
    }

    // 1. Fetch active push tokens for the user
    const tokensResult = await query<{ token_id: string; device_token: string }>(
        `SELECT token_id, device_token FROM push_tokens
         WHERE user_id = $1 AND is_active = TRUE`,
        [userId]
    );

    if (tokensResult.rows.length === 0) {
        // Normal state: user has no mobile devices, skip push.
        return;
    }

    // 2. Prepare FCM Request Queue
    const fcmEndpoint = `${FCM_URL}${projectId}/messages:send`;
    
    // We send individual requests instead of multicast (multicast is deprecated in HTTP v1)
    for (const record of tokensResult.rows) {
        try {
            const payload = {
                message: {
                    token: record.device_token,
                    notification: {
                        title,
                        body,
                    },
                    data: {
                        // FCM data values must be strings
                        payload: data ? JSON.stringify(data) : '',
                    },
                    // Specific APNs (iOS) config for silent/sound
                    apns: {
                        payload: {
                            aps: { sound: 'default' }
                        }
                    }
                }
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
                const errorData = await response.json() as { error?: { status?: string } };
                
                // 3. Stale Token Handling: Mark dead tokens as inactive
                // UNREGISTERED means the user uninstalled the app or revoked permissions.
                if (
                    response.status === 404 || 
                    (errorData.error?.status === 'UNREGISTERED' || errorData.error?.status === 'INVALID_ARGUMENT')
                ) {
                    await query(
                        'UPDATE push_tokens SET is_active = FALSE WHERE token_id = $1',
                        [record.token_id]
                    );
                    logger.info('Deactivated stale push token', { userId, token_id: record.token_id });
                } else {
                    logger.error('FCM Push Delivery Failed', { 
                        userId, 
                        status: response.status, 
                        error: errorData 
                    });
                }
            } else {
                logger.info('Push notification delivered', { userId, token_id: record.token_id });
            }

        } catch (err) {
            logger.error('FCM HTTP Request Failed', { 
                userId, 
                error: err instanceof Error ? err.message : String(err) 
            });
        }
    }
}
