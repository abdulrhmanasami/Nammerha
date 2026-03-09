import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: ['src/routes/**', 'src/services/**', 'src/middleware/**'],
        },
        env: {
            NODE_ENV: 'development',
            JWT_SECRET: 'test-secret-key-for-vitest-never-use-in-production',
            DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
            PAYMENT_WEBHOOK_SECRET: 'test-webhook-secret-for-vitest-never-use-in-production',
        },
        testTimeout: 10000,
    },
});
