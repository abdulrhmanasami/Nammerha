import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    root: '.',
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
