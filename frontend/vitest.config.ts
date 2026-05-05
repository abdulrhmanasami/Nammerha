import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // TEST-GAP FIX: Frontend vitest configuration
        globals: true,
        // Default: node. Tests needing DOM use `// @vitest-environment jsdom` directive.
        environment: 'node',
        include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
        coverage: {
            reporter: ['text', 'lcov'],
            // GAP-P3/T1: Updated to include modular api/ directory + workers/
            include: ['src/utils/**', 'src/api/**', 'src/workers/**'],
        },
        // Match backend timeout
        testTimeout: 10_000,
    },
});
