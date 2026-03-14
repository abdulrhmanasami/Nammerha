import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import seoLocalePlugin from './vite-plugin-seo-locale';

// ─── VITE-001 FIX: Dynamic HTML entry point discovery ───────────────────────
// Replaces the manual 21-entry list with a glob scan of root *.html files.
// New pages are automatically included in the build — no config edits needed.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function discoverHtmlEntries(rootDir: string): Record<string, string> {
    const entries: Record<string, string> = {};
    const htmlFiles = readdirSync(rootDir).filter((f: string) => f.endsWith('.html'));

    for (const file of htmlFiles) {
        // Convert "homeowner-portal.html" → "homeownerPortal"
        const name = file
            .replace('.html', '')
            .replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase());
        entries[name] = resolve(rootDir, file);
    }

    return entries;
}

export default defineConfig({
    root: '.',
    // P2-NEW-001 FIX: Inject hreflang + localized SEO metadata into all HTML pages at build time
    plugins: [seoLocalePlugin()],
    build: {
        rollupOptions: {
            // VITE-001 FIX: Auto-discovers all *.html files in the project root.
            // Previously required manual updates for each of 21+ pages.
            input: discoverHtmlEntries(__dirname),
            // PLT-OPT-001: Deterministic code-splitting.
            output: {
                manualChunks(id: string) {
                    if (id.includes('node_modules/maplibre-gl')) {
                        return 'vendor-maps';
                    }
                    if (id.includes('node_modules')) {
                        return 'vendor';
                    }
                },
            },
        },
    },
    server: {
        port: 3000,
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
            },
        },
    },
});
