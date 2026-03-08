/** @type {import('eslint').Linter.Config} */
module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
    },
    plugins: ['@typescript-eslint'],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
    ],
    env: {
        browser: true,
        es2022: true,
    },
    rules: {
        // ─── Type Safety ─────────────────────────────────────────────────────────
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

        // ─── Security (client-side) ──────────────────────────────────────────────
        'no-eval': 'error',
        'no-implied-eval': 'error',
        'no-new-func': 'error',

        // ─── Code Quality ────────────────────────────────────────────────────────
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        'no-debugger': 'error',
        'no-var': 'error',
        'prefer-const': 'error',
        'eqeqeq': ['error', 'always'],
        'curly': ['error', 'all'],
    },
    ignorePatterns: ['dist/', 'node_modules/', '*.js', '!.eslintrc.cjs'],
};
