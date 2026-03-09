// ============================================================================
// Nammerha — Playwright E2E Test Configuration
// Report §6.3: Cross-Browser & Compatibility Testing
// ============================================================================
// Run: npx playwright test
// ============================================================================

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    retries: 1,
    workers: 2,

    use: {
        baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },

    // Cross-browser matrix (Report §6.3)
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
        },
        // Mobile viewports
        {
            name: 'mobile-chrome',
            use: { ...devices['Pixel 5'] },
        },
        {
            name: 'mobile-safari',
            use: { ...devices['iPhone 13'] },
        },
    ],

    // Dev server (auto-start for local testing)
    webServer: {
        command: 'cd frontend && npm run dev',
        port: 3000,
        reuseExistingServer: true,
    },
});
