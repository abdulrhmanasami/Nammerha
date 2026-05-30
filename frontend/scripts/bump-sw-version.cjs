#!/usr/bin/env node
// ============================================================================
// Nammerha — Service Worker Cache Version Bumper
// ============================================================================
// MEMO 58 FIX: Replaces the fragile inline Node one-liner in package.json.
// Previous: The inline script used `if(fs.existsSync(file))` which silently
// failed if the file was missing, leaving users on stale SW caches.
// Now: Explicit error if dist/sw.js is missing. Version is bumped to a
// timestamp to guarantee cache invalidation on every deploy.
// ============================================================================

const fs = require('fs');
const path = require('path');

const SW_PATH = path.join(__dirname, '..', 'dist', 'sw.js');
const REGEX = /const CACHE_VERSION = '[^']+';/;

if (!fs.existsSync(SW_PATH)) {
    console.error('FATAL: dist/sw.js not found. Vite build may have failed.');
    process.exit(1);
}

const content = fs.readFileSync(SW_PATH, 'utf8');

if (!REGEX.test(content)) {
    console.error('FATAL: CACHE_VERSION pattern not found in dist/sw.js.');
    console.error('Expected: const CACHE_VERSION = \'...\';');
    process.exit(1);
}

const version = `v${Date.now()}`;
const updated = content.replace(REGEX, `const CACHE_VERSION = '${version}';`);
fs.writeFileSync(SW_PATH, updated, 'utf8');

console.log(`✅ SW Cache Version bumped to ${version}`);
