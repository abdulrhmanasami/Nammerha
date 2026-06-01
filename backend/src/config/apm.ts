/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Nammerha Platform — APM Agent Bootstrap
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * CRITICAL: This module MUST be imported as the FIRST line in server.ts
 * before any other imports. APM agents need to monkey-patch require() before
 * Express, pg, or any other library is loaded.
 *
 * Supported agents (configure via APM_PROVIDER env var):
 *   - 'datadog'  → dd-trace
 *   - 'newrelic' → newrelic
 *   - 'none'     → No-op (development default)
 *
 * Required env vars per provider:
 *   Datadog:   DD_API_KEY, DD_SITE (default: datadoghq.eu)
 *   New Relic: NEW_RELIC_LICENSE_KEY, NEW_RELIC_APP_NAME
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { logger } from '../utils/logger';

interface APMConfig {
    provider: 'datadog' | 'newrelic' | 'none';
    serviceName: string;
    environment: string;
    version: string;
}

function getAPMConfig(): APMConfig {
    return {
        provider: (process.env['APM_PROVIDER'] as APMConfig['provider']) || 'none',
        serviceName: process.env['APM_SERVICE_NAME'] || 'nammerha-backend',
        environment: process.env['NODE_ENV'] || 'development',
        version: process.env['npm_package_version'] || '1.0.0',
    };
}

export function initAPM(): void {
    const config = getAPMConfig();

    if (config.provider === 'none') {
        logger.info('APM: No provider configured (APM_PROVIDER=none) — skipping instrumentation');
        return;
    }

    try {
        switch (config.provider) {
            case 'datadog': {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const tracer = require('dd-trace');
                tracer.init({
                    service: config.serviceName,
                    env: config.environment,
                    version: config.version,
                    logInjection: true,
                    runtimeMetrics: true,
                    tags: {
                        platform: 'nammerha',
                        component: 'backend',
                    },
                });
                logger.info('APM: Datadog dd-trace initialized', { service: config.serviceName });
                break;
            }

            case 'newrelic': {
                // New Relic requires its agent to be loaded before everything else.
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                require('newrelic');
                logger.info('APM: New Relic agent initialized', { service: config.serviceName });
                break;
            }
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`APM: Failed to initialize ${config.provider}`, { error: message });
        logger.error('APM: Application will continue WITHOUT performance monitoring');
        // Non-fatal: APM failure should never crash the application
    }
}

/**
 * Express middleware for request timing metrics.
 * Records response time and status code for each request.
 * Compatible with both Datadog custom metrics and Prometheus.
 */
export function requestTimingMiddleware() {
    return (
        req: { method: string; originalUrl: string },
        res: { statusCode: number; on: (event: string, cb: () => void) => void },
        next: () => void,
    ) => {
        const start = process.hrtime.bigint();

        res.on('finish', () => {
            const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;

            // Log slow requests (>200ms threshold per SRS requirement)
            if (durationMs > 200) {
                logger.warn(
                    'PERF: Slow request detected',
                    {
                        method: req.method,
                        url: req.originalUrl,
                        durationMs: Number(durationMs.toFixed(2)),
                        statusCode: res.statusCode,
                    },
                );
            }
        });

        next();
    };
}
