# Visual Audit Workflow

# Run this to capture screenshots of every page for visual verification.

# Usage: /visual-audit

## Description

Opens every Nammerha page in the browser agent and captures screenshots
to verify layout, RTL alignment, dark mode, and text containment.

## Steps

### Step 1: Start Dev Server

```bash
cd /Users/abdulrahman/Github/Nammerha/frontend && npm run dev -- --host 0.0.0.0 --port 5173 &
sleep 3
echo "Dev server started"
```

### Step 2: Audit Each Page

For each URL in the following list, use the browser subagent to:

1. Navigate to the URL
2. Wait for the page to fully load (3 seconds)
3. Capture a screenshot
4. Switch to dark mode (click theme toggle if available)
5. Capture a dark mode screenshot
6. Note any visual issues (text overflow, overlap, broken layout)

**Pages to audit:**

- `http://localhost:5173/`
- `http://localhost:5173/auth.html`
- `http://localhost:5173/profile.html`
- `http://localhost:5173/projects.html`
- `http://localhost:5173/project-details.html`
- `http://localhost:5173/about.html`
- `http://localhost:5173/homeowner-portal.html`
- `http://localhost:5173/homeowner-report.html`
- `http://localhost:5173/contractor-portal.html`
- `http://localhost:5173/engineer-portal.html`
- `http://localhost:5173/tradesperson-portal.html`
- `http://localhost:5173/supplier-dashboard.html`
- `http://localhost:5173/wallet.html`
- `http://localhost:5173/pricing.html`

### Step 3: Generate Report

Create a walkthrough artifact with ALL screenshots embedded, organized by page.
Flag any issues found with severity levels:

- 🔴 **CRITICAL:** Broken layout, unreadable text, non-functional
- 🟡 **WARNING:** Minor misalignment, inconsistent spacing
- 🟢 **PASS:** No issues found

### Step 4: Stop Dev Server

```bash
kill %1 2>/dev/null || true
```
