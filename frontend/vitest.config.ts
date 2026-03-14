import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // TEST-GAP FIX: Frontend vitest configuration
        globals: true,
        environment: 'node', // Pure logic tests — no DOM needed
        include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
        coverage: {
            reporter: ['text', 'lcov'],
            include: ['src/utils/**', 'src/api.ts'],
        },
        // Match backend timeout
        testTimeout: 10_000,
    },
});
