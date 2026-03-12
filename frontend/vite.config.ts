import { defineConfig } from 'vite';
import { resolve } from 'path';
import seoLocalePlugin from './vite-plugin-seo-locale';

export default defineConfig({
    root: '.',
    // P2-NEW-001 FIX: Inject hreflang + localized SEO metadata into all HTML pages at build time
    plugins: [seoLocalePlugin()],
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                auth: resolve(__dirname, 'auth.html'),
                resetPassword: resolve(__dirname, 'reset-password.html'),
                verifyEmail: resolve(__dirname, 'verify-email.html'),
                wallet: resolve(__dirname, 'wallet.html'),
                profile: resolve(__dirname, 'profile.html'),
                homeownerReport: resolve(__dirname, 'homeowner-report.html'),
                engineerBoq: resolve(__dirname, 'engineer-boq.html'),
                engineerCamera: resolve(__dirname, 'engineer-camera.html'),
                projectDetails: resolve(__dirname, 'project-details.html'),
                donorBasket: resolve(__dirname, 'donor-basket.html'),
                donorProof: resolve(__dirname, 'donor-proof.html'),
                adminDashboard: resolve(__dirname, 'admin-dashboard.html'),
                adminOracle: resolve(__dirname, 'admin-oracle.html'),
                adminEscrow: resolve(__dirname, 'admin-escrow.html'),
                adminKyc: resolve(__dirname, 'admin-kyc.html'),
                // PLT-MAR11-003 FIX: 11 pages were missing from production build
                homeownerPortal: resolve(__dirname, 'homeowner-portal.html'),
                donorPortal: resolve(__dirname, 'donor-portal.html'),
                supplierDashboard: resolve(__dirname, 'supplier-dashboard.html'),
                contractorPortal: resolve(__dirname, 'contractor-portal.html'),
                contractorDashboard: resolve(__dirname, 'contractor-dashboard.html'),
                tradespersonPortal: resolve(__dirname, 'tradesperson-portal.html'),
                complianceDashboard: resolve(__dirname, 'compliance-dashboard.html'),
                contact: resolve(__dirname, 'contact.html'),
                terms: resolve(__dirname, 'terms.html'),
                privacy: resolve(__dirname, 'privacy.html'),
                refundPolicy: resolve(__dirname, 'refund-policy.html'),
            },
            // PLT-OPT-001: Deterministic code-splitting.
            // Extracts maplibre-gl (WebGL map engine, ~800KB) into its own chunk
            // so it's lazy-loaded only on pages that use the map. Other vendor
            // dependencies are grouped into a shared chunk for HTTP cache reuse.
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
