// ============================================================================
// Nammerha — PM2 Ecosystem Configuration (GAP-AR2 PLATINUM)
// ============================================================================
//
// ⚠️  DEPRECATED FOR PRODUCTION — Docker Compose is the production deployment
//    method. See docker-compose.prod.yml for the canonical production stack.
//    This file is retained for LOCAL DEVELOPMENT cluster testing only.
//
//    Production: docker compose -f docker-compose.prod.yml --env-file .env up -d
//    Local dev:  pm2 start ecosystem.config.cjs
//
// ============================================================================
// Horizontal scaling via cluster mode. PM2 forks N worker processes (one per
// CPU core) and load-balances incoming requests across them using round-robin.
//
// If any worker crashes, PM2 automatically restarts it — zero downtime.
//
// Usage (LOCAL DEVELOPMENT ONLY):
//   pm2 start ecosystem.config.cjs              # Start all apps
//   pm2 reload ecosystem.config.cjs             # Zero-downtime reload
//   pm2 monit                                    # Real-time dashboard
//   pm2 logs nammerha-backend                   # Tail logs
//
// Environment:
//   NODE_ENV=production must be set for cluster mode optimizations.
//   PORT is auto-incremented per worker by PM2 (or use SO_REUSEPORT).
//
// Standard: 12-Factor App — Process Formation (Factor VI).
// ============================================================================

module.exports = {
    apps: [
        {
            // ── Backend API Server ──────────────────────────────────────────
            name: 'nammerha-backend',
            script: './dist/server.js',
            cwd: './backend',

            // Cluster mode: fork one worker per CPU core.
            // 'max' = auto-detect CPU count (optimal for dedicated servers).
            // Set to a fixed number (e.g., 2) for shared hosting.
            instances: 'max',
            exec_mode: 'cluster',

            // Zero-downtime restarts: new workers start before old ones die.
            wait_ready: true,
            listen_timeout: 10000,

            // Auto-restart on memory leak (fail-safe for long-running processes).
            // 512MB per worker — if exceeded, PM2 restarts the worker gracefully.
            max_memory_restart: '512M',

            // Exponential backoff restart delay: prevents crash loops.
            exp_backoff_restart_delay: 100,

            // Environment variables
            env_production: {
                NODE_ENV: 'production',
                PORT: 3001,
            },

            // Log configuration
            error_file: './logs/backend-error.log',
            out_file: './logs/backend-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
            merge_logs: true,
            max_size: '50M',
            max_restarts: 15,

            // Graceful shutdown: SIGINT first, then SIGKILL after 8s timeout.
            kill_timeout: 8000,
        },
    ],
};
