#!/usr/bin/env node
/**
 * INC-02 + PERF-01 Migration Script
 * ═══════════════════════════════════
 * Phase 1 (INC-02): Standardize all dictionary keys to snake_case
 * Phase 2 (PERF-01): Split dictionary into engine + page-scoped chunks
 *
 * Usage: node scripts/i18n-migrate.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, basename } from 'path';

const ROOT = join(import.meta.dirname, '..');
const PUBLIC = join(ROOT, 'public');
const I18N_FILE = join(PUBLIC, 'i18n.js');
const I18N_DIR = join(PUBLIC, 'i18n');
const HTML_DIR = ROOT; // HTML files are at frontend root

// ═══════════════════════════════════════════════════════════════════════════
// Phase 1: INC-02 — Key Format Standardization
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert any string to snake_case
 */
function toSnakeCase(str) {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .replace(/_+/g, '_');
}

/**
 * Check if a key is already in valid snake_case format
 */
function isSnakeCase(key) {
    return /^[a-z][a-z0-9_]*$/.test(key);
}

/**
 * Extract all dictionary keys from i18n.js
 * Returns Map<string, { line: number, translations: string }>
 */
function extractDictKeys(content) {
    const keys = new Map();
    const lines = content.split('\n');
    // Match pattern: 'key_name': { ar: '...', de: '...', ... }
    const keyRegex = /^\s+'([^']+)':\s*\{(.+)\},?\s*$/;

    let inDict = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('var DICT = {')) { inDict = true; continue; }
        if (inDict && /^\s+\};/.test(line)) { inDict = false; continue; }
        if (!inDict) continue;

        const match = line.match(keyRegex);
        if (match) {
            keys.set(match[1], {
                line: i + 1,
                translations: match[2].trim(),
                fullLine: line,
            });
        }
    }
    return keys;
}

/**
 * Build the key migration map: old_key → new_snake_key
 * Only for keys that are NOT already snake_case
 */
function buildMigrationMap(keys) {
    const migrations = new Map(); // old → new
    const existingSnakeKeys = new Set();

    // First pass: collect all existing snake_case keys
    for (const key of keys.keys()) {
        if (isSnakeCase(key)) {
            existingSnakeKeys.add(key);
        }
    }

    // Second pass: map non-snake_case keys
    for (const key of keys.keys()) {
        if (isSnakeCase(key)) continue;
        const snake = toSnakeCase(key);

        if (existingSnakeKeys.has(snake)) {
            // Duplicate: both 'Add to Cart' and 'add_to_cart' exist
            // Mark for REMOVAL (the Sentence Case version is redundant)
            migrations.set(key, { newKey: snake, action: 'remove_duplicate' });
        } else {
            // New: rename key to snake_case
            migrations.set(key, { newKey: snake, action: 'rename' });
            existingSnakeKeys.add(snake);
        }
    }

    return migrations;
}

/**
 * Apply INC-02: Rewrite i18n.js with standardized keys
 */
function applyKeyStandardization(content, keys, migrations) {
    let result = content;

    // 1. Remove duplicate keys (Sentence Case that already have snake_case)
    // 2. Rename remaining non-snake_case keys to snake_case
    for (const [oldKey, { newKey, action }] of migrations) {
        const keyData = keys.get(oldKey);
        if (!keyData) continue;

        if (action === 'remove_duplicate') {
            // Remove the entire Sentence Case line
            result = result.replace(keyData.fullLine + '\n', '');
        } else if (action === 'rename') {
            // Replace key name, keep translations
            const oldEntry = `'${oldKey}':`;
            const newEntry = `'${newKey}':`;
            // Only replace within the DICT section (exact line match)
            result = result.replace(keyData.fullLine, keyData.fullLine.replace(oldEntry, newEntry));
        }
    }

    // 3. Update KEY_ALIASES: add old → new for all migrations
    const aliasEntries = [];
    for (const [oldKey, { newKey }] of migrations) {
        // Skip if already in KEY_ALIASES
        if (result.includes(`'${oldKey}': '${newKey}'`)) continue;
        aliasEntries.push(`        '${oldKey}': '${newKey}',`);
    }

    if (aliasEntries.length > 0) {
        // Insert new aliases into KEY_ALIASES object
        const aliasInsertPoint = '    var KEY_ALIASES = {';
        result = result.replace(
            aliasInsertPoint,
            aliasInsertPoint + '\n        // INC-02: Auto-generated aliases for backward compatibility\n' + aliasEntries.join('\n')
        );
    }

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2: PERF-01 — Dictionary Splitting
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Page-to-section mapping based on comments in i18n.js
 * Maps section headers to page-chunk filenames
 */
const SECTION_MAP = {
    // Core sections
    'NAVIGATION': 'common',
    'COMMON UI': 'common',
    'COMMON UI ELEMENTS': 'common',
    'SEARCH': 'common',
    'TRUST': 'common',
    'TRUST / ESCROW BANNER': 'common',
    'FUND NOW': 'common',
    'INTERACTIVE MAP': 'common',
    'ARIA-LABEL': 'common',
    'MATERIAL NAMES': 'common',
    'STATIC DATA': 'common',

    // Index/Dashboard
    'INDEX / DASHBOARD PAGE': 'index',
    'INDEX': 'index',

    // Project family
    'PROJECT DETAILS PAGE': 'project',
    'PROJECT DETAILS & ENGINEER': 'project',
    'DONOR BASKET PAGE': 'project',
    'DONOR PROOF PAGE': 'project',
    'ESCROW CHECKOUT': 'project',
    'ESCROW CHECKOUT / PROOF': 'project',

    // Engineer
    'ENGINEER BOQ PAGE': 'engineer',
    'ENGINEER CAMERA PAGE': 'engineer',

    // Homeowner
    'HOMEOWNER REPORT PAGE': 'homeowner',
    'HOMEOWNER PORTAL': 'homeowner',
    'HOMEOWNER DAMAGE': 'homeowner',

    // Admin
    'ADMIN DASHBOARD PAGE': 'admin',
    'ADMIN DASHBOARD NAV': 'admin',
    'ADMIN ESCROW PAGE': 'admin',
    'ADMIN KYC PAGE': 'admin',
    'ADMIN ORACLE PAGE': 'admin',
    'ADMIN FINTECH': 'admin',
    'ADMIN REVENUE': 'admin',
    'AUDITOR PORTAL': 'admin',
    'AUDITOR': 'admin',
    'KYC PAGE': 'admin',

    // Contractor
    'CONTRACTOR PORTAL': 'contractor',
    'CONTRACTOR DASHBOARD': 'contractor',

    // Supplier
    'SUPPLIER': 'supplier',

    // Tradesperson
    'TRADESPERSON PORTAL': 'tradesperson',

    // Donor
    'DONOR PORTAL': 'donor',

    // Profile / Wallet
    'PROFILE PAGE': 'profile',
    'WALLET PAGE': 'profile',

    // Auth
    'AUTH PAGE': 'auth',
    'VERIFY EMAIL': 'auth',
    'RESET PASSWORD': 'auth',

    // Pricing
    'PRICING PAGE': 'pricing',
    'PRICING': 'pricing',

    // Compliance
    'COMPLIANCE': 'compliance',

    // Contact
    'CONTACT PAGE': 'contact',
    'CONTACT FORM': 'contact',

    // Legal
    'LEGAL PAGE': 'legal',
    'LEGAL PAGES': 'legal',
    'PRIVACY PAGE': 'legal',
    'TERMS PAGE': 'legal',
    'REFUND POLICY': 'legal',
    'ABOUT PAGE': 'legal',
    'ABOUT US PAGE': 'legal',
    'ABOUT: ORIGIN': 'legal',
    'ABOUT: LEADERSHIP': 'legal',
    'ABOUT: OUR APPROACH': 'legal',
    'ABOUT: TRUST': 'legal',
};

/**
 * Parse the dictionary into page-scoped groups
 */
function splitDictBySection(content) {
    const lines = content.split('\n');
    const chunks = new Map(); // chunk_name → [{key, translations}]
    let currentChunk = 'common'; // default to common
    let inDict = false;

    const keyRegex = /^\s+'([^']+)':\s*\{(.+)\},?\s*$/;
    const sectionRegex = /\/\/\s*═+\s*(.+?)\s*═+/;

    for (const line of lines) {
        if (line.includes('var DICT = {')) { inDict = true; continue; }
        if (inDict && /^\s+\};/.test(line)) { inDict = false; continue; }
        if (!inDict) continue;

        // Check for section comment
        const sectionMatch = line.match(sectionRegex);
        if (sectionMatch) {
            const sectionName = sectionMatch[1].trim();
            for (const [pattern, chunk] of Object.entries(SECTION_MAP)) {
                if (sectionName.includes(pattern)) {
                    currentChunk = chunk;
                    break;
                }
            }
            continue;
        }

        // Check for FIX comments that contain section hints
        if (line.trim().startsWith('//')) {
            const fixSection = line.match(/(?:FIX|Wave \d).*?:\s*(.*?)(?:\s*—|\s*$)/);
            if (fixSection) {
                // Keep in current chunk
            }
            continue;
        }

        // Extract key
        const keyMatch = line.match(keyRegex);
        if (keyMatch) {
            if (!chunks.has(currentChunk)) chunks.set(currentChunk, []);
            chunks.get(currentChunk).push({
                key: keyMatch[1],
                translations: keyMatch[2].trim(),
            });
        }
    }

    return chunks;
}

/**
 * Generate a page-scoped dictionary JS file
 */
function generateChunkFile(chunkName, entries) {
    const dictEntries = entries
        .map(e => `        '${e.key}': { ${e.translations} }`)
        .join(',\n');

    return `/**
 * Nammerha i18n — ${chunkName} dictionary chunk
 * Auto-generated by INC-02/PERF-01 migration. DO NOT EDIT MANUALLY.
 * Keys: ${entries.length}
 */
(function () {
    'use strict';
    if (typeof window.__nmDictMerge === 'function') {
        window.__nmDictMerge({
${dictEntries}
        });
    }
})();
`;
}

/**
 * Update HTML files to load page-scoped dictionary chunk
 */
function getChunkForPage(pageName) {
    const map = {
        'index': 'index',
        'project-details': 'project',
        'donor-basket': 'project',
        'donor-proof': 'project',
        'engineer-boq': 'engineer',
        'engineer-camera': 'engineer',
        'homeowner-report': 'homeowner',
        'homeowner-portal': 'homeowner',
        'admin-dashboard': 'admin',
        'admin-escrow': 'admin',
        'admin-kyc': 'admin',
        'admin-oracle': 'admin',
        'admin-fintech': 'admin',
        'admin-revenue': 'admin',
        'contractor-portal': 'contractor',
        'contractor-dashboard': 'contractor',
        'supplier-dashboard': 'supplier',
        'tradesperson-portal': 'tradesperson',
        'donor-portal': 'donor',
        'profile': 'profile',
        'wallet': 'profile',
        'auth': 'auth',
        'verify-email': 'auth',
        'reset-password': 'auth',
        'pricing': 'pricing',
        'compliance-dashboard': 'compliance',
        'contact': 'contact',
        'privacy': 'legal',
        'terms': 'legal',
        'refund-policy': 'legal',
        'about': 'legal',
    };
    return map[pageName] || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3: Update HTML references
// ═══════════════════════════════════════════════════════════════════════════

function updateHTMLReferences(htmlDir, migrations) {
    const htmlFiles = readdirSync(htmlDir).filter(f => f.endsWith('.html'));
    let totalUpdates = 0;

    for (const file of htmlFiles) {
        const filePath = join(htmlDir, file);
        let content = readFileSync(filePath, 'utf-8');
        let fileUpdates = 0;

        for (const [oldKey, { newKey }] of migrations) {
            // Update data-i18n="Old Key" → data-i18n="new_key"
            const patterns = [
                [`data-i18n="${oldKey}"`, `data-i18n="${newKey}"`],
                [`data-i18n-placeholder="${oldKey}"`, `data-i18n-placeholder="${newKey}"`],
                [`data-i18n-aria="${oldKey}"`, `data-i18n-aria="${newKey}"`],
                [`data-i18n-html="${oldKey}"`, `data-i18n-html="${newKey}"`],
            ];

            for (const [find, replace] of patterns) {
                const count = (content.match(new RegExp(escapeRegex(find), 'g')) || []).length;
                if (count > 0) {
                    content = content.replaceAll(find, replace);
                    fileUpdates += count;
                }
            }
        }

        if (fileUpdates > 0) {
            writeFileSync(filePath, content);
            console.log(`  ✓ ${file}: ${fileUpdates} key references updated`);
            totalUpdates += fileUpdates;
        }
    }

    return totalUpdates;
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 4: Update i18n.js engine for dictionary chunking
// ═══════════════════════════════════════════════════════════════════════════

function addDictMergeAPI(content) {
    // Replace `var DICT = {` with the merge-ready pattern
    // and add __nmDictMerge method before the IIFE ends

    // Add merge function right before "// ─── State ───"
    const stateMarker = '    // ─── State ───';
    const mergeFunction = `    // ─── PERF-01: Dictionary Merge API ─────────────────────────────────────
    // Page-scoped dictionary files call __nmDictMerge() to register their keys.
    // This merges page keys into DICT at runtime — only the keys each page needs.
    window.__nmDictMerge = function(pageDict) {
        for (var key in pageDict) {
            if (pageDict.hasOwnProperty(key)) {
                DICT[key] = pageDict[key];
            }
        }
        // Re-translate if engine is already initialized
        if (currentLang && currentLang !== 'en') {
            translatePage(currentLang);
        }
    };

    ${stateMarker}`;

    content = content.replace(stateMarker, mergeFunction);

    return content;
}

function removePageKeysFromEngine(content, commonKeys) {
    // Keep ONLY keys that are in the 'common' chunk
    const lines = content.split('\n');
    const result = [];
    let inDict = false;
    let inDictContent = false;
    const keyRegex = /^\s+'([^']+)':\s*\{(.+)\},?\s*$/;
    const sectionRegex = /\/\/\s*═+\s*(.+?)\s*═+/;
    let currentSection = 'common';
    const commonKeySet = new Set(commonKeys.map(e => e.key));

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.includes('var DICT = {')) {
            inDict = true;
            inDictContent = true;
            result.push(line);
            continue;
        }

        if (inDict && /^\s+\};/.test(line)) {
            inDict = false;
            inDictContent = false;
            result.push(line);
            continue;
        }

        if (inDictContent) {
            // Check section comment
            const sectionMatch = line.match(sectionRegex);
            if (sectionMatch) {
                const name = sectionMatch[1].trim();
                let isCommon = false;
                for (const [pattern, chunk] of Object.entries(SECTION_MAP)) {
                    if (name.includes(pattern)) {
                        currentSection = chunk;
                        isCommon = chunk === 'common';
                        break;
                    }
                }
                if (isCommon) {
                    result.push(line);
                }
                continue;
            }

            // Check if it's a comment line
            if (line.trim().startsWith('//')) {
                if (currentSection === 'common') {
                    result.push(line);
                }
                continue;
            }

            // Check if it's a key line
            const keyMatch = line.match(keyRegex);
            if (keyMatch) {
                if (commonKeySet.has(keyMatch[1])) {
                    result.push(line);
                }
                // Skip non-common keys (they're in page chunks now)
                continue;
            }

            // Empty lines within common section
            if (line.trim() === '' && currentSection === 'common') {
                result.push(line);
            }
            continue;
        }

        result.push(line);
    }

    return result.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Execution
// ═══════════════════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════════');
console.log(' Nammerha i18n Migration: INC-02 + PERF-01');
console.log('═══════════════════════════════════════════════════════════════');

// Read current i18n.js
let content = readFileSync(I18N_FILE, 'utf-8');
const originalSize = Buffer.byteLength(content, 'utf-8');
console.log(`\n📊 Original: ${(originalSize / 1024).toFixed(1)}KB`);

// ─── Phase 1: INC-02 ─────────────────────────────────────────────────────
console.log('\n━━━ Phase 1: INC-02 — Key Format Standardization ━━━');
const keys = extractDictKeys(content);
console.log(`  Found ${keys.size} dictionary keys`);

const migrations = buildMigrationMap(keys);
const renames = [...migrations.values()].filter(m => m.action === 'rename').length;
const duplicates = [...migrations.values()].filter(m => m.action === 'remove_duplicate').length;
console.log(`  Migrations: ${renames} renames, ${duplicates} duplicate removals`);

content = applyKeyStandardization(content, keys, migrations);
console.log('  ✓ Dictionary keys standardized');

// Update HTML files
console.log('\n  Updating HTML references:');
const htmlUpdates = updateHTMLReferences(HTML_DIR, migrations);
console.log(`  ✓ Total: ${htmlUpdates} HTML references updated`);

// ─── Phase 2: PERF-01 ────────────────────────────────────────────────────
console.log('\n━━━ Phase 2: PERF-01 — Dictionary Splitting ━━━');

// Parse standardized content into page-scoped chunks
const chunks = splitDictBySection(content);
console.log(`  Found ${chunks.size} chunks:`);
for (const [name, entries] of chunks) {
    console.log(`    ${name}: ${entries.length} keys`);
}

// Create i18n/ directory
mkdirSync(I18N_DIR, { recursive: true });

// Generate page-scoped dictionary files
let totalChunkSize = 0;
for (const [name, entries] of chunks) {
    if (name === 'common') continue; // common stays in engine
    const chunkContent = generateChunkFile(name, entries);
    const chunkPath = join(I18N_DIR, `${name}.js`);
    writeFileSync(chunkPath, chunkContent);
    const chunkSize = Buffer.byteLength(chunkContent, 'utf-8');
    totalChunkSize += chunkSize;
    console.log(`  ✓ ${name}.js: ${entries.length} keys (${(chunkSize / 1024).toFixed(1)}KB)`);
}

// Add merge API and remove page keys from engine
content = addDictMergeAPI(content);
const commonEntries = chunks.get('common') || [];
content = removePageKeysFromEngine(content, commonEntries);

// Write updated engine
writeFileSync(I18N_FILE, content);
const newEngineSize = Buffer.byteLength(content, 'utf-8');
console.log(`\n  Engine: ${(newEngineSize / 1024).toFixed(1)}KB (was ${(originalSize / 1024).toFixed(1)}KB)`);
console.log(`  Chunks total: ${(totalChunkSize / 1024).toFixed(1)}KB`);
console.log(`  Per-page max: engine + largest chunk = ${((newEngineSize + Math.max(...[...chunks.values()].filter((_, i) => i > 0).map(e => Buffer.byteLength(JSON.stringify(e), 'utf-8')))) / 1024).toFixed(1)}KB`);

// ─── Phase 3: Update HTML script tags ────────────────────────────────────
console.log('\n━━━ Phase 3: Adding page-scoped dict script tags ━━━');
const htmlFiles = readdirSync(HTML_DIR).filter(f => f.endsWith('.html'));
let scriptUpdates = 0;

for (const file of htmlFiles) {
    const pageName = basename(file, '.html');
    const chunk = getChunkForPage(pageName);
    if (!chunk || chunk === 'common') continue;

    const filePath = join(HTML_DIR, file);
    let html = readFileSync(filePath, 'utf-8');

    // Check if already has chunk script
    if (html.includes(`/i18n/${chunk}.js`)) continue;

    // Insert chunk script AFTER the i18n.js script tag
    const i18nScriptPattern = /<script src="\/i18n\.js[^"]*"[^>]*><\/script>/;
    const match = html.match(i18nScriptPattern);
    if (match) {
        html = html.replace(match[0], `${match[0]}\n<script src="/i18n/${chunk}.js" defer></script>`);
        writeFileSync(filePath, html);
        console.log(`  ✓ ${file}: added /i18n/${chunk}.js`);
        scriptUpdates++;
    }
}
console.log(`  ✓ ${scriptUpdates} HTML files updated with chunk scripts`);

// ─── Summary ─────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(' Migration Complete!');
console.log(`  INC-02: ${renames + duplicates} keys standardized to snake_case`);
console.log(`  PERF-01: ${chunks.size - 1} page-scoped chunks created`);
console.log(`  Engine: ${(originalSize / 1024).toFixed(1)}KB → ${(newEngineSize / 1024).toFixed(1)}KB`);
console.log(`  Reduction: ${((1 - newEngineSize / originalSize) * 100).toFixed(0)}% per-page`);
console.log('═══════════════════════════════════════════════════════════════');
