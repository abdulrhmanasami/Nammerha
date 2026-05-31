#!/usr/bin/env node
// ============================================================================
// Nammerha — Service Worker Cache Version Bumper
// ============================================================================
// MEMO 58 FIX: Replaces the fragile inline Node one-liner in package.json.
// MEMO 65 FIX: Now also updates `public/sw.js` (source) in addition to
// `dist/sw.js` (build output). Without this, the source file stays at 'v3'
// forever, and Docker builds (which copy source → build) produce stale
// cache versions. This ensures both local dev and Docker get fresh versions.
// ============================================================================

const fs = require('fs');
const path = require('path');

const DIST_SW_PATH = path.join(__dirname, '..', 'dist', 'sw.js');
const SRC_SW_PATH = path.join(__dirname, '..', 'public', 'sw.js');
const REGEX = /const CACHE_VERSION = '[^']+';/;

// ── Phase 1: Update dist/sw.js (required — this is what gets deployed) ──────

if (!fs.existsSync(DIST_SW_PATH)) {
    console.error('FATAL: dist/sw.js not found. Vite build may have failed.');
    process.exit(1);
}

const distContent = fs.readFileSync(DIST_SW_PATH, 'utf8');

if (!REGEX.test(distContent)) {
    console.error('FATAL: CACHE_VERSION pattern not found in dist/sw.js.');
    console.error('Expected: const CACHE_VERSION = \'...\';');
    process.exit(1);
}

const version = `v${Date.now()}`;
const updatedDist = distContent.replace(REGEX, `const CACHE_VERSION = '${version}';`);
fs.writeFileSync(DIST_SW_PATH, updatedDist, 'utf8');
console.log(`✅ SW Cache Version bumped to ${version}`);

// ── Phase 2: Update public/sw.js (source) — prevents stale Docker builds ────

if (fs.existsSync(SRC_SW_PATH)) {
    const srcContent = fs.readFileSync(SRC_SW_PATH, 'utf8');
    if (REGEX.test(srcContent)) {
        const updatedSrc = srcContent.replace(REGEX, `const CACHE_VERSION = '${version}';`);
        fs.writeFileSync(SRC_SW_PATH, updatedSrc, 'utf8');
        console.log(`✅ Source public/sw.js also bumped to ${version}`);
    } else {
        console.warn('⚠️  CACHE_VERSION pattern not found in public/sw.js — skipped.');
    }
} else {
    console.warn('⚠️  public/sw.js not found — source not updated (Docker will use dist).');
}
