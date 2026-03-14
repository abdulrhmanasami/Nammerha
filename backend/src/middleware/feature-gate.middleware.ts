// ============================================================================
// Nammerha Backend — Feature Gate Middleware
// Restricts endpoints to users with specific subscription features.
// Follows the same pattern as requireRole() from role-guard.middleware.ts.
//
// Usage:
//   router.get('/boq/export/branded',
//     authMiddleware,
//     requireFeature('boq_whitelabel'),
//     handler
//   );
// ============================================================================
import { Request, Response, NextFunction } from 'express';
import { checkFeatureAccess } from '../services/subscription.service';
import { logger } from '../utils/logger';

/**
 * Creates a middleware that restricts access to users whose subscription
 * plan includes the specified feature.
 *
 * Must be used AFTER authMiddleware (req.authUser must be set).
 *
 * On denial, returns 403 with an upgrade_url hint for the frontend.
 */
export function requireFeature(featureSlug: string) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        if (!req.authUser) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return;
        }

        try {
            const access = await checkFeatureAccess(req.authUser.user_id, featureSlug);

            if (!access.allowed) {
                logger.info('Feature gate denied', {
                    userId: req.authUser.user_id,
                    feature: featureSlug,
                    currentPlan: access.plan_slug,
                    path: req.path,
                });

                res.status(403).json({
                    success: false,
                    error: 'This feature requires a premium subscription.',
                    feature: featureSlug,
                    current_plan: access.plan_slug,
                    upgrade_url: '/pricing.html',
                });
                return;
            }

            next();
        } catch (err) {
            logger.error('Feature gate middleware error', {
                error: err instanceof Error ? err.message : String(err),
                userId: req.authUser.user_id,
                feature: featureSlug,
            });
            // Fail-open would be dangerous — fail-closed instead
            res.status(500).json({
                success: false,
                error: 'Unable to verify feature access. Please try again.',
            });
        }
    };
}
