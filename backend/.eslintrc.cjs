/** @type {import('eslint').Linter.Config} */
module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
    },
    plugins: ['@typescript-eslint', 'security'],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:security/recommended-legacy',
    ],
    env: {
        node: true,
        es2022: true,
    },
    rules: {
        // ─── Type Safety (FinTech mandate) ───────────────────────────────────────
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-non-null-assertion': 'warn',

        // ─── Security Rules ──────────────────────────────────────────────────────
        'no-eval': 'error',
        'no-implied-eval': 'error',
        'no-new-func': 'error',
        'security/detect-eval-with-expression': 'error',
        'security/detect-non-literal-regexp': 'warn',
        'security/detect-non-literal-fs-filename': 'warn',
        'security/detect-object-injection': 'warn',
        'security/detect-possible-timing-attacks': 'warn',

        // ─── Code Quality ────────────────────────────────────────────────────────
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        'no-debugger': 'error',
        'no-var': 'error',
        'prefer-const': 'error',
        'eqeqeq': ['error', 'always'],
        'curly': ['error', 'all'],
        'no-throw-literal': 'error',
        'no-return-await': 'warn',
        'require-await': 'warn',
    },
    ignorePatterns: ['dist/', 'node_modules/', '*.js', '!.eslintrc.cjs'],
};
