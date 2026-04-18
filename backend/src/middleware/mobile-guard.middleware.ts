// ============================================================================
// Nammerha Backend — Mobile Guard Middleware (Phase 1.3)
// ============================================================================
// Validates client telemetry headers and enforces API versioning.
// Prevents outdated/vulnerable mobile app versions from accessing the backend.
//
// Headers expected:
// - X-App-Version: '1.0.0'
// - X-API-Version: '2026.1'
// - X-Platform: 'ios' | 'android' | 'web'
// - X-Device-Model: 'iPhone 16'
// - X-OS-Version: 'iOS 18.2'
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/** Minimum required App version for mobile clients to connect */
const MIN_APP_VERSION = process.env['MIN_MOBILE_APP_VERSION'] ?? '1.0.0';

/** Current API contract version */
const CURRENT_API_VERSION = '2026.1';

/** Helper to compare semantic versions */
function isVersionGTE(clientVersion: string, minVersion: string): boolean {
    const v1 = clientVersion.split('.').map(Number);
    const v2 = minVersion.split('.').map(Number);
    for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
        const p1 = v1[i] ?? 0;
        const p2 = v2[i] ?? 0;
        if (p1 > p2) return true;
        if (p1 < p2) return false;
    }
    return true; // equal
}

/**
 * Validates mobile client headers and forces an upgrade if the
 * app is too old or using a deprecated API contract.
 */
export function mobileGuardMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const platform = req.headers['x-platform'] as string | undefined;

    // Only apply to mobile apps (skip web browsers as they auto-update)
    if (platform === 'ios' || platform === 'android') {
        const appVersion = req.headers['x-app-version'] as string | undefined;
        const apiVersion = req.headers['x-api-version'] as string | undefined;

        if (!appVersion) {
            res.status(400).json({
                success: false,
                error: 'Missing X-App-Version header. Please update your app.',
                action: 'force_upgrade'
            });
            return;
        }

        if (!apiVersion) {
            res.status(400).json({
                success: false,
                error: 'Missing X-API-Version header. Please update your app.',
                action: 'force_upgrade'
            });
            return;
        }

        // 1. Check API Version (Breaking changes)
        if (apiVersion !== CURRENT_API_VERSION) {
            logger.warn('Client connected with deprecated API version', {
                platform, appVersion, apiVersion, expected: CURRENT_API_VERSION
            });
            res.status(426).json({ // 426 Upgrade Required
                success: false,
                error: 'This version of the app is no longer supported. Please update from the App Store / Google Play.',
                action: 'force_upgrade'
            });
            return;
        }

        // 2. Check Semantic App Version
        if (!isVersionGTE(appVersion, MIN_APP_VERSION)) {
            res.status(426).json({
                success: false,
                error: `App version ${appVersion} is deprecated. Minimum required version is ${MIN_APP_VERSION}.`,
                action: 'force_upgrade'
            });
            return;
        }

        // Optionally store these in request for downstream telemetry
        (req as any).clientTelemetry = {
            platform,
            appVersion,
            apiVersion,
            deviceModel: req.headers['x-device-model'] as string | undefined,
            osVersion: req.headers['x-os-version'] as string | undefined,
            deviceId: req.headers['x-device-id'] as string | undefined
        };
    }

    next();
}
