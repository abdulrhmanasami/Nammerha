// ============================================================================
// Nammerha — k6 Load Test Configuration
// Report §6.2: Performance & Stress Testing
// ============================================================================
// Run: k6 run tests/performance/k6-load-test.js
// Or: docker run --rm -i grafana/k6 run - <tests/performance/k6-load-test.js
// ============================================================================

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ─── Custom Metrics ─────────────────────────────────────────────────────────
const errorRate = new Rate('errors');
const ttfb = new Trend('ttfb', true);

// ─── Test Configuration ─────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'https://nammerha.com';

export const options = {
    // Ramp-up pattern: gradual increase to simulate real traffic
    stages: [
        { duration: '30s', target: 20 },    // Warm-up: 0 → 20 users
        { duration: '1m', target: 50 },    // Ramp: 20 → 50 users
        { duration: '2m', target: 100 },   // Peak: 50 → 100 concurrent users
        { duration: '1m', target: 100 },   // Sustain peak for 1 min
        { duration: '30s', target: 0 },     // Ramp-down
    ],

    // Acceptance thresholds (Report §6.2)
    thresholds: {
        http_req_duration: ['p(95)<2000'],    // 95th percentile < 2 seconds
        http_req_failed: ['rate<0.01'],     // Error rate < 1%
        ttfb: ['p(95)<500'],     // TTFB 95th percentile < 500ms
        errors: ['rate<0.01'],     // Custom error rate < 1%
    },
};

// ─── Scenario: Public Marketplace Browse ────────────────────────────────────
export default function () {
    // 1. Homepage load
    const homeRes = http.get(`${BASE_URL}/`);
    check(homeRes, {
        'homepage returns 200': (r) => r.status === 200,
        'homepage has content': (r) => (r.body?.length ?? 0) > 100,
    }) || errorRate.add(1);
    ttfb.add(homeRes.timings.waiting);

    sleep(1);

    // 2. Health check (verifies backend + DB connectivity)
    const healthRes = http.get(`${BASE_URL}/health`);
    check(healthRes, {
        'health check returns 200': (r) => r.status === 200,
        'health status is healthy': (r) => {
            try {
                const body = JSON.parse(r.body ?? '{}');
                return body.status === 'healthy';
            } catch {
                return false;
            }
        },
    }) || errorRate.add(1);
    ttfb.add(healthRes.timings.waiting);

    sleep(0.5);

    // 3. Marketplace API (public, no auth required)
    const marketRes = http.get(`${BASE_URL}/api/marketplace/projects?limit=10`);
    check(marketRes, {
        'marketplace returns 200': (r) => r.status === 200,
        'marketplace returns JSON': (r) => {
            const ct = r.headers['Content-Type'] ?? '';
            return ct.includes('application/json');
        },
    }) || errorRate.add(1);
    ttfb.add(marketRes.timings.waiting);

    sleep(1);

    // 4. Static asset load (CSS/JS — tests CDN/Nginx caching)
    const staticRes = http.get(`${BASE_URL}/fonts/phosphor/phosphor.css`);
    check(staticRes, {
        'static asset returns 200': (r) => r.status === 200,
        'static has cache headers': (r) => {
            const cc = r.headers['Cache-Control'] ?? '';
            return cc.includes('public') || cc.includes('max-age');
        },
    }) || errorRate.add(1);

    sleep(0.5);
}
