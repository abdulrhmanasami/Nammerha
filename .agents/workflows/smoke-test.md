# Smoke Test Workflow

# Run this after any significant changes to verify platform health.

# Usage: /smoke-test

## Description

Automated smoke test that verifies TypeScript compilation, Flutter analysis,
and production build across all three codebases (frontend, backend, mobile).

## Steps

### Step 1: Frontend TypeScript Check

// turbo

```bash
cd /Users/abdulrahman/Github/Nammerha/frontend && npx tsc --noEmit 2>&1
```

**Expected:** Zero errors. If errors appear, stop and fix before continuing.

### Step 2: Backend TypeScript Check

// turbo

```bash
cd /Users/abdulrahman/Github/Nammerha/backend && npx tsc --noEmit 2>&1
```

**Expected:** Zero errors.

### Step 3: Frontend Production Build

// turbo

```bash
cd /Users/abdulrahman/Github/Nammerha/frontend && npm run build 2>&1 | tail -20
```

**Expected:** "✓ built in X.XXs" with zero errors. Warnings about chunk size are OK.

### Step 4: Flutter Analyze

// turbo

```bash
cd /Users/abdulrahman/Github/Nammerha/nammerha_mobile && flutter analyze 2>&1
```

**Expected:** Zero errors, zero warnings. Info-level messages are acceptable.

### Step 5: Report Results

Create a summary artifact with pass/fail for each step. Format:

```markdown
# 🧪 Smoke Test Results — [DATE]

| Check           | Result | Details               |
| --------------- | ------ | --------------------- |
| Frontend TSC    | ✅/❌  | [error count]         |
| Backend TSC     | ✅/❌  | [error count]         |
| Frontend Build  | ✅/❌  | [build time]          |
| Flutter Analyze | ✅/❌  | [error/warning count] |

**Verdict:** PASS / FAIL
```
